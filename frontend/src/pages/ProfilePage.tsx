import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MailCheck } from "lucide-react";
import { usersApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, Badge, ErrorState, Skeleton, Stat } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { ReportButton } from "@/features/safety/ReportButton";
import { BlockButton } from "@/features/safety/BlockButton";

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: p, isLoading, error } = useQuery({ queryKey: ["profile", id], queryFn: () => usersApi.profile(id!) });
  if (isLoading) return <div className="container-page py-12"><Skeleton className="h-60" /></div>;
  if (error || !p) return <div className="container-page py-12"><ErrorState message={(error as Error)?.message ?? "Not found"} /></div>;
  const isMe = user?.id === p.id;
  return (
    <div className="container-page max-w-3xl py-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={p.display_name} fileId={p.avatar_file_id} size={96} />
        <div className="flex-1">
          <h1 className="text-4xl text-olive" data-testid="profile-name">{p.display_name}</h1>
          <p className="mt-1 text-sm text-muted">{p.locality || "Bengaluru"} · Member since {new Date(p.member_since).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.badges.includes("email_verified") && <Badge tone="sage"><MailCheck className="h-3.5 w-3.5" />Verified email</Badge>}
            {p.badges.includes("verified_organization") && p.organization && (
              <Link to={`/org/${p.organization.id}`}><Badge tone="olive"><BadgeCheck className="h-3.5 w-3.5" />{p.organization.name}</Badge></Link>
            )}
          </div>
        </div>
        {isMe ? <Link to="/settings"><Button variant="secondary" data-testid="edit-profile-btn">Edit profile</Button></Link> : (
          <div className="flex"><BlockButton userId={p.id} name={p.display_name} /><ReportButton targetType="user" targetId={p.id} /></div>
        )}
      </div>
      {p.bio && <p className="mt-8 max-w-xl leading-relaxed">{p.bio}</p>}
      <div className="mt-10 grid grid-cols-3 gap-6 rounded-xl3 border border-line bg-white/60 p-6" data-testid="profile-stats">
        <Stat value={p.stats.given} label="Things given" />
        <Stat value={p.stats.received} label="Things received" />
        <Stat value={p.stats.completed} label="Completed exchanges" />
      </div>
      <p className="mt-3 text-xs text-muted">Only exchanges confirmed by both people (or by a verified organization) are counted.</p>
    </div>
  );
}
