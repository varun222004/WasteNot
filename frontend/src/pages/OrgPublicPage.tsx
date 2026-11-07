import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin } from "lucide-react";
import { orgsApi } from "@/services/api";
import { label } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, Skeleton } from "@/components/ui/Display";
import { ListingCard } from "@/features/listings/ListingCard";
import { ReportButton } from "@/features/safety/ReportButton";

export default function OrgPublicPage() {
  const { id } = useParams();
  const { data: o, isLoading, error } = useQuery({ queryKey: ["org", id], queryFn: () => orgsApi.get(id!) });
  if (isLoading) return <div className="container-page py-10"><Skeleton className="h-64" /></div>;
  if (error || !o) return <div className="container-page py-10"><ErrorState message={(error as Error)?.message ?? "Not found"} /></div>;
  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar name={o.name} fileId={o.logo_file_id} size={88} />
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-4xl text-olive" data-testid="org-public-name">{o.name}<BadgeCheck className="h-6 w-6" /></h1>
          <p className="mt-1 text-sm text-muted">{label(o.category)} · Verified organization</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 text-muted" />{o.address}</p>
        </div>
        <ReportButton targetType="organization" targetId={o.id} />
      </div>
      <p className="mt-6 max-w-2xl leading-relaxed">{o.description}</p>
      <h2 className="mt-12 text-2xl text-olive">Available now</h2>
      <div className="mt-6">
        {o.listings.length ? <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{o.listings.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
          : <EmptyState title="Nothing available right now" body="Check back soon." />}
      </div>
    </div>
  );
}
