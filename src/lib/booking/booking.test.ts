import { describe, expect, it } from "vitest";
import { pickSlots } from "./booking";

describe("pickSlots", () => {
  it("offers the earliest slot and the earliest on a different IST day", () => {
    expect(pickSlots(["2026-10-12T03:30:00Z", "2026-10-12T04:00:00Z", "2026-10-13T03:30:00Z"])).toEqual(["2026-10-12T03:30:00Z", "2026-10-13T03:30:00Z"]);
  });
  it("falls back to the second slot the same day", () => {
    expect(pickSlots(["2026-10-12T03:30:00Z", "2026-10-12T04:00:00Z"])).toEqual(["2026-10-12T03:30:00Z", "2026-10-12T04:00:00Z"]);
  });
  it("handles none and one", () => {
    expect(pickSlots([])).toEqual([]);
    expect(pickSlots(["x"])).toEqual(["x"]);
  });
});