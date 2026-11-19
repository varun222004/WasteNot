import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = { user: null as unknown, loading: false };
const impact = { completed_exchanges: 0, items_shared: 0, organization_meals_shared: 0, members: 4 };
const meta = {
  data: {
    categories: [{ key: "food", label: "Food" }, { key: "books", label: "Books" }, { key: "clothes", label: "Clothes" }, { key: "household", label: "Household" }],
    food_sharing_enabled: true,
  },
};

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...auth, refresh: vi.fn(), logout: vi.fn() }) }));
vi.mock("@/hooks/useMeta", () => ({ useArea: () => ({ area: null, setArea: vi.fn() }), useMeta: () => meta }));
vi.mock("@/features/listings/AreaPicker", () => ({ AreaPicker: () => <div data-testid="area-picker" /> }));
vi.mock("@/services/api", () => ({
  listingsApi: { search: vi.fn().mockResolvedValue({ items: [], page: 1, has_more: false }) },
  impactApi: { get: vi.fn(async () => impact) },
}));

import HomePage from "./HomePage";

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover" element={<div data-testid="discover-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("landing page", () => {
  beforeEach(() => {
    auth.user = null; auth.loading = false;
    impact.completed_exchanges = 0; impact.items_shared = 0; impact.organization_meals_shared = 0;
    meta.data.food_sharing_enabled = true;
  });

  it("shows every landing section to a guest", async () => {
    renderHome();
    expect(screen.getByTestId("hero-heading")).toBeInTheDocument();
    expect(screen.getByTestId("category-cards")).toBeInTheDocument();
    expect(screen.getByTestId("trust-section")).toBeInTheDocument();
    expect(screen.getByTestId("org-band")).toBeInTheDocument();
    expect(screen.getByTestId("final-cta")).toBeInTheDocument();
    expect(screen.getByTestId("category-card-food")).toHaveAttribute("href", "/discover?category=food");
  });

  it("does not show a row of zeros on a brand-new platform", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText(/Be one of the first neighbours/i)).toBeInTheDocument());
    expect(screen.queryByTestId("impact-exchanges")).not.toBeInTheDocument();
  });

  it("shows the real numbers once exchanges exist", async () => {
    impact.completed_exchanges = 3;
    renderHome();
    await waitFor(() => expect(screen.getByTestId("impact-exchanges")).toBeInTheDocument());
  });

  it("sends a signed-in member straight to the feed", async () => {
    auth.user = { id: "u1", display_name: "Test" };
    renderHome();
    expect(await screen.findByTestId("discover-page")).toBeInTheDocument();
  });

  it("shows the real numbers when only organization meals exist", async () => {
    impact.organization_meals_shared = 12;
    renderHome();
    await waitFor(() => expect(screen.getByTestId("impact-meals")).toBeInTheDocument());
  });

  it("hides the Food card when food sharing is switched off", () => {
    meta.data.food_sharing_enabled = false;
    renderHome();
    expect(screen.queryByTestId("category-card-food")).not.toBeInTheDocument();
    expect(screen.getByTestId("category-card-books")).toBeInTheDocument();
  });

  it("builds the category links from the server catalog", () => {
    renderHome();
    expect(screen.getByTestId("category-card-clothes")).toHaveAttribute("href", "/discover?category=clothes");
    expect(screen.getByTestId("category-card-household")).toHaveAttribute("href", "/discover?category=household");
  });
});
