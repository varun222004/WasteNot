import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { reservationsApi } from "@/services/api";
import { fileUrl } from "@/lib/api";
import { formatDateTime, label, timeLeft } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Avatar, ErrorState, Skeleton } from "@/components/ui/Display";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Form";
import { ReservationStatusBadge } from "@/features/reservations/ReservationRow";
import { BlockButton } from "@/features/safety/BlockButton";
import type { Reservation } from "@/types";

type Action = { key: string; label: string; variant?: "primary" | "secondary" | "danger"; needsNote?: boolean };

function actionsFor(r: Reservation): Action[] {
  const owner = r.role === "owner";
  if (r.status === "requested") return owner
    ? [{ key: "accept", label: "Accept" }, { key: "decline", label: "Decline", variant: "secondary", needsNote: true }]
    : [{ key: "cancel", label: "Cancel request", variant: "secondary", needsNote: true }];
  if (r.status === "accepted") {
    const confirmed = owner ? r.owner_confirmed_at : r.requester_confirmed_at;
    const list: Action[] = confirmed ? [] : [{ key: "confirm", label: owner && r.org_id ? "Mark collected" : "Confirm collection" }];
    list.push({ key: "cancel", label: "Cancel", variant: "secondary", needsNote: true });
    if (owner) list.push({ key: "no_show", label: "Report no-show", variant: "secondary" });
    list.push({ key: "dispute", label: "Open dispute", variant: "danger", needsNote: true });
    return list;
  }
  return [];
}

export default function ReservationPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: r, isLoading, error } = useQuery({ queryKey: ["reservation", id], queryFn: () => reservationsApi.get(id!), refetchInterval: 30_000 });
  if (isLoading) return <div className="container-page py-10"><Skeleton className="h-80" /></div>;
  if (error || !r) return <div className="container-page py-10"><ErrorState message={(error as Error)?.message ?? "Not found"} /></div>;
  const other = r.role === "owner" ? r.requester : r.owner;
  const run = async (a: Action) => {
    setBusy(true);
    try {
      const updated = await reservationsApi.act(r.id, a.key, note);
      qc.setQueryData(["reservation", id], updated);
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["listing", r.listing_id] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(`${a.label} — done`);
      setPending(null);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const actions = actionsFor(r);
  const myConfirmed = r.role === "owner" ? r.owner_confirmed_at : r.requester_confirmed_at;
  return (
    <div className="container-page max-w-3xl py-10">
      <Link to="/me?tab=reservations" className="text-sm text-muted hover:text-ink">← My activity</Link>
      <div className="mt-6 flex items-center gap-4">
        <Link to={`/listings/${r.listing_id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl2 bg-soft">
          {r.listing?.photo_ids[0] && <img src={fileUrl(r.listing.photo_ids[0])} alt="" className="h-full w-full object-cover" />}
        </Link>
        <div className="min-w-0">
          <p className="eyebrow">{r.role === "owner" ? "Reservation for your item" : "Your reservation"}</p>
          <h1 className="mt-1 truncate text-3xl text-olive">{r.listing?.title}</h1>
          <div className="mt-2"><ReservationStatusBadge status={r.status} /></div>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card space-y-2 p-5 text-sm">
          <div><span className="text-muted">Quantity:</span> {r.quantity}</div>
          <div><span className="text-muted">Pickup time:</span> {formatDateTime(r.pickup_time)}</div>
          {r.status === "requested" && <div data-testid="respond-by"><span className="text-muted">Giver must respond:</span> {timeLeft(r.respond_by)}</div>}
          {r.note && <div><span className="text-muted">Note:</span> {r.note}</div>}
          {r.late_cancellation && <div className="text-walnut">Cancelled less than 1 hour before pickup.</div>}
        </div>
        <div className="card flex items-center justify-between gap-3 p-5">
          <Link to={`/u/${other.id}`} className="flex items-center gap-3 text-sm">
            <Avatar name={other.display_name} fileId={other.avatar_file_id} />
            <div><div className="font-medium">{other.display_name}</div><div className="text-muted">{r.role === "owner" ? "Receiver" : "Giver"}</div></div>
          </Link>
          <BlockButton userId={other.id} name={other.display_name} />
        </div>
      </div>
      {r.pickup_location && (
        <div className="mt-4 rounded-xl2 border border-sage bg-sage-100/60 p-5 text-sm" data-testid="pickup-location">
          <div className="flex items-center gap-2 font-medium text-olive"><MapPin className="h-4 w-4" />Pickup details (private)</div>
          {r.pickup_location.address && <div className="mt-2">{r.pickup_location.address}</div>}
          {r.pickup_location.instructions && <div className="mt-1 text-muted">{r.pickup_location.instructions}</div>}
          <a className="mt-2 inline-block font-medium text-olive underline" target="_blank" rel="noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${r.pickup_location.lat}&mlon=${r.pickup_location.lng}#map=17/${r.pickup_location.lat}/${r.pickup_location.lng}`}>Open map</a>
        </div>
      )}
      {r.status === "accepted" && myConfirmed && <p className="mt-4 text-sm text-muted">You confirmed the collection. Waiting for the other person.</p>}
      <div className="mt-8 flex flex-wrap gap-2" data-testid="reservation-actions">
        {r.conversation_id && (
          <Link to={`/messages/${r.conversation_id}`}><Button variant="secondary" data-testid="open-chat-btn"><MessageCircle className="h-4 w-4" />Message</Button></Link>
        )}
        {actions.map((a) => (
          <Button key={a.key} variant={a.variant ?? "primary"} onClick={() => (a.needsNote || a.key === "no_show" ? setPending(a) : run(a))} loading={busy && !pending}
            data-testid={`reservation-action-${a.key}`}>{a.label}</Button>
        ))}
      </div>
      <section className="mt-12">
        <h2 className="text-xl text-olive">History</h2>
        <ol className="mt-4 space-y-3 border-l border-line pl-5">
          {r.history.map((h, i) => (
            <li key={i} className="text-sm"><span className="font-medium">{label(h.kind)}</span><span className="text-muted"> · {formatDateTime(h.at)}</span>{h.note && <div className="text-muted">{h.note}</div>}</li>
          ))}
        </ol>
      </section>
      <Modal open={!!pending} onClose={() => setPending(null)} title={pending?.label ?? ""} testId="reservation-action-modal">
        <div className="space-y-4">
          {pending?.key === "no_show" && <p className="text-sm text-muted">Only report a no-show if the person didn't turn up and didn't cancel. Three no-shows in 30 days pause their reservations for 7 days.</p>}
          {pending?.needsNote && <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={pending.key === "dispute" ? "What went wrong?" : "Optional note"} data-testid="reservation-note-input" />}
          <Button className="w-full" variant={pending?.variant === "danger" ? "danger" : "primary"} loading={busy} onClick={() => pending && run(pending)} data-testid="reservation-action-confirm-btn">{pending?.label}</Button>
        </div>
      </Modal>
    </div>
  );
}
