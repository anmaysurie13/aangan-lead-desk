import { describe, expect, it } from "vitest";
import { scanAgentTurnsForPricing } from "./pricing";
import { knowledge } from "../knowledge";
import type { Turn } from "../transcript";

const agent = (text: string): Turn[] => [{ speaker: "agent", text }];

describe("pricing guardrail", () => {
  it("allows the approved pricing line from pricing.md", () => {
    expect(scanAgentTurnsForPricing(agent(knowledge.parsed.pricingApprovedLine))).toEqual([]);
  });

  it.each([
    "Our rates start at ₹1,800 per sq ft.",
    "For a 2BHK it's typically around 8 lakh.",
    "It usually costs about 2000 per square foot.",
    "Roughly 1,800/sqft for standard spec.",
    "Single rooms are 3.5 to 8 lakhs.",
    "Somewhere between one and a half lakh and two lakh.",
    "It'll cost around 12 to 14 lakh all in.",
    "Rs 2400 is the premium rate.",
    "इसका खर्च लगभग 10 लाख होगा",
    "The basic fitout is 1200 rupees.",
  ])("flags: %s", (text) => {
    expect(scanAgentTurnsForPricing(agent(text)).length).toBe(1);
  });

  it.each([
    "So that's a 3BHK in Baner, about 1,200 sq ft carpet, and you'd like it done in 12 weeks?",
    "Would Thursday at 11 am or Friday at 4 pm work for the consultation?",
    "Execution usually takes around 8 to 16 weeks depending on the site.",
    "Can I confirm your number ends in 4521?",
    "Design typically takes 3 to 4 weeks from the first consultation.",
  ])("does not flag: %s", (text) => {
    expect(scanAgentTurnsForPricing(agent(text))).toEqual([]);
  });

  it("ignores the caller's own money talk", () => {
    const turns: Turn[] = [
      { speaker: "caller", text: "My budget is 1.5 lakh, is ₹1500 per sq ft okay?" },
      { speaker: "agent", text: knowledge.parsed.pricingApprovedLine },
    ];
    expect(scanAgentTurnsForPricing(turns)).toEqual([]);
  });
});
