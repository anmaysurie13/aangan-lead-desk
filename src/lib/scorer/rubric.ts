import type { ModelVerdict, Verdict } from "./schema";

/**
 * The ONE place qualified.md's boundary rules are enforced in code (Check 02).
 * The model proposes criteria statuses and an outcome; these rules decide the final outcome so the
 * same facts always produce the same result. Every decision is recorded in rule_trace for audit.
 */

type Outcome = Verdict["outcome"];
const GATING = ["real_project", "service_area", "timeline"] as const; // criteria 1–3: "ask one direct question"
const SOFT = ["budget", "decision_maker"] as const; // criteria 4–5: "do not push, qualify with note"

export function deriveOutcome(v: ModelVerdict): { outcome: Outcome; trace: string[] } {
  const trace: string[] = [];
  const done = (outcome: Outcome, why: string) => {
    trace.push(why);
    return { outcome, trace };
  };

  if (v.intent === "EXISTING_CLIENT") return done("ESCALATED", "intent=EXISTING_CLIENT → escalate, no qualification");
  if (v.intent === "OUT_OF_SCOPE") return done("DECLINED", "intent=OUT_OF_SCOPE → decline (services.md)");
  if (v.intent === "UNKNOWN") return done("NEEDS_REVIEW", "intent=UNKNOWN → human review");

  const c = v.criteria;
  const fails = (Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k].status === "fail");
  if (fails.length >= 2) return done("DECLINED", `two or more criteria fail (${fails.join(", ")})`);
  const gatingFail = GATING.find((k) => c[k].status === "fail");
  if (gatingFail) return done("DECLINED", `criterion ${gatingFail} fails`);
  if (c.budget.status === "fail") return done("DECLINED", "volunteered budget clearly below scope (criterion 4)");
  if (c.decision_maker.status === "fail")
    return done("NEEDS_REVIEW", "decision_maker fails alone; qualified.md doesn't settle a single fail on 5");

  if (v.outcome === "NEEDS_REVIEW") return done("NEEDS_REVIEW", `model flagged for human review: ${v.review_reason ?? "no reason given"}`);
  const gatingUnclear = GATING.filter((k) => c[k].status === "unclear");
  if (gatingUnclear.length) return done("NEEDS_REVIEW", `criteria 1–3 still unclear at end of call (${gatingUnclear.join(", ")})`);

  let outcome: Outcome = "QUALIFIED";
  const softUnclear = SOFT.filter((k) => c[k].status === "unclear");
  if (softUnclear.length) {
    outcome = "QUALIFIED_WITH_NOTE";
    trace.push(`unclear on ${softUnclear.join(", ")} → qualified with note`);
  }
  if (v.frustration_flag) {
    outcome = "QUALIFIED_WITH_NOTE";
    trace.push("caller frustration → qualified with note for designer");
  }

  if (v.outcome === "DECLINED" || v.outcome === "ESCALATED") {
    return done("NEEDS_REVIEW", `model said ${v.outcome} but criteria all pass/unclear → human review`);
  }
  if (outcome === "QUALIFIED") trace.push("all criteria pass");
  return { outcome, trace };
}

const REFERRAL = /refer|friend|family|relative|colleague|neighbou?r|past client|existing client|recommend|word of mouth/i;

/**
 * Score = criteria fit (40) + scope size (25) + timeline readiness (20) + referral boost (15).
 * Budget never contributes: it only matters if volunteered, and a volunteered too-low budget declines outright.
 */
export function computeScore(v: ModelVerdict, minWeeksRunway: number): { score: number; breakdown: Record<string, number> } {
  // Only new enquiries are leads; escalations and out-of-scope calls get no lead score.
  if (v.intent !== "NEW_ENQUIRY") return { score: 0, breakdown: {} };
  const c = v.criteria;
  const pts = (s: string) => (s === "pass" ? 10 : s === "unclear" ? 5 : 0);
  const criteriaFit = pts(c.real_project.status) + pts(c.service_area.status) + pts(c.timeline.status) + pts(c.decision_maker.status);

  const cap = v.captured;
  let scope = 5;
  const area = cap.carpet_area_sqft;
  const bhk = Number(cap.bhk?.match(/\d+/)?.[0] ?? NaN);
  if (area && area > 0) scope = area >= 1500 ? 25 : area >= 1000 ? 20 : area >= 600 ? 15 : 8;
  else if (!Number.isNaN(bhk)) scope = bhk >= 4 ? 22 : bhk === 3 ? 18 : bhk === 2 ? 15 : 10;
  else if (cap.scope_rooms && /full|entire|whole|home|flat|apartment|villa|office|floor|,| and /i.test(cap.scope_rooms)) scope = 12;

  let timeline = 0;
  const w = cap.timeline_weeks;
  if (c.timeline.status === "fail") timeline = 0;
  else if (w == null) timeline = c.timeline.status === "pass" ? 10 : 5;
  else if (w < minWeeksRunway) timeline = 0;
  else if (w <= 26) timeline = 20;
  else if (w <= 52) timeline = 12;
  else timeline = 6;

  const referral = cap.referral_source ? (REFERRAL.test(cap.referral_source) ? 15 : 5) : 0;

  const breakdown = { criteria_fit: criteriaFit, scope_size: scope, timeline_readiness: timeline, referral_boost: referral };
  return { score: Math.min(100, criteriaFit + scope + timeline + referral), breakdown };
}
