import { useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { getCurrentPosition, useMeta, type Area } from "@/hooks/useMeta";
import { Select } from "@/components/ui/Form";

/** Picks a search area: a neighbourhood centre or a one-off GPS fix (rounded to ~1 km). */
export function AreaPicker({ area, onChange }: { area: Area | null; onChange: (a: Area | null) => void }) {
  const { data } = useMeta();
  const [locating, setLocating] = useState(false);
  const useGps = async () => {
    setLocating(true);
    try {
      const p = await getCurrentPosition();
      onChange({ label: "Near me", lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100, source: "gps" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLocating(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Select data-testid="area-select" className="rounded-full pl-10" value={area?.source === "gps" ? "__gps" : area?.label ?? ""}
          onChange={(e) => {
            const loc = data?.localities.find((l) => l.name === e.target.value);
            onChange(loc ? { label: loc.name, lat: loc.lat, lng: loc.lng, source: "locality" } : null);
          }}>
          <option value="">All of Bengaluru</option>
          {area?.source === "gps" && <option value="__gps">Near me</option>}
          {data?.localities.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </Select>
      </div>
      <button onClick={useGps} disabled={locating} aria-label="Use my location" data-testid="use-gps-btn"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white hover:border-olive/40 disabled:opacity-50">
        <LocateFixed className={locating ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
      </button>
    </div>
  );
}
