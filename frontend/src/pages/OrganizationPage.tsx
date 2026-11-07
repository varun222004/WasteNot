import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BadgeCheck, FileCheck2, Plus } from "lucide-react";
import { ApiError } from "@/lib/api";
import { filesApi, orgsApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useMeta } from "@/hooks/useMeta";
import { formatDateTime, label } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Badge, EmptyState, ErrorState, Skeleton, Stat } from "@/components/ui/Display";
import { ListingCard } from "@/features/listings/ListingCard";

const CATS = ["restaurant", "ngo", "campus", "community_kitchen", "caterer", "retailer", "other"];
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10, "At least 10 characters").max(1000),
  category: z.string(),
  contact_email: z.string().email("Enter a valid email"),
  contact_phone: z.string().trim().min(6, "Enter a phone number").max(20),
  address: z.string().trim().min(5, "Enter the public address").max(200),
  locality: z.string().min(2, "Choose a neighbourhood"),
});
type Values = z.infer<typeof schema>;

function RegisterForm() {
  const { data: meta } = useMeta();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const [proof, setProof] = useState<{ id: string; name: string } | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { category: "ngo", locality: "" } });
  const upload = async (f: File | undefined, kind: "org_proof" | "org_logo") => {
    if (!f) return;
    try {
      const { id } = await filesApi.upload(f, kind);
      if (kind === "org_proof") setProof({ id, name: f.name }); else setLogo(id);
    } catch (e) { toast.error((e as Error).message); }
  };
  const submit = handleSubmit(async (v) => {
    if (!proof) return toast.error("Upload a proof document");
    const loc = meta?.localities.find((l) => l.name === v.locality)!;
    try {
      await orgsApi.register({ ...v, location: { lat: loc.lat, lng: loc.lng }, proof_file_id: proof.id, logo_file_id: logo });
      toast.success("Submitted for verification");
      await refresh();
      qc.invalidateQueries({ queryKey: ["org"] });
    } catch (e) { toast.error((e as Error).message); }
  });
  return (
    <form onSubmit={submit} className="mt-8 space-y-5" noValidate data-testid="org-register-form">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Organization name" error={errors.name?.message}><Input {...register("name")} data-testid="org-name-input" /></Field>
        <Field label="Type"><Select {...register("category")} data-testid="org-category-select">{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
      </div>
      <Field label="About" error={errors.description?.message}><Textarea {...register("description")} data-testid="org-description-input" /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Contact email" error={errors.contact_email?.message}><Input type="email" {...register("contact_email")} data-testid="org-email-input" /></Field>
        <Field label="Contact phone" error={errors.contact_phone?.message} hint="Visible only to WasteNot admins"><Input {...register("contact_phone")} data-testid="org-phone-input" /></Field>
      </div>
      <Field label="Public address" error={errors.address?.message} hint="Shown on your verified listings"><Input {...register("address")} data-testid="org-address-input" /></Field>
      <Field label="Neighbourhood" error={errors.locality?.message}>
        <Select {...register("locality")} data-testid="org-locality-select"><option value="">Choose</option>{meta?.localities.map((l) => <option key={l.name}>{l.name}</option>)}</Select>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Proof document" hint="Registration certificate, FSSAI licence or similar. PDF or image. Private to admins.">
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-olive/40 bg-white px-3.5 text-sm">
            <FileCheck2 className="h-4 w-4 text-olive" />{proof ? proof.name : "Upload proof"}
            <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0], "org_proof")} data-testid="org-proof-input" />
          </label>
        </Field>
        <Field label="Logo (optional)">
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-white px-3.5 text-sm">
            {logo ? "Logo uploaded" : "Upload logo"}
            <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0], "org_logo")} data-testid="org-logo-input" />
          </label>
        </Field>
      </div>
      <Button type="submit" size="lg" loading={isSubmitting} data-testid="org-submit-btn">Submit for verification</Button>
    </form>
  );
}

function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["org", "dashboard"], queryFn: orgsApi.dashboard, refetchInterval: 30_000 });
  if (isLoading) return <Skeleton className="mt-8 h-64" />;
  if (error || !data) return <ErrorState message={(error as Error)?.message ?? "Error"} />;
  const o = data.organization;
  const tone = { verified: "olive", pending: "amber", rejected: "danger", suspended: "danger" } as const;
  return (
    <div className="mt-6 space-y-10" data-testid="org-dashboard">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone[o.status]} testId="org-status-badge">{o.status === "verified" && <BadgeCheck className="h-3.5 w-3.5" />}{label(o.status)}</Badge>
        <span className="text-sm text-muted">{o.address}</span>
      </div>
      {o.status === "pending" && <p className="rounded-xl2 bg-amber-100/70 p-4 text-sm text-walnut">Our team is reviewing your documents. You'll get a notification once verified.</p>}
      {o.review_note && o.status !== "verified" && <p className="rounded-xl2 bg-danger-100 p-4 text-sm text-danger">Review note: {o.review_note}</p>}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat value={data.stats.active_listings} label="Active listings" />
        <Stat value={data.stats.open_reservations} label="Open reservations" />
        <Stat value={data.stats.completed_collections} label="Collections completed" />
        <Stat value={data.stats.meals_shared} label="Meals shared" />
      </div>
      {o.status === "verified" && <Link to="/listings/new"><Button data-testid="org-new-listing-btn"><Plus className="h-4 w-4" />New organization listing</Button></Link>}
      <section>
        <h2 className="text-2xl text-olive">Reservations to collect</h2>
        {data.reservations.length ? (
          <ul className="mt-4 divide-y divide-line rounded-xl3 border border-line bg-white/60">
            {data.reservations.map((r) => (
              <li key={r.id}><Link to={`/reservations/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm hover:bg-soft/60">
                <span><span className="font-medium">{r.requester?.display_name}</span> · {r.quantity} × {r.listing_title}<span className="block text-xs text-muted">Pickup {formatDateTime(r.pickup_time)}</span></span>
                <Badge>{label(r.status)}</Badge>
              </Link></li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">No open reservations.</p>}
      </section>
      <section>
        <h2 className="text-2xl text-olive">Listings</h2>
        {data.listings.length ? <div className="mt-4 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{data.listings.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
          : <p className="mt-3 text-sm text-muted">No organization listings yet.</p>}
      </section>
    </div>
  );
}

export default function OrganizationPage() {
  const org = useQuery({ queryKey: ["org", "mine"], queryFn: orgsApi.mine, retry: false });
  const missing = org.error instanceof ApiError && org.error.status === 404;
  return (
    <div className="container-page max-w-4xl py-10">
      <p className="eyebrow">For organizations</p>
      <h1 className="mt-2 text-4xl text-olive sm:text-5xl">{org.data?.name ?? "Share surplus at scale"}</h1>
      {org.isLoading ? <Skeleton className="mt-8 h-64" /> : missing ? (
        <>
          <p className="mt-3 max-w-xl text-muted">Restaurants, caterers, NGOs and campuses can register to publish verified food and item listings. Reservations are confirmed automatically and you mark collections as complete.</p>
          <RegisterForm />
        </>
      ) : org.error ? <ErrorState message={(org.error as Error).message} /> : org.data ? <Dashboard /> : <EmptyState title="Something went wrong" />}
    </div>
  );
}
