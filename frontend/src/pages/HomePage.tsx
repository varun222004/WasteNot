import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Armchair, BadgeCheck, BookOpen, Building2, CheckCheck, HandHeart, Lock, MapPin, PackageCheck, ShieldCheck, Shirt, Utensils } from "lucide-react";
import { useState } from "react";
import { impactApi, listingsApi } from "@/services/api";
import { useArea, useMeta } from "@/hooks/useMeta";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { CardSkeletonGrid, EmptyState, ErrorState, Stat } from "@/components/ui/Display";
import { ListingCard } from "@/features/listings/ListingCard";
import { CategoryChips } from "@/features/listings/CategoryChips";
import { AreaPicker } from "@/features/listings/AreaPicker";

function Hero() {
  const { user } = useAuth();
  return (
    <section className="container-page grid items-center gap-10 pb-6 pt-8 md:grid-cols-[1.05fr_1fr] md:pt-16 lg:gap-16">
      <div className="animate-rise">
        <p className="eyebrow">Bengaluru · Free, always</p>
        <h1 className="mt-5 text-5xl leading-[1.04] text-olive sm:text-6xl lg:text-7xl" data-testid="hero-heading">
          Good things deserve <em className="font-normal italic text-walnut">another life.</em>
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
          Give away surplus food, books, clothes and household things to people nearby — or ask your neighbourhood for what you need.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/discover"><Button size="lg" data-testid="hero-explore-btn">Explore nearby <ArrowRight className="h-4 w-4" /></Button></Link>
          <Link to={user ? "/listings/new" : "/login?next=/listings/new"}><Button size="lg" variant="secondary" data-testid="hero-give-btn">Give something</Button></Link>
        </div>
      </div>
      <div className="relative animate-rise [animation-delay:120ms]">
        <img src="/images/hero.jpg" alt="A basket of fresh produce on a wooden table" className="aspect-[4/3] w-full rounded-[28px] object-cover sm:aspect-[5/4] md:aspect-[4/5]" />
        <div className="absolute -bottom-6 left-4 right-auto max-w-[260px] rounded-xl2 border border-line bg-cream p-4 sm:left-[-28px]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-olive"><PackageCheck className="h-5 w-5" /></span>
            <div className="text-sm"><div className="font-medium">Reserve, collect, done.</div><div className="text-muted">Locations stay private until you agree.</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Neighbourhood() {
  const { area, setArea } = useArea();
  const [category, setCategory] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["listings", "home", area?.lat, area?.lng, category],
    queryFn: () => listingsApi.search({ lat: area?.lat, lng: area?.lng, radius_km: 25, category, limit: 6 }),
  });
  return (
    <section className="container-page pb-16 pt-14 md:pt-20" data-testid="neighbourhood-section">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">In your neighbourhood</p>
          <h2 className="mt-2 text-3xl text-olive sm:text-4xl">Fresh on WasteNot{area ? ` near ${area.label}` : ""}</h2>
        </div>
        <div className="w-full md:w-72"><AreaPicker area={area} onChange={setArea} /></div>
      </div>
      <div className="mt-6"><CategoryChips value={category} onChange={setCategory} /></div>
      <div className="mt-8">
        {isLoading ? <CardSkeletonGrid /> : error ? <ErrorState message={(error as Error).message} onRetry={refetch} /> :
          data?.items.length ? (
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
          ) : (
            <EmptyState testId="home-empty" title="Nothing here yet" body="Be the first in your neighbourhood to give something a second life."
              action={<Link to="/listings/new"><Button>Give something</Button></Link>} />
          )}
      </div>
      <div className="mt-10"><Link to="/discover" className="inline-flex items-center gap-1.5 text-sm font-medium text-olive hover:underline" data-testid="home-see-all-link">See everything nearby <ArrowRight className="h-4 w-4" /></Link></div>
    </section>
  );
}

function ImpactBand() {
  const { data } = useQuery({ queryKey: ["impact"], queryFn: impactApi.get });
  const started = [data?.completed_exchanges, data?.items_shared, data?.organization_meals_shared].some((n) => (n ?? 0) > 0);
  if (!started) {
    return (
      <section className="bg-olive py-20 text-cream" data-testid="impact-section">
        <div className="container-page max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sage">Just getting started</p>
          <h2 className="mt-3 text-3xl text-cream sm:text-4xl">Be one of the first neighbours in Bengaluru.</h2>
          <p className="mt-4 text-sm text-sage">We only count exchanges both sides confirmed, or collections reported by verified organizations. No estimates. The first numbers will appear here.</p>
          <Link to="/listings/new" className="mt-6 inline-block"><Button variant="secondary" data-testid="impact-give-btn">Give something</Button></Link>
        </div>
      </section>
    );
  }
  return (
    <section className="bg-olive py-20 text-cream" data-testid="impact-section">
      <div className="container-page grid gap-12 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sage">Community impact</p>
          <h2 className="mt-3 text-3xl text-cream sm:text-4xl">Counted honestly, one exchange at a time.</h2>
          <p className="mt-4 max-w-sm text-sm text-sage">We only count exchanges both sides confirmed, or collections reported by verified organizations. No estimates.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <Stat dark value={data?.completed_exchanges ?? "—"} label="Completed exchanges" testId="impact-exchanges" />
          <Stat dark value={data?.items_shared ?? "—"} label="Items shared" testId="impact-items" />
          <Stat dark value={data?.organization_meals_shared ?? "—"} label="Meals shared by organizations" testId="impact-meals" />
          <Stat dark value={data?.members ?? "—"} label="Neighbours" testId="impact-members" />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: HandHeart, title: "Give or ask", body: "Post what you no longer need, or a request for something you do." },
    { icon: MapPin, title: "Reserve nearby", body: "Browse by neighbourhood. Exact pickup details are shared only once a reservation is accepted." },
    { icon: PackageCheck, title: "Collect & confirm", body: "Meet, hand over, and both confirm. That's one more thing given a second life." },
  ];
  return (
    <section className="container-page py-20">
      <p className="eyebrow">How it works</p>
      <div className="mt-8 grid gap-10 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="border-t border-line pt-6">
            <div className="flex items-center gap-3 text-walnut"><span className="font-display text-sm">0{i + 1}</span><s.icon className="h-5 w-5" /></div>
            <h3 className="mt-4 text-2xl text-olive">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-16 grid items-center gap-8 overflow-hidden rounded-xl3 border border-line bg-soft/60 md:grid-cols-2">
        <img src="/images/give.jpg" alt="Ceramic bowls and wooden boards on a table" className="h-64 w-full object-cover md:h-full" />
        <div className="p-8 md:p-10">
          <h3 className="text-3xl text-olive">Looking for something?</h3>
          <p className="mt-3 text-muted">Post a wanted request. Neighbours can offer something they already have.</p>
          <Link to="/wanted" className="mt-6 inline-block"><Button variant="secondary" data-testid="home-wanted-btn">Browse wanted requests</Button></Link>
        </div>
      </div>
    </section>
  );
}


const CARD_COPY: Record<string, { body: string; icon: LucideIcon }> = {
  food: { body: "Surplus meals and groceries, shared safely.", icon: Utensils },
  books: { body: "Textbooks, novels, anything with pages.", icon: BookOpen },
  clothes: { body: "Wearable things that still have life.", icon: Shirt },
  household: { body: "Kitchenware, furniture, small appliances.", icon: Armchair },
};

function CategoryCards() {
  const { data: meta } = useMeta();
  // Built from the server's catalog so the links can never point at a category that doesn't exist, and Food is
  // hidden whenever food sharing is switched off (same rule as the filter chips and the Give form).
  const cats = (meta?.categories ?? [])
    .filter((c) => c.key !== "food" || meta?.food_sharing_enabled)
    .map((c) => ({ key: c.key, title: c.label, ...(CARD_COPY[c.key] ?? { body: "Things your neighbours are giving away.", icon: PackageCheck }) }));
  if (!cats.length) return null;
  return (
    <section className="container-page pb-4 pt-2" data-testid="category-cards">
      <p className="eyebrow">Browse by what you need</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cats.map((c) => (
          <Link key={c.key} to={`/discover?category=${c.key}`} className="group rounded-xl2 border border-line bg-cream p-6 transition-colors hover:bg-soft" data-testid={`category-card-${c.key}`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-olive"><c.icon className="h-5 w-5" /></span>
            <h3 className="mt-4 text-xl text-olive">{c.title}</h3>
            <p className="mt-1 text-sm text-muted">{c.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-olive">See {c.title.toLowerCase()} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrustSection() {
  const points = [
    { icon: Lock, title: "Your address stays private", body: "Neighbours see only your area. The exact pickup spot is shared after you accept." },
    { icon: CheckCheck, title: "Both sides confirm", body: "An exchange counts only when giver and receiver both say it happened." },
    { icon: BadgeCheck, title: "Verified organizations", body: "Cafés, caterers and community groups are checked before they get a badge." },
    { icon: ShieldCheck, title: "Food-safety rules built in", body: "Safe-until times, allergens and storage notes are required before food goes live." },
  ];
  return (
    <section className="container-page py-16" data-testid="trust-section">
      <p className="eyebrow">Why you can trust it</p>
      <h2 className="mt-2 max-w-xl text-3xl text-olive sm:text-4xl">Free, local and built to be safe.</h2>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {points.map((p) => (
          <div key={p.title}>
            <p.icon className="h-6 w-6 text-walnut" />
            <h3 className="mt-3 text-lg text-olive">{p.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrgBand() {
  return (
    <section className="container-page py-16" data-testid="org-band">
      <div className="grid items-center gap-8 rounded-xl3 border border-line bg-soft/60 p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
        <div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-olive"><Building2 className="h-5 w-5" /></span>
          <h2 className="mt-4 text-3xl text-olive sm:text-4xl">Run a café, hotel or community group?</h2>
          <p className="mt-3 max-w-lg text-muted">Share surplus food with neighbours and NGOs. Verified organizations get a badge, their listings are accepted automatically, and every collection is counted.</p>
        </div>
        <div className="md:justify-self-end"><Link to="/org"><Button size="lg" data-testid="org-band-btn">Register your organization</Button></Link></div>
      </div>
    </section>
  );
}

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="container-page pb-4 pt-8 text-center" data-testid="final-cta">
      <h2 className="mx-auto max-w-2xl text-4xl text-olive sm:text-5xl">Give something a second life today.</h2>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/discover"><Button size="lg" variant="secondary">Explore nearby</Button></Link>
        <Link to={user ? "/listings/new" : "/login?next=/listings/new"}><Button size="lg">Give something</Button></Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/discover" replace />; // signed-in members land straight on the feed
  return (<><Hero /><Neighbourhood /><CategoryCards /><HowItWorks /><TrustSection /><ImpactBand /><OrgBand /><FinalCta /></>);
}
