const BASE = (import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API_ROOT = `${BASE}/api/v1`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; form?: FormData; retry?: boolean };

function messageFrom(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: string[] };
    const field = first.loc?.slice(-1)[0];
    return `${field ? `${field.replace(/_/g, " ")}: ` : ""}${(first.msg || "Invalid value").replace(/^Value error, /, "")}`;
  }
  if (status === 0) return "You appear to be offline. Check your connection.";
  return "Something went wrong. Please try again.";
}

let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_ROOT}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, form, retry = true } = opts;
  let res: Response;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(messageFrom(null, 0), 0);
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(messageFrom((data as { detail?: unknown }).detail, res.status), res.status);
  return data as T;
}

export const fileUrl = (id?: string | null) => (id ? `${API_ROOT}/files/${id}` : "");

export function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : "";
}
