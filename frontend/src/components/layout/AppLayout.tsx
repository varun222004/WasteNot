import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardList, Compass, HandHeart, House, MessageCircle, Plus, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { messagesApi, notificationsApi } from "@/services/api";
import { Avatar } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/format";
import { Logo } from "./Logo";

function useUnread(enabled: boolean) {
  const n = useQuery({ queryKey: ["unread", "notifications"], queryFn: notificationsApi.unread, enabled, refetchInterval: 30_000 });
  const m = useQuery({ queryKey: ["unread", "messages"], queryFn: messagesApi.unread, enabled, refetchInterval: 15_000 });
  return { notifications: n.data?.count ?? 0, messages: m.data?.count ?? 0 };
}

function Dot({ count, testId }: { count: number; testId: string }) {
  if (!count) return null;
  return <span data-testid={testId} className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber px-1 text-center text-[11px] font-semibold leading-[18px] text-olive-900">{count > 9 ? "9+" : count}</span>;
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  if (!user) return null;
  const items = [
    { to: `/u/${user.id}`, label: "Public profile" },
    { to: "/me", label: "My activity" },
    { to: "/org", label: user.organization ? "Organization" : "Register an organization" },
    ...(user.role === "admin" ? [{ to: "/admin", label: "Admin" }] : []),
    { to: "/settings", label: "Settings" },
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-11 items-center rounded-full" aria-label="Account menu" data-testid="user-menu-btn">
        <Avatar name={user.display_name} fileId={user.avatar_file_id} size={36} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-56 animate-rise rounded-xl2 border border-line bg-cream p-2" data-testid="user-menu">
          <div className="px-3 py-2 text-sm"><div className="font-medium">{user.display_name}</div><div className="truncate text-xs text-muted">{user.email}</div></div>
          {items.map((i) => (
            <Link key={i.to} to={i.to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm hover:bg-soft" data-testid={`menu-${i.label.toLowerCase().replace(/\s+/g, "-")}`}>{i.label}</Link>
          ))}
          <button onClick={async () => { setOpen(false); await logout(); navigate("/"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-soft" data-testid="logout-btn">Log out</button>
        </div>
      )}
    </div>
  );
}

function Header({ unread }: { unread: { notifications: number; messages: number } }) {
  const { user, loading } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) => cn("text-sm transition-colors", isActive ? "text-olive font-medium" : "text-muted hover:text-ink");
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/90 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          <NavLink to="/discover" className={link} data-testid="nav-discover">Discover</NavLink>
          <NavLink to="/wanted" className={link} data-testid="nav-wanted">Wanted</NavLink>
          <NavLink to="/impact" className={link} data-testid="nav-impact">Impact</NavLink>
          {user
            ? <NavLink to="/me" className={link} data-testid="nav-activity">My activity</NavLink>
            : <NavLink to="/org" className={link} data-testid="nav-orgs">For organizations</NavLink>}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/listings/new" className="hidden md:block"><Button size="sm" data-testid="header-give-btn"><Plus className="h-4 w-4" />Give something</Button></Link>
              <Link to="/messages" className="relative hidden h-11 w-11 items-center justify-center rounded-full hover:bg-soft md:flex" aria-label="Messages" data-testid="header-messages-btn">
                <MessageCircle className="h-5 w-5" /><Dot count={unread.messages} testId="messages-unread-count" />
              </Link>
              <Link to="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" aria-label="Notifications" data-testid="header-notifications-btn">
                <Bell className="h-5 w-5" /><Dot count={unread.notifications} testId="notifications-unread-count" />
              </Link>
              <UserMenu />
            </>
          ) : !loading ? (
            <Link to="/login"><Button size="sm" variant="secondary" data-testid="header-signin-btn">Sign in</Button></Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function BottomNav({ messages }: { messages: number }) {
  const { user } = useAuth();
  const item = ({ isActive }: { isActive: boolean }) => cn("flex flex-1 flex-col items-center gap-1 py-2 text-[11px]", isActive ? "text-olive" : "text-muted");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" data-testid="bottom-nav">
      <div className="flex items-end">
        {!user && <NavLink to="/" end className={item} data-testid="bottom-home"><House className="h-5 w-5" />Home</NavLink>}
        <NavLink to="/discover" className={item}><Compass className="h-5 w-5" />Discover</NavLink>
        {user && <NavLink to="/wanted" className={item}><HandHeart className="h-5 w-5" />Wanted</NavLink>}
        <Link to={user ? "/listings/new" : "/login?next=/listings/new"} className="flex flex-1 justify-center" aria-label="Give something" data-testid="bottom-give-btn">
          <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-olive text-cream ring-4 ring-cream"><Plus className="h-6 w-6" /></span>
        </Link>
        {user ? (
          <>
            <NavLink to="/me" className={item} data-testid="bottom-activity"><ClipboardList className="h-5 w-5" />Activity</NavLink>
            <NavLink to="/messages" className={item}><span className="relative"><MessageCircle className="h-5 w-5" /><Dot count={messages} testId="bottom-messages-unread" /></span>Messages</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/wanted" className={item}><HandHeart className="h-5 w-5" />Wanted</NavLink>
            <NavLink to="/login" className={item} data-testid="bottom-signin"><UserRound className="h-5 w-5" />Sign in</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line pb-28 pt-12 md:pb-12">
      <div className="container-page flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-sm space-y-3">
          <Logo />
          <p className="font-display text-xl text-olive">Good things deserve another life.</p>
          <p className="text-sm text-muted">A free community-sharing platform, piloting in Bengaluru.</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted">
          <Link to="/discover" className="hover:text-ink">Discover</Link>
          <Link to="/wanted" className="hover:text-ink">Wanted</Link>
          <Link to="/impact" className="hover:text-ink">Community impact</Link>
          <Link to="/org" className="hover:text-ink">For organizations</Link>
        </div>
      </div>
      <div className="container-page mt-10 text-xs text-muted">© {new Date().getFullYear()} WasteNot</div>
    </footer>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const unread = useUnread(!!user);
  return (
    <div className="flex min-h-screen flex-col">
      <Header unread={unread} />
      <main className="flex-1"><Outlet /></main>
      <Footer />
      <BottomNav messages={unread.messages} />
    </div>
  );
}
