import type { Turn } from "../transcript";

/**
 * PRICING GUARDRAIL (Check 06/07). Deterministic scan of the AGENT's turns only. The caller may say
 * anything about money; the agent may say nothing. Any hit marks the call PRICING_BREACH.
 * Errs on the side of flagging: a false alarm costs Nikhil a glance, a miss costs trust.
 */

export type PricingHit = { turnIndex: number; rule: string; match: string; text: string };

const PRICE_WORDS =
  "(?:cost|costs|costing|price|prices|pricing|priced|rate|rates|charge|charges|fee|fees|budget|rupees?|rs\\.?|inr|starts?|starting|around|approx(?:imately)?|typically|roughly|ballpark|estimate|lakhs?|lacs?|crores?|thousand|k)";

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "rupee_symbol", re: /₹/ },
  { rule: "currency_word", re: /\b(?:rs\.?|inr|rupees?|lakhs?|lacs?|crores?)\b/i },
  { rule: "currency_word_hi_mr", re: /(?:रुपये|रुपए|रुपया|लाख|करोड़|करोड|हजार|हज़ार)/ },
  { rule: "per_sqft", re: /\bper\s*(?:sq\.?\s*(?:ft|feet|foot)|square\s*(?:feet|foot)|sqft)\b/i },
  { rule: "slash_sqft", re: /\/\s*(?:sq\.?\s*ft|sqft|sft|square\s*f(?:ee|oo)t)/i },
  // digits within 3 words of a price word, either order (e.g. "around 18 hundred", "18 lakh", "costs 2,000")
  { rule: "number_near_price_word", re: new RegExp(`\\b${PRICE_WORDS}\\b(?:\\W+\\w+){0,3}?\\W+\\d[\\d,.]*`, "i") },
  { rule: "number_near_price_word", re: new RegExp(`\\d[\\d,.]*\\s*(?:\\w+\\W+){0,2}?${PRICE_WORDS}\\b`, "i") },
  // spelled-out numbers with money units ("one and a half lakh", "eighteen hundred per")
  { rule: "spelled_amount", re: /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|half)\b[\w\s-]{0,20}\b(?:lakhs?|lacs?|crores?|hundred per|thousand per)\b/i },
];

// Numbers that legitimately appear near words like "around"/"starting": times, weeks, BHK, sq ft area, phone digits.
const BENIGN_NUMBER_CONTEXT =
  /\d[\d,.]*\s*(?:-|to)?\s*\d*\s*(?:weeks?|days?|months?|years?|bhk|rooms?|am|pm|o'?clock|minutes?|mins?|hours?|sq\.?\s*ft|sqft|square\s*f(?:ee|oo)t|floors?)\b/gi;

export function scanAgentTurnsForPricing(turns: Turn[]): PricingHit[] {
  const hits: PricingHit[] = [];
  turns.forEach((t, turnIndex) => {
    if (t.speaker !== "agent") return;
    const neutral = t.text.replace(BENIGN_NUMBER_CONTEXT, " <n> ");
    for (const { rule, re } of RULES) {
      const source = rule.startsWith("number_near") || rule === "spelled_amount" ? neutral : t.text;
      const m = source.match(re);
      if (m) {
        hits.push({ turnIndex, rule, match: m[0], text: t.text });
        break; // one hit per turn is enough
      }
    }
  });
  return hits;
}
