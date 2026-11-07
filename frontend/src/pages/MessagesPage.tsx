import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { messagesApi } from "@/services/api";
import { cn, timeAgo } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, Skeleton } from "@/components/ui/Display";

function ConversationList({ activeId }: { activeId?: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: messagesApi.conversations, refetchInterval: 15_000 });
  if (isLoading) return <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (!data?.length) return <div className="p-4"><EmptyState testId="conversations-empty" title="No conversations yet" body="Chats open once a reservation or offer is accepted." /></div>;
  return (
    <ul className="divide-y divide-line" data-testid="conversation-list">
      {data.map((c) => (
        <li key={c.id}>
          <Link to={`/messages/${c.id}`} data-testid={`conversation-${c.id}`} className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-soft/60", activeId === c.id && "bg-soft")}>
            <Avatar name={c.other?.display_name} fileId={c.other?.avatar_file_id} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2"><span className="truncate font-medium">{c.other?.display_name}</span><span className="shrink-0 text-xs text-muted">{timeAgo(c.last_message_at)}</span></div>
              <div className="truncate text-xs text-muted">{c.listing.title}</div>
              <div className={cn("truncate text-sm", c.unread ? "font-medium text-ink" : "text-muted")}>{c.last_message ?? "Say hello"}</div>
            </div>
            {c.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber" aria-label="Unread" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["thread", id], queryFn: () => messagesApi.thread(id), refetchInterval: 5_000 });
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    qc.invalidateQueries({ queryKey: ["unread", "messages"] });
  }, [count, qc]);
  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (error || !data) return <div className="p-6"><ErrorState message={(error as Error)?.message ?? "Not found"} /></div>;
  const c = data.conversation;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await messagesApi.send(id, text.trim());
      setText("");
      qc.invalidateQueries({ queryKey: ["thread", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link to="/messages" className="rounded-full p-2 hover:bg-soft md:hidden" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
        <Avatar name={c.other?.display_name} fileId={c.other?.avatar_file_id} size={36} />
        <div className="min-w-0 flex-1"><div className="font-medium">{c.other?.display_name}</div><Link to={`/reservations/${c.reservation_id}`} className="truncate text-xs text-muted hover:underline">{c.listing.title}</Link></div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="message-thread">
        {data.messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Agree on a pickup time and place. Phone numbers are never shared automatically.</p>}
        {data.messages.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px]", m.mine ? "rounded-br-md bg-olive text-cream" : "rounded-bl-md border border-line bg-white")} data-testid="message-bubble">
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className={cn("mt-1 text-[11px]", m.mine ? "text-sage" : "text-muted")}>{timeAgo(m.created_at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {c.read_only ? (
        <div className="flex items-center justify-center gap-2 border-t border-line p-4 text-sm text-muted" data-testid="conversation-readonly"><Lock className="h-4 w-4" />{c.blocked ? "Messaging is unavailable." : "This conversation is closed."}</div>
      ) : (
        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Write a message" data-testid="message-input"
            className="h-11 flex-1 rounded-full border border-line bg-white px-4 text-[15px] focus:border-olive focus:outline-none" />
          <button type="submit" disabled={sending || !text.trim()} aria-label="Send" data-testid="message-send-btn"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-olive text-cream disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </form>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const { id } = useParams();
  return (
    <div className="container-page py-6 md:py-10">
      <h1 className={cn("mb-6 text-4xl text-olive", id && "hidden md:block")}>Messages</h1>
      <div className="grid h-[calc(100vh-220px)] min-h-[420px] overflow-hidden rounded-xl3 border border-line bg-white/60 md:grid-cols-[320px_1fr]">
        <div className={cn("overflow-y-auto border-line md:border-r", id && "hidden md:block")}><ConversationList activeId={id} /></div>
        <div className={cn(!id && "hidden md:block")}>
          {id ? <Thread id={id} /> : <div className="flex h-full items-center justify-center p-6 text-sm text-muted">Choose a conversation</div>}
        </div>
      </div>
    </div>
  );
}
