import { cn } from "@/lib/format";
import { useMeta } from "@/hooks/useMeta";

export function CategoryChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useMeta();
  const cats = [{ key: "", label: "Everything" }, ...(data?.categories ?? []).filter((c) => c.key !== "food" || data?.food_sharing_enabled)];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Categories">
      {cats.map((c) => (
        <button key={c.key || "all"} onClick={() => onChange(c.key)} data-testid={`category-chip-${c.key || "all"}`}
          className={cn("h-10 shrink-0 rounded-full border px-4 text-sm transition-colors",
            value === c.key ? "border-olive bg-olive text-cream" : "border-line bg-white/70 text-ink hover:border-olive/40")}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
