import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listingsApi, requestsApi, reservationsApi, usersApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { CardSkeletonGrid, EmptyState, Stat, Tabs } from "@/components/ui/Display";
import { ListingCard } from "@/features/listings/ListingCard";
import { ReservationRow } from "@/features/reservations/ReservationRow";
import { RequestCard } from "./WantedPage";
import type { Listing } from "@/types";

type Tab = "listings" | "incoming" | "reservations" | "requests" | "saved";

function MyListings() {
  const { data, isLoading } = useQuery({ queryKey: ["listings", "mine"], queryFn: usersApi.myListings });
  if (isLoading) return <CardSkeletonGrid count={3} />;
  if (!data?.length) return <EmptyState testId="my-listings-empty" title="You haven't listed anything" action={<Link to="/listings/new"><Button>Give something</Button></Link>} />;
  return <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{data.map((l) => <ListingCard key={l.id} listing={l} />)}</div>;
}

function Reservations({ role }: { role: "owner" | "requester" }) {
  const { data, isLoading } = useQuery({ queryKey: ["reservations", role], queryFn: () => reservationsApi.list({ role, limit: 50 }), refetchInterval: 30_000 });
  if (isLoading) return <CardSkeletonGrid count={2} />;
  if (!data?.items.length) return <EmptyState testId={`reservations-${role}-empty`} title={role === "owner" ? "No reservation requests yet" : "No reservations yet"}
    action={role === "requester" ? <Link to="/discover"><Button>Explore nearby</Button></Link> : undefined} />;
  return <div className="space-y-3">{data.items.map((r) => <ReservationRow key={r.id} r={r} />)}</div>;
}

function MyRequests() {
  const { data, isLoading } = useQuery({ queryKey: ["requests", "mine"], queryFn: requestsApi.mine });
  if (isLoading) return <CardSkeletonGrid count={2} />;
  if (!data?.length) return <EmptyState testId="my-requests-empty" title="No wanted requests" action={<Link to="/wanted"><Button>Post a request</Button></Link>} />;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((r) => <RequestCard key={r.id} r={r} />)}</div>;
}

function Saved() {
  const { user } = useAuth();
  const ids = user?.saved_listing_ids ?? [];
  const { data, isLoading } = useQuery({ queryKey: ["saved", ids], queryFn: () => Promise.all(ids.map((id) => listingsApi.get(id).catch(() => null))) });
  if (isLoading) return <CardSkeletonGrid count={3} />;
  const items = (data ?? []).filter(Boolean) as Listing[];
  if (!items.length) return <EmptyState testId="saved-empty" title="Nothing saved yet" body="Tap Save on any listing to keep it here." />;
  return <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{items.map((l) => <ListingCard key={l.id} listing={l} />)}</div>;
}

export default function MyActivityPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "listings";
  const tabs: { key: Tab; label: string }[] = [
    { key: "listings", label: "My listings" }, { key: "incoming", label: "Requests for my items" },
    { key: "reservations", label: "My reservations" }, { key: "requests", label: "My wanted requests" }, { key: "saved", label: "Saved" },
  ];
  return (
    <div className="container-page py-10">
      <p className="eyebrow">My activity</p>
      <h1 className="mt-2 text-4xl text-olive sm:text-5xl">Hello, {user?.display_name}</h1>
      <div className="mt-8 grid grid-cols-3 gap-6 sm:max-w-xl" data-testid="my-stats">
        <Stat value={user?.stats.given ?? 0} label="Given" />
        <Stat value={user?.stats.received ?? 0} label="Received" />
        <Stat value={user?.stats.completed ?? 0} label="Exchanges" />
      </div>
      {user?.restricted_until && new Date(user.restricted_until) > new Date() && (
        <p className="mt-6 rounded-xl2 bg-danger-100 p-4 text-sm text-danger">Reservations are paused until {new Date(user.restricted_until).toLocaleDateString()} after repeated no-shows.</p>
      )}
      <div className="mt-10"><Tabs tabs={tabs} value={tab} onChange={(k) => setParams({ tab: k })} /></div>
      <div className="mt-8">
        {tab === "listings" && <MyListings />}
        {tab === "incoming" && <Reservations role="owner" />}
        {tab === "reservations" && <Reservations role="requester" />}
        {tab === "requests" && <MyRequests />}
        {tab === "saved" && <Saved />}
      </div>
    </div>
  );
}
