import { api, qs } from "@/lib/api";
import type {
  Conversation, Impact, Listing, Me, Message, Meta, Notification, Offer, Organization, Page, PublicProfile,
  Reservation, UserSummary, WantedRequest,
} from "@/types";

type Q = Record<string, string | number | undefined | null>;

export const authApi = {
  requestOtp: (email: string) =>
    api<{ message: string; dev_otp?: string }>("/auth/request-otp", { method: "POST", body: { email } }),
  verifyOtp: (email: string, code: string) =>
    api<{ user: Me; is_new: boolean }>("/auth/verify-otp", { method: "POST", body: { email, code } }),
  session: () => api<{ user: Me | null }>("/auth/session"),
  logout: () => api("/auth/logout", { method: "POST" }),
  logoutAll: () => api("/auth/logout-all", { method: "POST" }),
};

export const usersApi = {
  me: () => api<Me>("/users/me"),
  update: (body: Partial<Me> & { avatar_file_id?: string | null }) => api<Me>("/users/me", { method: "PATCH", body }),
  profile: (id: string) => api<PublicProfile>(`/users/${id}`),
  block: (id: string) => api(`/users/${id}/block`, { method: "POST" }),
  unblock: (id: string) => api(`/users/${id}/block`, { method: "DELETE" }),
  isBlocked: (id: string) => api<{ blocked: boolean }>(`/users/${id}/is-blocked`),
  blocks: () => api<UserSummary[]>("/users/me/blocks"),
  myListings: () => api<Listing[]>("/users/me/listings"),
};

export const filesApi = {
  upload: (file: File, purpose: "listing_photo" | "avatar" | "org_logo" | "org_proof") => {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    return api<{ id: string }>("/files", { method: "POST", form });
  },
};

export const listingsApi = {
  meta: () => api<Meta>("/listings/meta"),
  search: (q: Q) => api<Page<Listing>>(`/listings${qs(q)}`),
  get: (id: string) => api<Listing>(`/listings/${id}`),
  create: (body: unknown) => api<Listing>("/listings", { method: "POST", body }),
  update: (id: string, body: unknown) => api<Listing>(`/listings/${id}`, { method: "PATCH", body }),
  action: (id: string, action: "close" | "reopen" | "complete") => api(`/listings/${id}/${action}`, { method: "POST" }),
  remove: (id: string) => api(`/listings/${id}`, { method: "DELETE" }),
  save: (id: string, saved: boolean) => api(`/listings/${id}/save`, { method: saved ? "DELETE" : "POST" }),
};

export const reservationsApi = {
  create: (body: { listing_id: string; quantity: number; pickup_time?: string; note?: string }) =>
    api<Reservation>("/reservations", { method: "POST", body }),
  list: (q: Q) => api<Page<Reservation>>(`/reservations${qs(q)}`),
  get: (id: string) => api<Reservation>(`/reservations/${id}`),
  act: (id: string, action: string, note = "") =>
    api<Reservation>(`/reservations/${id}/actions`, { method: "POST", body: { action, note } }),
};

export const requestsApi = {
  browse: (q: Q) => api<Page<WantedRequest>>(`/requests${qs(q)}`),
  mine: () => api<WantedRequest[]>("/requests/mine"),
  get: (id: string) => api<WantedRequest>(`/requests/${id}`),
  create: (body: unknown) => api<WantedRequest>("/requests", { method: "POST", body }),
  update: (id: string, body: unknown) => api<WantedRequest>(`/requests/${id}`, { method: "PATCH", body }),
  close: (id: string, how: "close" | "cancel") => api(`/requests/${id}/${how}`, { method: "POST" }),
  offer: (id: string, listing_id: string, message: string) =>
    api<Offer>(`/requests/${id}/offers`, { method: "POST", body: { listing_id, message } }),
  acceptOffer: (id: string, offerId: string) =>
    api<{ reservation_id: string }>(`/requests/${id}/offers/${offerId}/accept`, { method: "POST" }),
  declineOffer: (id: string, offerId: string) => api(`/requests/${id}/offers/${offerId}/decline`, { method: "POST" }),
};

export type OrgDashboard = {
  organization: Organization;
  stats: Record<string, number>;
  listings: Listing[];
  reservations: { id: string; status: string; quantity: number; pickup_time?: string; listing_title: string;
    requester?: UserSummary; created_at: string }[];
};

export const orgsApi = {
  register: (body: unknown) => api<Organization>("/organizations", { method: "POST", body }),
  mine: () => api<Organization>("/organizations/mine"),
  updateMine: (body: unknown) => api<Organization>("/organizations/mine", { method: "PATCH", body }),
  dashboard: () => api<OrgDashboard>("/organizations/mine/dashboard"),
  get: (id: string) => api<Organization & { listings: Listing[] }>(`/organizations/${id}`),
};

export const messagesApi = {
  conversations: () => api<Conversation[]>("/messages/conversations"),
  thread: (id: string) => api<{ conversation: Conversation; messages: Message[] }>(`/messages/conversations/${id}`),
  send: (id: string, body: string) => api<Message>(`/messages/conversations/${id}`, { method: "POST", body: { body } }),
  unread: () => api<{ count: number }>("/messages/unread-count"),
};

export const notificationsApi = {
  list: (page = 1) => api<Page<Notification>>(`/notifications${qs({ page })}`),
  unread: () => api<{ count: number }>("/notifications/unread-count"),
  read: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
  readAll: () => api("/notifications/read-all", { method: "POST" }),
};

export const reportsApi = {
  create: (body: { target_type: string; target_id: string; reason: string; details: string }) =>
    api("/reports", { method: "POST", body }),
};

export const impactApi = { get: () => api<Impact>("/impact") };

export const adminApi = {
  overview: () => api<Record<string, number>>("/admin/overview"),
  reports: (status = "open") => api<any[]>(`/admin/reports${qs({ status })}`),
  resolveReport: (id: string, action: string, note: string) =>
    api(`/admin/reports/${id}/resolve`, { method: "POST", body: { action, note } }),
  organizations: (status = "pending") => api<Organization[]>(`/admin/organizations${qs({ status })}`),
  reviewOrg: (id: string, status: string, note: string) =>
    api(`/admin/organizations/${id}/review`, { method: "POST", body: { status, note } }),
  listings: (q?: string) => api<Listing[]>(`/admin/listings${qs({ q })}`),
  removeListing: (id: string, note: string) => api(`/admin/listings/${id}/remove`, { method: "POST", body: { note } }),
  users: (q?: string) => api<any[]>(`/admin/users${qs({ q })}`),
  suspend: (id: string, note: string, days?: number) =>
    api(`/admin/users/${id}/suspend`, { method: "POST", body: { note, days } }),
  unsuspend: (id: string) => api(`/admin/users/${id}/unsuspend`, { method: "POST", body: { note: "" } }),
  disputes: () => api<any[]>("/admin/disputes"),
  resolveDispute: (id: string, outcome: string, note: string) =>
    api(`/admin/reservations/${id}/resolve`, { method: "POST", body: { outcome, note } }),
  actions: () => api<any[]>("/admin/moderation-actions"),
};
