import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { reservationsApi } from "@/services/api";
import { formatDateTime, isoToLocal, localToIso } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";
import type { Listing } from "@/types";

export function ReserveDialog({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const max = Math.min(listing.available, listing.per_person_limit ?? listing.available);
  const [qty, setQty] = useState(1);
  const [pickup, setPickup] = useState(isoToLocal(listing.pickup_window_start && new Date(listing.pickup_window_start) > new Date() ? listing.pickup_window_start : null));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async () => {
    setBusy(true);
    try {
      const r = await reservationsApi.create({ listing_id: listing.id, quantity: qty, pickup_time: localToIso(pickup), note });
      toast.success(r.status === "accepted" ? "Reserved! Pickup details are ready." : "Request sent. The giver will respond soon.");
      navigate(`/reservations/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Reserve this" testId="reserve-modal">
      <div className="space-y-4">
        <Field label={`Quantity (up to ${max})`}>
          <Input type="number" min={1} max={max} value={qty} data-testid="reserve-quantity-input"
            onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
        </Field>
        <Field label="Preferred pickup time" hint={listing.pickup_window_end ? `Collection window: ${formatDateTime(listing.pickup_window_start)} – ${formatDateTime(listing.pickup_window_end)}` : "Optional"}>
          <Input type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} data-testid="reserve-pickup-input" />
        </Field>
        <Field label="A note for the giver (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Hi! I can come by after work." data-testid="reserve-note-input" />
        </Field>
        <p className="text-xs text-muted">
          {listing.auto_accept ? "This organization confirms reservations automatically." :
            `The giver has ${listing.mode === "food" ? "2 hours" : "24 hours"} to respond. Free cancellation until 1 hour before pickup.`}
        </p>
        <Button className="w-full" size="lg" onClick={submit} loading={busy} data-testid="reserve-submit-btn">Send reservation</Button>
      </div>
    </Modal>
  );
}
