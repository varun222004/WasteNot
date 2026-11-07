import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Bookmark, Clock, MapPin, Package, Share2 } from "lucide-react";
import { toast } from "sonner";
import { listingsApi } from "@/services/api";
import { fileUrl } from "@/lib/api";
import { cn, formatDateTime, formatDistance, label, timeAgo, timeLeft } from "@/lib/format";
import { useAuth, useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Avatar, Badge, ErrorState, Skeleton } from "@/components/ui/Display";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ReserveDialog } from "@/features/reservations/ReserveDialog";
import { ReportButton } from "@/features/safety/ReportButton";
import { dietLabel } from "@/features/listings/ListingCard";
import type { Listing } from "@/types";

const allergenText = { known: "Contains", none_declared: "No known allergens declared by donor", unknown: "Allergen information unavailable" };

function Gallery({ ids, title }: { ids: string[]; title: string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="aspect-[4/3] overflow-hidden rounded-xl3 bg-soft">
        {ids[i] && <img src={fileUrl(ids[i])} alt={title} className="h-full w-full object-cover" data-testid="listing-main-photo" />}
      </div>
      {ids.length > 1 && (
        <div className="mt-3 flex gap-2">
          {ids.map((id, n) => (
            <button key={id} onClick={() => setI(n)} className={cn("h-16 w-16 overflow-hidden rounded-xl border-2", n === i ? "border-olive" : "border-transparent")} aria-label={`Photo ${n + 1}`}>
              <img src={fileUrl(id)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FoodPanel({ l }: { l: Listing }) {
  const f = l.food!;
  const rows = [
    ["Type", f.food_type === "cooked" ? "Freshly prepared" : "Sealed packaged"],
    ["Diet", dietLabel[f.diet]],
    f.prepared_at ? ["Prepared", formatDateTime(f.prepared_at)] : ["Printed expiry", f.best_before ?? "—"],
    ["Safe until", `${formatDateTime(f.safe_until)} (${timeLeft(f.safe_until)})`],
    ["Allergens", f.allergen_status === "known" ? `${allergenText.known}: ${f.allergens.join(", ")}` : allergenText[f.allergen_status]],
    ["Storage", f.storage_instructions],
  ];
  return (
    <div className="rounded-xl2 border border-sage/60 bg-sage-100/50 p-5" data-testid="food-info-panel">
      <h3 className="text-lg text-olive">Food details</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="mt-4 text-xs text-muted">Disclosed by the donor. WasteNot does not inspect or certify food. Check before eating.</p>
    </div>
  );
}

function OwnerActions({ l }: { l: Listing }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<null | "close" | "remove" | "complete">(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (confirm === "remove") await listingsApi.remove(l.id);
      else await listingsApi.action(l.id, confirm!);
      toast.success(confirm === "remove" ? "Listing removed" : confirm === "close" ? "Listing closed" : "Marked as completed");
      qc.invalidateQueries({ queryKey: ["listing", l.id] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      if (confirm === "remove") navigate("/me");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const reopen = async () => {
    try { await listingsApi.action(l.id, "reopen"); qc.invalidateQueries({ queryKey: ["listing", l.id] }); toast.success("Listing reopened"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const msgs = { close: "No new reservations will be accepted. Already accepted reservations stay valid.", remove: "This hides the listing permanently.", complete: "Mark this listing as fully given away." };
  return (
    <div className="space-y-3" data-testid="owner-actions">
      {(l.private_location?.address || l.private_location?.instructions) && (
        <div className="rounded-xl2 border border-line p-4 text-sm" data-testid="owner-private-pickup">
          <div className="font-medium">Private pickup details (shared only after you accept)</div>
          {l.private_location.address && <div className="mt-1">{l.private_location.address}</div>}
          {l.private_location.instructions && <div className="mt-1 text-muted">{l.private_location.instructions}</div>}
        </div>
      )}
      <div className="rounded-xl2 bg-soft/70 p-4 text-sm">
        <div className="font-medium">Inventory</div>
        <div className="mt-1 text-muted" data-testid="inventory-summary">{l.available} available · {l.reserved} reserved · {l.collected} collected · {l.quantity_total} total</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {["active", "closed"].includes(l.status) && <Link to={`/listings/${l.id}/edit`}><Button variant="secondary" data-testid="edit-listing-btn">Edit</Button></Link>}
        {l.status === "active" && <Button variant="secondary" onClick={() => setConfirm("close")} data-testid="close-listing-btn">Close</Button>}
        {l.status === "closed" && <Button variant="secondary" onClick={reopen} data-testid="reopen-listing-btn">Reopen</Button>}
        {["active", "closed"].includes(l.status) && <Button variant="secondary" onClick={() => setConfirm("complete")} data-testid="complete-listing-btn">Mark completed</Button>}
        <Button variant="ghost" className="text-danger" onClick={() => setConfirm("remove")} data-testid="remove-listing-btn">Remove</Button>
      </div>
      <Link to="/me?tab=incoming" className="inline-block text-sm font-medium text-olive hover:underline">Manage reservations →</Link>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={run} loading={busy} danger={confirm === "remove"}
        title={confirm ? `${label(confirm)} this listing?` : ""} message={confirm ? msgs[confirm] : ""} confirmLabel={label(confirm)} />
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const guard = useRequireAuth();
  const qc = useQueryClient();
  const [reserving, setReserving] = useState(false);
  const { data: l, isLoading, error } = useQuery({ queryKey: ["listing", id], queryFn: () => listingsApi.get(id!) });
  if (isLoading) return <div className="container-page grid gap-10 py-10 md:grid-cols-2"><Skeleton className="aspect-[4/3]" /><Skeleton className="h-80" /></div>;
  if (error || !l) return <div className="container-page py-12"><ErrorState message={(error as Error)?.message ?? "Not found"} /></div>;
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: l.title, url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
  };
  const toggleSave = () => guard(async () => {
    await listingsApi.save(l.id, l.is_saved);
    qc.invalidateQueries({ queryKey: ["listing", id] });
    qc.invalidateQueries({ queryKey: ["me"] });
  });
  const canReserve = l.status === "active" && l.available > 0 && !l.is_owner && !l.blocked;
  return (
    <div className="container-page py-8 md:py-12">
      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] lg:gap-16">
        <Gallery ids={l.photo_ids} title={l.title} />
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{label(l.category)}</Badge>
            {l.condition && <Badge tone="walnut">{label(l.condition)}</Badge>}
            {l.status !== "active" && <Badge tone="danger" testId="listing-status-badge">{label(l.status)}</Badge>}
          </div>
          <h1 className="mt-4 text-4xl leading-tight text-olive sm:text-5xl" data-testid="listing-title">{l.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{l.locality}{l.distance_km !== undefined && ` · ${formatDistance(l.distance_km)}`}</span>
            <span className="inline-flex items-center gap-1.5" data-testid="listing-availability"><Package className="h-4 w-4" />{l.available} of {l.quantity_total} available</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />Posted {timeAgo(l.created_at)}</span>
          </div>
          <p className="mt-6 whitespace-pre-line leading-relaxed text-ink/90">{l.description}</p>
          <div className="mt-6 space-y-2 text-sm">
            {l.public_pickup_point && <div><span className="text-muted">Meeting point:</span> {l.public_pickup_point}</div>}
            {l.organization?.verified && l.organization.address && <div><span className="text-muted">Address:</span> {l.organization.address}</div>}
            {l.pickup_window_end && <div><span className="text-muted">{l.mode === "food" ? "Collection window" : "Pickup window"}:</span> {formatDateTime(l.pickup_window_start)} – {formatDateTime(l.pickup_window_end)}</div>}
            {l.per_person_limit && <div><span className="text-muted">Limit:</span> {l.per_person_limit} per person</div>}
          </div>
          {l.food && <div className="mt-6"><FoodPanel l={l} /></div>}
          <div className="mt-8">
            {l.is_owner ? <OwnerActions l={l} /> : (
              <div className="space-y-3">
                {l.my_reservations?.length ? (
                  <Link to={`/reservations/${l.my_reservations[0].id}`}><Button variant="secondary" className="w-full sm:w-auto" data-testid="view-my-reservation-btn">View your reservation ({label(l.my_reservations[0].status)})</Button></Link>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="lg" disabled={!canReserve} onClick={() => guard(() => setReserving(true))} data-testid="reserve-btn">
                    {canReserve ? "Reserve" : l.blocked ? "Unavailable to you" : l.available === 0 ? "All reserved" : "Not available"}
                  </Button>
                  <Button size="lg" variant="secondary" onClick={toggleSave} data-testid="save-listing-btn" aria-pressed={l.is_saved}>
                    <Bookmark className={cn("h-4 w-4", l.is_saved && "fill-olive")} />{l.is_saved ? "Saved" : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
            <Link to={l.organization?.verified ? `/org/${l.organization.id}` : `/u/${l.owner?.id}`} className="flex items-center gap-3" data-testid="listing-owner-link">
              <Avatar name={l.organization?.name ?? l.owner?.display_name} fileId={l.organization?.logo_file_id ?? l.owner?.avatar_file_id} />
              <div className="text-sm">
                <div className="flex items-center gap-1 font-medium">{l.organization?.name ?? l.owner?.display_name}{l.organization?.verified && <BadgeCheck className="h-4 w-4 text-olive" />}</div>
                <div className="text-muted">{l.organization?.verified ? "Verified organization" : "Member"}</div>
              </div>
            </Link>
            <div className="flex">
              <button onClick={share} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-soft" data-testid="share-listing-btn"><Share2 className="h-4 w-4" />Share</button>
              {!l.is_owner && <ReportButton targetType="listing" targetId={l.id} />}
            </div>
          </div>
        </div>
      </div>
      {user && reserving && <ReserveDialog listing={l} open={reserving} onClose={() => setReserving(false)} />}
    </div>
  );
}
