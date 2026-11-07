import type { ReactNode } from "react";
import { BadgeCheck, Leaf } from "lucide-react";
import { cn } from "@/lib/format";
import { fileUrl } from "@/lib/api";

type Tone = "neutral" | "olive" | "sage" | "amber" | "danger" | "walnut";
const tones: Record<Tone, string> = {
  neutral: "bg-soft text-ink",
  olive: "bg-olive text-cream",
  sage: "bg-sage-100 text-olive",
  amber: "bg-amber-100 text-walnut",
  danger: "bg-danger-100 text-danger",
  walnut: "bg-walnut/10 text-walnut",
};

export function Badge({ tone = "neutral", children, className, testId }: {
  tone?: Tone; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function VerifiedMark({ label = "Verified organization" }: { label?: string }) {
  return <BadgeCheck className="h-4 w-4 text-olive" aria-label={label} />;
}

export function Avatar({ name, fileId, size = 40 }: { name?: string; fileId?: string | null; size?: number }) {
  const initials = (name || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return fileId ? (
    <img src={fileUrl(fileId)} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full border border-line object-cover" />
  ) : (
    <span style={{ width: size, height: size, fontSize: size * 0.38 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-sage-100 font-medium text-olive">
      {initials}
    </span>
  );
}

export function EmptyState({ title, body, action, testId }: { title: string; body?: string; action?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center rounded-xl3 border border-dashed border-line bg-white/50 px-6 py-14 text-center">
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-olive"><Leaf className="h-5 w-5" /></span>
      <h3 className="text-xl text-olive">{title}</h3>
      {body && <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl2 border border-danger/30 bg-danger-100/50 p-5 text-sm text-danger" role="alert" data-testid="error-state">
      {message}
      {onRetry && <button onClick={onRetry} className="ml-3 font-medium underline">Try again</button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="listing-skeletons">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3"><Skeleton className="aspect-[4/3] w-full rounded-xl2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void;
}) {
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} data-testid={`tab-${t.key}`}
          className={cn("relative h-11 shrink-0 px-3 text-sm font-medium transition-colors",
            value === t.key ? "text-olive after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-olive" : "text-muted hover:text-ink")}>
          {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-walnut">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({ value, label, testId, dark }: { value: number | string; label: string; testId?: string; dark?: boolean }) {
  return (
    <div data-testid={testId}>
      <div className={cn("font-display text-4xl", dark ? "text-cream" : "text-olive")}>{value}</div>
      <div className={cn("mt-1 text-sm", dark ? "text-sage" : "text-muted")}>{label}</div>
    </div>
  );
}
