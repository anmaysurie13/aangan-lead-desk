import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+14155551234", "+14155551234"],
  ])("%s → %s", (input, want) => expect(normalizePhone(input)).toBe(want));
  it.each(["12345", "5876543210", "", null, undefined, "abc"])("rejects %s", (input) => expect(normalizePhone(input as string)).toBeNull());
});
