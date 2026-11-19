import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { formatDistance, historyNote, label } from "./format";
import { ListingCard } from "@/features/listings/ListingCard";
import type { Listing } from "@/types";

describe("format helpers", () => {
  it("formats distances without fake precision", () => {
    expect(formatDistance(0.4)).toBe("< 1 km");
    expect(formatDistance(3.26)).toBe("3.3 km");
    expect(formatDistance(14.2)).toBe("14 km");
  });
  it("humanises keys", () => {
    expect(label("no_show")).toBe("No show");
  });
});

describe("ListingCard", () => {
  it("shows title, locality and quantity", () => {
    const l = {
      id: "1", title: "Story books", description: "Ten books", category: "books", mode: "giveaway", locality: "Indiranagar",
      available: 2, quantity_total: 3, photo_ids: [], created_at: new Date().toISOString(), status: "active",
    } as unknown as Listing;
    render(<MemoryRouter><ListingCard listing={l} /></MemoryRouter>);
    expect(screen.getByText("Story books")).toBeInTheDocument();
    expect(screen.getByText("Indiranagar")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 left")).toBeInTheDocument();
  });
});

describe("historyNote", () => {
  it("turns internal field names into plain words", () => {
    expect(historyNote("owner_confirmed_at")).toBe("Giver confirmed the handover");
    expect(historyNote("requester_confirmed_at")).toBe("Receiver confirmed the handover");
  });
  it("leaves real notes alone and handles empty values", () => {
    expect(historyNote("I was there at 5")).toBe("I was there at 5");
    expect(historyNote(null)).toBe("");
    expect(historyNote(undefined)).toBe("");
  });
});
