import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const resolveReport = vi.fn().mockResolvedValue({});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/api", () => ({
  adminApi: {
    overview: vi.fn().mockResolvedValue({ open_reports: 1 }),
    reports: vi.fn().mockResolvedValue([{
      id: "r1", reason: "spam", priority: "normal", target_type: "listing", target_id: "l1", target_label: "Flowers",
      target_owner: "owner", details: "looks fake", reporter: { display_name: "reporter" }, created_at: "2026-11-16T00:00:00Z",
    }]),
    resolveReport: (...args: unknown[]) => resolveReport(...args),
  },
}));

import AdminPage from "./AdminPage";

describe("admin reports", () => {
  it("has a Warn button that sends the warn action with the moderation note", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><AdminPage /></MemoryRouter></QueryClientProvider>);
    const warn = await screen.findByTestId("admin-report-warn");
    fireEvent.change(screen.getByTestId("admin-note-input"), { target: { value: "be careful" } });
    fireEvent.click(warn);
    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith("r1", "warn", "be careful"));
  });
});
