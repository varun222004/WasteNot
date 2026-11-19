export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeLeft(iso?: string | null): string {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  if (diff <= 0) return "ended";
  if (diff < 3600) return `${Math.ceil(diff / 60)} min left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m left`;
  return `${Math.floor(diff / 86400)} days left`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatDistance(km?: number): string {
  if (km === undefined || km === null) return "";
  if (km < 1) return "< 1 km";
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Converts a <input type="datetime-local"> value into an ISO string with timezone. */
export function localToIso(value?: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function isoToLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HISTORY_NOTES: Record<string, string> = {
  owner_confirmed_at: "Giver confirmed the handover",
  requester_confirmed_at: "Receiver confirmed the handover",
};
/** Turns internal history notes (field names) into plain words; real notes pass through unchanged. */
export const historyNote = (note?: string | null) => (note ? HISTORY_NOTES[note] ?? note : "");

export const label = (key?: string | null) => (key ? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");
