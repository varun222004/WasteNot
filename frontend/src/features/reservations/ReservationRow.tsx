import { Link } from "react-router-dom";
import { fileUrl } from "@/lib/api";
import { formatDateTime, label } from "@/lib/format";
import { Badge } from "@/components/ui/Display";
import type { Reservation, ReservationStatus } from "@/types";

const tones: Record<ReservationStatus, "amber" | "sage" | "neutral" | "danger" | "olive" | "walnut"> = {
  requested: "amber", accepted: "sage", completed: "olive", declined: "neutral", expired: "neutral",
  cancelled: "neutral", no_show: "danger", disputed: "danger", unconfirmed: "walnut",
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge tone={tones[status]} testId="reservation-status">{label(status)}</Badge>;
}

export function ReservationRow({ r }: { r: Reservation }) {
  const other = r.role === "owner" ? r.requester : r.owner;
  return (
    <Link to={`/reservations/${r.id}`} className="card flex items-center gap-4 p-3 transition-colors hover:border-olive/30" data-testid={`reservation-row-${r.id}`}>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-soft">
        {r.listing?.photo_ids[0] && <img src={fileUrl(r.listing.photo_ids[0])} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{r.listing?.title ?? "Listing"}</div>
        <div className="truncate text-sm text-muted">
          {r.role === "owner" ? "Requested by" : "From"} {other?.display_name} · {r.quantity} item{r.quantity > 1 ? "s" : ""}
        </div>
        {r.pickup_time && <div className="text-xs text-muted">Pickup {formatDateTime(r.pickup_time)}</div>}
      </div>
      <ReservationStatusBadge status={r.status} />
    </Link>
  );
}
