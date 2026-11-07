import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { authApi, usersApi } from "@/services/api";
import type { Me } from "@/types";

type AuthCtx = { user: Me | null; loading: boolean; refresh: () => Promise<unknown>; logout: () => Promise<void> };
const Ctx = createContext<AuthCtx | null>(null);

async function fetchMe(): Promise<Me | null> {
  try {
    return await usersApi.me();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: 60_000 });
  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "meta" });
  }, [qc]);
  return <Ctx.Provider value={{ user: data ?? null, loading: isLoading, refresh: refetch, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Returns a guard that sends anonymous visitors to sign in, then back here. */
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (action: () => void) => {
      if (user) return action();
      if (loading) return;
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    },
    [user, loading, navigate, location]
  );
}
