import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { requestsApi } from "@/services/api";
import { useMeta } from "@/hooks/useMeta";
import { useRequireAuth } from "@/hooks/useAuth";
import { label, timeAgo, timeLeft } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input, SearchBar, Select, Textarea } from "@/components/ui/Form";
import { Avatar, Badge, CardSkeletonGrid, EmptyState, ErrorState } from "@/components/ui/Display";
import { Modal } from "@/components/ui/Modal";
import { CategoryChips } from "@/features/listings/CategoryChips";
import type { WantedRequest } from "@/types";

const schema = z.object({
  title: z.string().trim().min(3, "At least 3 characters").max(80),
  description: z.string().trim().min(10, "At least 10 characters").max(1000),
  category: z.string().min(1),
  locality: z.string().min(2, "Choose a neighbourhood"),
  quantity_note: z.string().max(60).optional(),
  expires_in_days: z.coerce.number().int().min(1).max(30),
});
type Values = z.infer<typeof schema>;

function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: { category: "books", expires_in_days: 30, locality: "" },
  });
  const submit = handleSubmit(async (v) => {
    try {
      const r = await requestsApi.create(v);
      toast.success("Request posted");
      navigate(`/wanted/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  return (
    <Modal open={open} onClose={onClose} title="Ask your neighbourhood" testId="new-request-modal">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="What do you need?" error={errors.title?.message}><Input {...register("title")} placeholder="Class 8 maths textbook" data-testid="request-title-input" /></Field>
        <Field label="Details" error={errors.description?.message}><Textarea {...register("description")} data-testid="request-description-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select {...register("category")} data-testid="request-category-select">{meta?.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></Field>
          <Field label="Neighbourhood" error={errors.locality?.message}>
            <Select {...register("locality")} data-testid="request-locality-select"><option value="">Choose</option>{meta?.localities.map((l) => <option key={l.name}>{l.name}</option>)}</Select>
          </Field>
          <Field label="Quantity (optional)"><Input {...register("quantity_note")} placeholder="2 pieces" data-testid="request-quantity-input" /></Field>
          <Field label="Keep open for"><Select {...register("expires_in_days")} data-testid="request-expiry-select"><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></Select></Field>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} data-testid="request-submit-btn">Post request</Button>
      </form>
    </Modal>
  );
}

export function RequestCard({ r }: { r: WantedRequest }) {
  return (
    <Link to={`/wanted/${r.id}`} className="card block p-5 transition-colors hover:border-olive/30" data-testid={`request-card-${r.id}`}>
      <div className="flex items-center justify-between gap-2">
        <Badge>{label(r.category)}</Badge>
        {r.status === "open" ? <span className="text-xs text-muted">{timeLeft(r.expires_at)}</span> : <Badge tone="walnut">{label(r.status)}</Badge>}
      </div>
      <h3 className="mt-4 font-display text-xl text-ink">{r.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-muted">{r.description}</p>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        <Avatar name={r.owner?.display_name} fileId={r.owner?.avatar_file_id} size={24} />
        <span>{r.owner?.display_name} · {r.locality} · {timeAgo(r.created_at)}</span>
      </div>
    </Link>
  );
}

export default function WantedPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);
  const guard = useRequireAuth();
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["requests", q, category],
    queryFn: ({ pageParam }) => requestsApi.browse({ q, category, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.has_more ? l.page + 1 : undefined),
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Wanted</p>
          <h1 className="mt-2 text-4xl text-olive sm:text-5xl">Neighbours are looking for…</h1>
          <p className="mt-3 max-w-lg text-muted">Have one of these lying around? Offer one of your listings and make someone's day.</p>
        </div>
        <Button onClick={() => guard(() => setOpen(true))} data-testid="new-request-btn"><Plus className="h-4 w-4" />Post a request</Button>
      </div>
      <div className="mt-8 space-y-4">
        <SearchBar value={q} onChange={setQ} placeholder="Search requests" testId="wanted-search-input" />
        <CategoryChips value={category} onChange={setCategory} />
      </div>
      <div className="mt-8">
        {isLoading ? <CardSkeletonGrid count={3} /> : error ? <ErrorState message={(error as Error).message} onRetry={refetch} /> :
          items.length ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((r) => <RequestCard key={r.id} r={r} />)}</div>
              {hasNextPage && <div className="mt-10 flex justify-center"><Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>Load more</Button></div>}
            </>
          ) : <EmptyState testId="wanted-empty" title="No open requests" body="Need something? Post a request and let your neighbours help." />}
      </div>
      <NewRequestDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
