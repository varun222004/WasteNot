import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Modal({ open, onClose, title, children, testId }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-olive-900/40" onClick={onClose} />
      <div data-testid={testId} className="relative max-h-[92vh] w-full animate-rise overflow-y-auto rounded-t-xl3 bg-cream p-6 sm:max-w-lg sm:rounded-xl3">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-2xl text-olive">{title}</h2>
          <button onClick={onClose} className="-m-2 rounded-full p-2 text-muted hover:bg-soft" aria-label="Close" data-testid="modal-close-btn">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string;
  confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} testId="confirm-dialog">
      <p className="text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} data-testid="confirm-cancel-btn">Not now</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} data-testid="confirm-ok-btn">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
