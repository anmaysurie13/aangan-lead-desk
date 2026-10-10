import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

beforeAll(() => {
  process.env.AUTH_SECRET = "test_auth_secret";
  process.env.DASHBOARD_PASSWORD = "correct horse";
  process.env.APP_BASE_URL = "https://example.test";
});

describe("dashboard password + signed links", () => {
  it("accepts only the right password", async () => {
    const { passwordOk } = await import("./auth");
    expect(passwordOk("correct horse")).toBe(true);
    expect(passwordOk("wrong")).toBe(false);
    expect(passwordOk("")).toBe(false);
  });
  it("signed claim links verify, and any tampering fails", async () => {
    const { signedLink, verifySignedParams } = await import("./auth");
    const url = new URL(signedLink("claim", { e: "enq-1", d: "des-1" }));
    expect(verifySignedParams("claim", url.searchParams)).toBe(true);
    const tampered = new URLSearchParams(url.searchParams);
    tampered.set("e", "enq-2");
    expect(verifySignedParams("claim", tampered)).toBe(false);
    expect(verifySignedParams("rate", url.searchParams)).toBe(false); // wrong purpose
  });
  it("rating links are bound to the rating value", async () => {
    const { signedLink, verifySignedParams } = await import("./auth");
    const url = new URL(signedLink("rate", { e: "enq-1", r: "5" }));
    expect(verifySignedParams("rate", url.searchParams)).toBe(true);
    const forged = new URLSearchParams(url.searchParams);
    forged.set("r", "1");
    expect(verifySignedParams("rate", forged)).toBe(false);
  });
});
