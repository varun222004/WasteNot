import { Link } from "react-router-dom";
import { BadgeCheck, Clock, MapPin, Package } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { formatDistance, label, timeAgo, timeLeft } from "@/lib/format";
import { Badge } from "@/components/ui/Display";
import type { Listing } from "@/types";

export const dietLabel = { veg: "Veg", non_veg: "Non-veg", egg: "Contains egg" } as const;

export function ListingCard({ listing }: { listing: Listing }) {
  const food = listing.food;
  return (
    <Link to={`/listings/${listing.id}`} className="group block animate-rise" data-testid={`listing-card-${listing.id}`}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl2 bg-soft">
        {listing.photo_ids[0] && (
          <img src={fileUrl(listing.photo_ids[0])} alt={listing.title} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge className="bg-cream/95">{label(listing.category)}</Badge>
          {food && <Badge tone={food.diet === "veg" ? "sage" : "amber"} className="bg-opacity-95">{dietLabel[food.diet]}</Badge>}
        </div>
        {listing.status !== "active" && (
          <span className="absolute bottom-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs text-cream">{label(listing.status)}</span>
        )}
      </div>
      <div className="mt-3 space-y-1.5 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 font-display text-lg leading-snug text-ink group-hover:text-olive">{listing.title}</h3>
          {listing.distance_km !== undefined && <span className="shrink-0 pt-1 text-xs text-muted" data-testid="listing-distance">{formatDistance(listing.distance_km)}</span>}
        </div>
        <p className="line-clamp-2 text-sm text-muted">{listing.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{listing.locality}</span>
          <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" />{listing.available} of {listing.quantity_total} left</span>
          {food ? (
            <span className="inline-flex items-center gap-1 text-walnut"><Clock className="h-3.5 w-3.5" />Safe {timeLeft(food.safe_until)}</span>
          ) : (
            <span>{timeAgo(listing.created_at)}</span>
          )}
          {listing.organization?.verified && (
            <span className="inline-flex items-center gap-1 text-olive"><BadgeCheck className="h-3.5 w-3.5" />{listing.organization.name}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
