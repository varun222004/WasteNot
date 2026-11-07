import { useState } from "react";
import { Ban } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usersApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ui/Modal";

export function BlockButton({ userId, name }: { userId: string; name: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["blocked", userId], queryFn: () => usersApi.isBlocked(userId), enabled: !!user && user.id !== userId });
  if (!user || user.id === userId) return null;
  const blocked = data?.blocked;
  const toggle = async () => {
    try {
      await (blocked ? usersApi.unblock(userId) : usersApi.block(userId));
      toast.success(blocked ? `${name} unblocked` : `${name} blocked`);
      qc.invalidateQueries({ queryKey: ["blocked", userId] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <button onClick={() => (blocked ? toggle() : setOpen(true))} data-testid="block-user-btn"
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-soft hover:text-danger">
        <Ban className="h-4 w-4" />{blocked ? "Unblock" : "Block"}
      </button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={toggle} danger confirmLabel="Block"
        title={`Block ${name}?`} message="You won't be able to message, reserve from, or send offers to each other." />
    </>
  );
}
