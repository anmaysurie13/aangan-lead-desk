import { describe, expect, it } from "vitest";
import { median, parseRange, pct } from "./metrics";

describe("metrics helpers", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("pct rounds to 1 dp and handles zero", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(0, 0)).toBeNull();
  });
  it("month ranges use IST month boundaries", () => {
    const r = parseRange({ month: "2026-09" });
    expect(r.from.toISOString()).toBe("2026-08-31T18:30:00.000Z"); // 1 Sep 00:00 IST
    expect(r.to.toISOString()).toBe("2026-09-30T18:30:00.000Z"); // 1 Oct 00:00 IST
  });
  it("custom range is inclusive of the end day", () => {
    const r = parseRange({ from: "2026-09-01", to: "2026-09-02" });
    expect((r.to.getTime() - r.from.getTime()) / 86_400_000).toBe(2);
  });
});
