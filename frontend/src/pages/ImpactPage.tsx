import { useQuery } from "@tanstack/react-query";
import { impactApi } from "@/services/api";
import { label } from "@/lib/format";
import { Skeleton, Stat } from "@/components/ui/Display";

export default function ImpactPage() {
  const { data, isLoading } = useQuery({ queryKey: ["impact"], queryFn: impactApi.get });
  return (
    <div className="container-page py-12">
      <p className="eyebrow">Community impact</p>
      <h1 className="mt-2 max-w-2xl text-4xl text-olive sm:text-5xl">What Bengaluru has shared so far</h1>
      <p className="mt-4 max-w-xl text-muted">Every number here comes straight from confirmed exchanges and live records. We don't estimate weights, emissions or savings.</p>
      {isLoading || !data ? <Skeleton className="mt-10 h-48" /> : (
        <>
          <div className="mt-12 grid grid-cols-2 gap-10 rounded-xl3 border border-line bg-white/60 p-8 sm:grid-cols-4" data-testid="impact-page-stats">
            <Stat value={data.completed_exchanges} label="Completed exchanges" /><Stat value={data.items_shared} label="Items shared" />
            <Stat value={data.organization_meals_shared} label="Meals shared by verified organizations" /><Stat value={data.members} label="Neighbours on WasteNot" />
            <Stat value={data.active_listings} label="Listings available now" /><Stat value={data.open_requests} label="Open wanted requests" />
            <Stat value={data.verified_organizations} label="Verified organizations" />
          </div>
          <h2 className="mt-14 text-2xl text-olive">Items shared by category</h2>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {["food", "books", "clothes", "household"].map((c) => <Stat key={c} value={data.items_by_category[c] ?? 0} label={label(c)} />)}
          </div>
          <p className="mt-12 max-w-xl text-sm text-muted">How we count: an exchange counts once both people confirm the handover, or when a verified organization marks a collection complete. One-sided or unconfirmed handovers are not counted.</p>
        </>
      )}
    </div>
  );
}
