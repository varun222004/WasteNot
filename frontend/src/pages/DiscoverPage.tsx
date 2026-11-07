import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listingsApi } from "@/services/api";
import { useArea } from "@/hooks/useMeta";
import { Button } from "@/components/ui/Button";
import { SearchBar, Select } from "@/components/ui/Form";
import { CardSkeletonGrid, EmptyState, ErrorState } from "@/components/ui/Display";
import { ListingCard } from "@/features/listings/ListingCard";
import { CategoryChips } from "@/features/listings/CategoryChips";
import { AreaPicker } from "@/features/listings/AreaPicker";

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const category = params.get("category") ?? "";
  const radius = Number(params.get("radius") ?? 10);
  const sort = params.get("sort") ?? "nearest";
  const { area, setArea } = useArea();
  const query = useDebounced(q);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["listings", "discover", query, category, radius, sort, area?.lat, area?.lng],
    queryFn: ({ pageParam }) => listingsApi.search({ q: query, category, lat: area?.lat, lng: area?.lng, radius_km: radius, sort, page: pageParam, limit: 12 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="container-page py-10">
      <p className="eyebrow">Discover</p>
      <h1 className="mt-2 text-4xl text-olive sm:text-5xl">What's nearby</h1>
      <div className="mt-8 grid gap-3 md:grid-cols-[1fr_280px]">
        <SearchBar value={q} onChange={setQ} placeholder="Search books, sweaters, a pressure cooker…" testId="discover-search-input" />
        <AreaPicker area={area} onChange={setArea} />
      </div>
      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <CategoryChips value={category} onChange={(v) => set("category", v)} />
        {area && (
          <div className="flex gap-2">
            <Select value={radius} onChange={(e) => set("radius", e.target.value)} className="w-36 rounded-full" data-testid="radius-select" aria-label="Distance">
              <option value={2}>Within 2 km</option><option value={5}>Within 5 km</option><option value={10}>Within 10 km</option><option value={25}>Within 25 km</option>
            </Select>
            <Select value={sort} onChange={(e) => set("sort", e.target.value)} className="w-36 rounded-full" data-testid="sort-select" aria-label="Sort">
              <option value="nearest">Nearest</option><option value="recent">Most recent</option>
            </Select>
          </div>
        )}
      </div>
      {!area && <p className="mt-4 text-sm text-muted">Showing the most recent listings across Bengaluru. Pick a neighbourhood to sort by distance.</p>}
      <div className="mt-10">
        {isLoading ? <CardSkeletonGrid /> : error ? <ErrorState message={(error as Error).message} onRetry={refetch} /> :
          items.length ? (
            <>
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" data-testid="discover-results">{items.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
              {hasNextPage && <div className="mt-12 flex justify-center"><Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage} data-testid="load-more-btn">Load more</Button></div>}
            </>
          ) : (
            <EmptyState testId="discover-empty" title="No matches nearby" body="Try a wider distance, another category, or post a wanted request." />
          )}
      </div>
    </div>
  );
}
