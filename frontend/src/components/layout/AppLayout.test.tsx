import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = { user: null as unknown, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...auth, refresh: vi.fn(), logout: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  notificationsApi: { unread: vi.fn().mockResolvedValue({ count: 0 }) },
  messagesApi: { unread: vi.fn().mockResolvedValue({ count: 0 }) },
}));

import { AppLayout } from "./AppLayout";

function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><AppLayout /></MemoryRouter></QueryClientProvider>);
}

describe("navigation", () => {
  beforeEach(() => { auth.user = null; auth.loading = false; });

  it("guest: header links to organizations, bottom bar has Home, Discover, Wanted and Sign in", () => {
    renderLayout();
    expect(screen.getByTestId("nav-orgs")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-activity")).not.toBeInTheDocument();
    const bar = within(screen.getByTestId("bottom-nav"));
    for (const t of ["Home", "Discover", "Wanted", "Sign in"]) expect(bar.getByText(t)).toBeInTheDocument();
    expect(bar.queryByText("Messages")).not.toBeInTheDocument();
  });

  it("signed in: My activity is one click away in the header and bottom bar", () => {
    auth.user = { id: "u1", display_name: "Test", email: "t@test.dev", role: "user", avatar_file_id: null, organization: null };
    renderLayout();
    expect(screen.getByTestId("nav-activity")).toHaveAttribute("href", "/me");
    const bar = within(screen.getByTestId("bottom-nav"));
    for (const t of ["Discover", "Wanted", "Activity", "Messages"]) expect(bar.getByText(t)).toBeInTheDocument();
    expect(bar.queryByText("Sign in")).not.toBeInTheDocument();
  });
});
