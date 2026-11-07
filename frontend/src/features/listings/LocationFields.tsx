import { useState } from "react";
import type { UseFormSetValue, UseFormWatch } from "react-hook-form";
import { LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { getCurrentPosition, useMeta } from "@/hooks/useMeta";
import { Field, Select } from "@/components/ui/Form";
import type { ListingFormValues } from "./listingSchema";

/** Chooses where the item is. Only the neighbourhood is public; exact coordinates stay private. */
export function LocationFields({ watch, setValue, error, savedLocation }: {
  watch: UseFormWatch<ListingFormValues>; setValue: UseFormSetValue<ListingFormValues>; error?: string;
  savedLocation?: { label: string; lat: number; lng: number } | null;
}) {
  const { data } = useMeta();
  const [gps, setGps] = useState(false);
  const locality = watch("locality");
  const choose = (name: string) => {
    const l = data?.localities.find((x) => x.name === name);
    if (!l) return;
    setValue("locality", l.name, { shouldValidate: true });
    setValue("lat", l.lat);
    setValue("lng", l.lng);
    setGps(false);
  };
  const useGps = async () => {
    try {
      const p = await getCurrentPosition();
      setValue("lat", p.lat);
      setValue("lng", p.lng);
      setGps(true);
      toast.success("Location set. Only your neighbourhood will be shown publicly.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const useSaved = () => {
    if (!savedLocation) return;
    setValue("lat", savedLocation.lat);
    setValue("lng", savedLocation.lng);
    setGps(true);
    toast.success(`Using saved location: ${savedLocation.label}`);
  };
  return (
    <div className="space-y-3">
      <Field label="Neighbourhood (shown publicly)" error={error}>
        <Select value={locality} onChange={(e) => choose(e.target.value)} data-testid="listing-locality-select">
          <option value="">Choose a neighbourhood</option>
          {data?.localities.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={useGps} data-testid="listing-use-gps-btn"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white px-3 hover:border-olive/40">
          <LocateFixed className="h-4 w-4" />{gps ? "Precise location set" : "Use my current location"}
        </button>
        {savedLocation && (
          <button type="button" onClick={useSaved} className="h-10 rounded-full border border-line bg-white px-3 hover:border-olive/40" data-testid="listing-use-saved-btn">
            Use saved: {savedLocation.label}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">Public listings show only the neighbourhood and an approximate distance. Exact details are shared only after you accept a reservation.</p>
    </div>
  );
}
