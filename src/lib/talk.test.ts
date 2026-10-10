import { describe, expect, it } from "vitest";
import { cleanName, greeting } from "./talk";
import { scanAgentTurnsForPricing } from "./guardrail/pricing";

describe("talk helpers", () => {
  it("keeps real names, strips markup and symbols", () => {
    expect(cleanName("  Priya   Joshi ")).toBe("Priya Joshi");
    expect(cleanName("प्रिया शर्मा")).toBe("प्रिया शर्मा");
    expect(cleanName("O'Neil-Rao Jr.")).toBe("O'Neil-Rao Jr.");
    expect(cleanName("<script>alert(1)</script>")).toBe("scriptalertscript");
    expect(cleanName("x".repeat(100))).toHaveLength(40);
    expect(cleanName(undefined)).toBe("");
  });
  it("greets by name, with the recording disclosure, in both languages", () => {
    expect(greeting("Priya", "en")).toMatch(/^Namaste Priya, thank you for calling Aangan Studio\. This call is recorded/);
    expect(greeting("", "en")).toMatch(/^Namaste, thank you/);
    expect(greeting("Priya", "hi")).toContain("Priya");
    expect(greeting("Priya", "hi")).toContain("रिकॉर्ड");
  });
  it("greetings never trip the pricing guardrail", () => {
    expect(scanAgentTurnsForPricing([{ speaker: "agent", text: greeting("Priya", "en") }])).toEqual([]);
  });
});
