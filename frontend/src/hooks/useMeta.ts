import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { listingsApi } from "@/services/api";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: listingsApi.meta, staleTime: Infinity });
}

export type Area = { label: string; lat: number; lng: number; source: "locality" | "gps" };
const KEY = "wn_area";

function read(): Area | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

/** Search area preference. GPS fixes are rounded (~1 km) before being stored; no continuous tracking. */
export function useArea() {
  const [area, setAreaState] = useState<Area | null>(read);
  const setArea = useCallback((a: Area | null) => {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
    setAreaState(a);
  }, []);
  return { area, setArea };
}

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available on this device"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("We couldn't get your location. Pick a neighbourhood instead.")),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}
