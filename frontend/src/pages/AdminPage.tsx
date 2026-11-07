import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "@/services/api";
import { fileUrl } from "@/lib/api";
import { formatDateTime, label } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Input, SearchBar } from "@/components/ui/Form";
import { Badge, EmptyState, Skeleton, Stat, Tabs } from "@/components/ui/Display";

type Tab = "reports" | "organizations" | "disputes" | "listings" | "users" | "log";

function useAct() {
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); qc.invalidateQueries({ queryKey: ["admin"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
}

function Row({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid={testId}>{children}</li>;
}
function List({ children, empty }: { children: React.ReactNode[]; empty: string }) {
  if (!children.length) return <EmptyState title={empty} />;
  return <ul className="divide-y divide-line rounded-xl3 border border-line bg-white/60">{children}</ul>;
}

function Reports({ note }: { note: string }) {
  const act = useAct();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "reports"], queryFn: () => adminApi.reports() });
  if (isLoading) return <Skeleton className="h-40" />;
  return <List empty="No open reports">{(data ?? []).map((r) => (
    <Row key={r.id} testId={`admin-report-${r.id}`}>
      <div className="text-sm">
        <div className="flex items-center gap-2"><Badge tone={r.priority === "high" ? "danger" : "neutral"}>{label(r.reason)}</Badge><span className="font-medium">{label(r.target_type)}: {r.target_label}</span>{r.target_owner && <span className="text-muted">by {r.target_owner}</span>}
          {r.target_type === "listing" && <Link className="text-olive underline" to={`/listings/${r.target_id}`}>view</Link>}
          {r.target_type === "user" && <Link className="text-olive underline" to={`/u/${r.target_id}`}>view</Link>}</div>
        <div className="mt-1 text-muted">{r.details || "No details"} · by {r.reporter?.display_name} · {formatDateTime(r.created_at)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => act(() => adminApi.resolveReport(r.id, "dismiss", note), "Dismissed")} data-testid="admin-report-dismiss">Dismiss</Button>
        {r.target_type === "listing" && <Button size="sm" variant="danger" onClick={() => act(() => adminApi.resolveReport(r.id, "remove_listing", note), "Listing removed")} data-testid="admin-report-remove">Remove listing</Button>}
        {["user", "listing"].includes(r.target_type) && <Button size="sm" variant="danger" onClick={() => act(() => adminApi.resolveReport(r.id, "suspend_user", note), "Member suspended")} data-testid="admin-report-suspend">Suspend member</Button>}
      </div>
    </Row>))}</List>;
}

function Orgs({ note }: { note: string }) {
  const act = useAct();
  const [status, setStatus] = useState("pending");
  const { data, isLoading } = useQuery({ queryKey: ["admin", "orgs", status], queryFn: () => adminApi.organizations(status) });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{["pending", "verified", "rejected", "suspended", "all"].map((s) => (
        <Button key={s} size="sm" variant={s === status ? "primary" : "secondary"} onClick={() => setStatus(s)}>{label(s)}</Button>))}</div>
      {isLoading ? <Skeleton className="h-40" /> : <List empty="No organizations here">{(data ?? []).map((o) => (
        <Row key={o.id} testId={`admin-org-${o.id}`}>
          <div className="text-sm">
            <div className="font-medium">{o.name} <Badge className="ml-1">{label(o.status)}</Badge></div>
            <div className="mt-1 text-muted">{label(o.category)} · {o.address} · {o.contact_email} · {o.contact_phone}</div>
            <div className="text-muted">Owner: {o.owner?.display_name}</div>
            {o.proof_file_id && <a href={fileUrl(o.proof_file_id)} target="_blank" rel="noreferrer" className="font-medium text-olive underline" data-testid="admin-org-proof-link">View proof document</a>}
          </div>
          <div className="flex flex-wrap gap-2">
            {o.status !== "verified" && <Button size="sm" onClick={() => act(() => adminApi.reviewOrg(o.id, "verified", note), "Verified")} data-testid="admin-org-verify">Verify</Button>}
            {o.status === "pending" && <Button size="sm" variant="secondary" onClick={() => act(() => adminApi.reviewOrg(o.id, "rejected", note), "Rejected")} data-testid="admin-org-reject">Reject</Button>}
            {o.status === "verified" && <Button size="sm" variant="danger" onClick={() => act(() => adminApi.reviewOrg(o.id, "suspended", note), "Suspended")} data-testid="admin-org-suspend">Suspend</Button>}
          </div>
        </Row>))}</List>}
    </div>
  );
}

function Disputes({ note }: { note: string }) {
  const act = useAct();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "disputes"], queryFn: adminApi.disputes });
  if (isLoading) return <Skeleton className="h-40" />;
  return <List empty="No open disputes">{(data ?? []).map((d) => (
    <Row key={d.id} testId={`admin-dispute-${d.id}`}>
      <div className="text-sm"><div className="font-medium">{d.listing_title} · {d.quantity} item(s)</div>
        <div className="text-muted">{d.owner?.display_name} → {d.requester?.display_name} · "{d.dispute?.reason}"</div></div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act(() => adminApi.resolveDispute(d.id, "completed", note), "Marked completed")} data-testid="admin-dispute-complete">Mark completed</Button>
        <Button size="sm" variant="secondary" onClick={() => act(() => adminApi.resolveDispute(d.id, "cancelled", note), "Cancelled & released")} data-testid="admin-dispute-cancel">Cancel & release</Button>
      </div>
    </Row>))}</List>;
}

function Listings({ note }: { note: string }) {
  const act = useAct();
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["admin", "listings", q], queryFn: () => adminApi.listings(q) });
  return (
    <div className="space-y-4"><SearchBar value={q} onChange={setQ} placeholder="Search listings" testId="admin-listing-search" />
      <List empty="No listings">{(data ?? []).map((l) => (
        <Row key={l.id}>
          <div className="text-sm"><Link to={`/listings/${l.id}`} className="font-medium hover:underline">{l.title}</Link><div className="text-muted">{label(l.category)} · {l.locality} · {l.owner?.display_name} · <Badge>{label(l.status)}</Badge></div></div>
          {l.status !== "removed" && <Button size="sm" variant="danger" onClick={() => act(() => adminApi.removeListing(l.id, note), "Removed")} data-testid={`admin-remove-listing-${l.id}`}>Remove</Button>}
        </Row>))}</List></div>
  );
}

function Users({ note }: { note: string }) {
  const act = useAct();
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["admin", "users", q], queryFn: () => adminApi.users(q) });
  return (
    <div className="space-y-4"><SearchBar value={q} onChange={setQ} placeholder="Search by email or name" testId="admin-user-search" />
      <List empty="No members">{(data ?? []).map((u) => (
        <Row key={u.id} testId={`admin-user-${u.id}`}>
          <div className="text-sm"><div className="font-medium">{u.display_name} <span className="text-muted">· {u.email}</span></div>
            <div className="text-muted">{label(u.role)} · {label(u.status)} · {u.stats?.completed ?? 0} exchanges</div></div>
          {u.role !== "admin" && (u.status === "suspended"
            ? <Button size="sm" variant="secondary" onClick={() => act(() => adminApi.unsuspend(u.id), "Reinstated")} data-testid="admin-unsuspend-btn">Reinstate</Button>
            : <Button size="sm" variant="danger" onClick={() => act(() => adminApi.suspend(u.id, note), "Suspended")} data-testid="admin-suspend-btn">Suspend</Button>)}
        </Row>))}</List></div>
  );
}

function Log() {
  const { data } = useQuery({ queryKey: ["admin", "log"], queryFn: adminApi.actions });
  return <List empty="No moderation actions yet">{(data ?? []).map((a) => (
    <Row key={a.id}><div className="text-sm"><span className="font-medium">{label(a.action)}</span> · {label(a.target_type)} {a.target_id.slice(0, 8)}{a.note && ` · ${a.note}`}</div><span className="text-xs text-muted">{formatDateTime(a.created_at)}</span></Row>))}</List>;
}

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "reports";
  const [note, setNote] = useState("");
  const { data: o } = useQuery({ queryKey: ["admin", "overview"], queryFn: adminApi.overview });
  return (
    <div className="container-page py-10">
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 text-4xl text-olive">Moderation</h1>
      <div className="mt-8 grid grid-cols-3 gap-6 sm:grid-cols-6" data-testid="admin-overview">
        <Stat value={o?.open_reports ?? "—"} label="Open reports" /><Stat value={o?.pending_organizations ?? "—"} label="Pending orgs" />
        <Stat value={o?.open_disputes ?? "—"} label="Disputes" /><Stat value={o?.active_listings ?? "—"} label="Active listings" />
        <Stat value={o?.members ?? "—"} label="Members" /><Stat value={o?.suspended_members ?? "—"} label="Suspended" />
      </div>
      <div className="mt-10"><Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={[
        { key: "reports", label: "Reports", count: o?.open_reports }, { key: "organizations", label: "Organizations", count: o?.pending_organizations },
        { key: "disputes", label: "Disputes", count: o?.open_disputes }, { key: "listings", label: "Listings" }, { key: "users", label: "Members" }, { key: "log", label: "Log" },
      ]} /></div>
      {tab !== "log" && <div className="mt-6 max-w-md"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Moderation note (recorded with your next action)" data-testid="admin-note-input" /></div>}
      <div className="mt-6">
        {tab === "reports" && <Reports note={note} />}{tab === "organizations" && <Orgs note={note} />}{tab === "disputes" && <Disputes note={note} />}
        {tab === "listings" && <Listings note={note} />}{tab === "users" && <Users note={note} />}{tab === "log" && <Log />}
      </div>
    </div>
  );
}
