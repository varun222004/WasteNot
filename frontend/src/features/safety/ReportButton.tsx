import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { reportsApi } from "@/services/api";
import { useRequireAuth } from "@/hooks/useAuth";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Form";

const REASONS = [
  { key: "unsafe_food", label: "Unsafe food" },
  { key: "misleading", label: "Misleading information" },
  { key: "harassment", label: "Harassment" },
  { key: "suspicious", label: "Suspicious behaviour" },
  { key: "spam", label: "Spam" },
  { key: "other", label: "Something else" },
];

export function ReportButton({ targetType, targetId, compact }: {
  targetType: "listing" | "user" | "organization" | "request"; targetId: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("misleading");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRequireAuth();
  const submit = async () => {
    setBusy(true);
    try {
      await reportsApi.create({ target_type: targetType, target_id: targetId, reason, details });
      toast.success("Thanks. Our moderators will review this.");
      setOpen(false);
      setDetails("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button onClick={() => guard(() => setOpen(true))} data-testid={`report-${targetType}-btn`}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-soft hover:text-danger">
        <Flag className="h-4 w-4" />{compact ? "" : "Report"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report a concern" testId="report-modal">
        <div className="space-y-4">
          <Field label="What's wrong?">
            <Select value={reason} onChange={(e) => setReason(e.target.value)} data-testid="report-reason-select">
              {REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Details (optional)">
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} data-testid="report-details-input" />
          </Field>
          <Button className="w-full" onClick={submit} loading={busy} data-testid="report-submit-btn">Send report</Button>
        </div>
      </Modal>
    </>
  );
}
