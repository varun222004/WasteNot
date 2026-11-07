import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/services/api";
import { cn, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/Display";
import type { Notification } from "@/types";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.has_more ? l.page + 1 : undefined),
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread", "notifications"] });
  };
  const open = async (n: Notification) => {
    if (!n.read) await notificationsApi.read(n.id);
    refresh();
    if (n.link) navigate(n.link);
  };
  return (
    <div className="container-page max-w-2xl py-10">
      <div className="flex items-end justify-between">
        <h1 className="text-4xl text-olive">Notifications</h1>
        <Button size="sm" variant="secondary" onClick={async () => { await notificationsApi.readAll(); refresh(); }} data-testid="mark-all-read-btn">Mark all as read</Button>
      </div>
      <div className="mt-8">
        {isLoading ? <Skeleton className="h-64" /> : items.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl3 border border-line bg-white/60" data-testid="notification-list">
            {items.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className="flex w-full gap-3 px-5 py-4 text-left hover:bg-soft/60" data-testid={`notification-${n.id}`}>
                  <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-amber")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.read && "font-medium")}>{n.title}</span>
                    {n.body && <span className="block truncate text-sm text-muted">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState testId="notifications-empty" title="All quiet" body="Reservation updates, offers and messages will appear here." />}
        {hasNextPage && <div className="mt-6 flex justify-center"><Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>Load more</Button></div>}
      </div>
    </div>
  );
}
