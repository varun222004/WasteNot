import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { requestsApi, usersApi } from "@/services/api";
import { useAuth, useRequireAuth } from "@/hooks/useAuth";
import { label, timeAgo, timeLeft } from "@/lib/format";
import { fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Form";
import { Avatar, Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/Display";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { ReportButton } from "@/features/safety/ReportButton";
import type { Offer, WantedRequest } from "@/types";

function OfferDialog({ req, open, onClose }: { req: WantedRequest; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [listingId, setListingId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = useQuery({ queryKey: ["my-active-listings"], enabled: open && !!user,
    queryFn: async () => (await usersApi.myListings()).filter((l) => l.status === "active" && l.available > 0) });
  const submit = async () => {
    setBusy(true);
    try {
      await requestsApi.offer(req.id, listingId, message);
      toast.success("Offer sent");
      qc.invalidateQueries({ queryKey: ["request", req.id] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Offer one of your listings" testId="offer-modal">
      {mine.data?.length === 0 ? (
        <EmptyState title="No active listings" body="Create a listing first, then offer it here."
          action={<Link to="/listings/new"><Button>Give something</Button></Link>} />
      ) : (
        <div className="space-y-4">
          <Field label="Listing">
            <Select value={listingId} onChange={(e) => setListingId(e.target.value)} data-testid="offer-listing-select">
              <option value="">Choose a listing</option>
              {mine.data?.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </Select>
          </Field>
          <Field label="Message (optional)"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} data-testid="offer-message-input" /></Field>
          <Button className="w-full" disabled={!listingId} loading={busy} onClick={submit} data-testid="offer-submit-btn">Send offer</Button>
        </div>
      )}
    </Modal>
  );
}

function OfferRow({ o, req }: { o: Offer; req: WantedRequest }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const act = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) {
        const { reservation_id } = await requestsApi.acceptOffer(req.id, o.id);
        toast.success("Offer accepted. You can now message the giver.");
        navigate(`/reservations/${reservation_id}`);
      } else {
        await requestsApi.declineOffer(req.id, o.id);
        qc.invalidateQueries({ queryKey: ["request", req.id] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center" data-testid={`offer-row-${o.id}`}>
      <Link to={`/listings/${o.listing_id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-soft">{o.listing?.photo_ids[0] && <img src={fileUrl(o.listing.photo_ids[0])} alt="" className="h-full w-full object-cover" />}</div>
        <div className="min-w-0">
          <div className="truncate font-medium">{o.listing?.title}</div>
          <div className="text-sm text-muted">from {o.offerer?.display_name} · {timeAgo(o.created_at)}</div>
          {o.message && <div className="mt-1 text-sm">"{o.message}"</div>}
        </div>
      </Link>
      {req.is_owner && o.status === "pending" && req.status === "open" ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => act(true)} loading={busy} data-testid={`accept-offer-${o.id}`}>Accept</Button>
          <Button size="sm" variant="secondary" onClick={() => act(false)} disabled={busy} data-testid={`decline-offer-${o.id}`}>Decline</Button>
        </div>
      ) : <Badge tone={o.status === "accepted" ? "olive" : "neutral"}>{label(o.status)}</Badge>}
    </div>
  );
}

export default function WantedDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const guard = useRequireAuth();
  const qc = useQueryClient();
  const [offering, setOffering] = useState(false);
  const [closing, setClosing] = useState(false);
  const { data: r, isLoading, error } = useQuery({ queryKey: ["request", id, user?.id], queryFn: () => requestsApi.get(id!) });
  if (isLoading) return <div className="container-page py-10"><Skeleton className="h-72" /></div>;
  if (error || !r) return <div className="container-page py-10"><ErrorState message={(error as Error)?.message ?? "Not found"} /></div>;
  const close = async () => {
    try { await requestsApi.close(r.id, "close"); toast.success("Request closed"); qc.invalidateQueries({ queryKey: ["request", id] }); }
    catch (e) { toast.error((e as Error).message); }
    setClosing(false);
  };
  return (
    <div className="container-page max-w-3xl py-10">
      <Link to="/wanted" className="text-sm text-muted hover:text-ink">← All requests</Link>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Badge>{label(r.category)}</Badge>
        <Badge tone={r.status === "open" ? "sage" : "walnut"} testId="request-status">{label(r.status)}</Badge>
        {r.status === "open" && <span className="text-sm text-muted">{timeLeft(r.expires_at)}</span>}
      </div>
      <h1 className="mt-4 text-4xl text-olive sm:text-5xl" data-testid="request-title">{r.title}</h1>
      <p className="mt-5 whitespace-pre-line leading-relaxed">{r.description}</p>
      <div className="mt-4 text-sm text-muted">{r.locality}{r.quantity_note && ` · ${r.quantity_note}`}</div>
      <div className="mt-8 flex items-center justify-between border-y border-line py-5">
        <Link to={`/u/${r.owner?.id}`} className="flex items-center gap-3 text-sm">
          <Avatar name={r.owner?.display_name} fileId={r.owner?.avatar_file_id} />
          <div><div className="font-medium">{r.owner?.display_name}</div><div className="text-muted">Asked {timeAgo(r.created_at)}</div></div>
        </Link>
        {!r.is_owner && <ReportButton targetType="request" targetId={r.id} />}
      </div>
      <div className="mt-8">
        {r.is_owner ? (
          r.status === "open" && <Button variant="secondary" onClick={() => setClosing(true)} data-testid="close-request-btn">Close request</Button>
        ) : r.status === "open" ? (
          <Button size="lg" onClick={() => guard(() => setOffering(true))} data-testid="offer-item-btn">Offer an item</Button>
        ) : null}
      </div>
      {(r.offers?.length ?? 0) > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="text-2xl text-olive">{r.is_owner ? "Offers" : "Your offers"}</h2>
          {r.offers!.map((o) => <OfferRow key={o.id} o={o} req={r} />)}
        </section>
      )}
      {r.is_owner && !r.offers?.length && <p className="mt-10 text-sm text-muted">No offers yet. We'll notify you when someone offers an item.</p>}
      {offering && <OfferDialog req={r} open={offering} onClose={() => setOffering(false)} />}
      <ConfirmDialog open={closing} onClose={() => setClosing(false)} onConfirm={close} title="Close this request?" message="Pending offers will be declined." confirmLabel="Close request" />
    </div>
  );
}
