import { describe, expect, it } from "vitest";
import { computeScore, deriveOutcome } from "./rubric";
import type { ModelVerdict } from "./schema";

type S = "pass" | "fail" | "unclear";
function verdict(over: Partial<Record<"real_project" | "service_area" | "timeline" | "budget" | "decision_maker", S>> = {}, extra: Partial<ModelVerdict> = {}): ModelVerdict {
  const c = (s: S = "pass") => ({ status: s, evidence_quote: "" });
  return {
    intent: "NEW_ENQUIRY",
    criteria: {
      real_project: c(over.real_project),
      service_area: c(over.service_area),
      timeline: c(over.timeline),
      budget: c(over.budget),
      decision_maker: c(over.decision_maker),
    },
    outcome: "QUALIFIED",
    review_reason: null,
    captured: {
      caller_name: null, caller_email: null, locality: null, property_type: null, bhk: "3BHK", carpet_area_sqft: null, scope_rooms: null,
      current_state: null, timeline_text: null, timeline_weeks: 12, ownership: null, decision_maker_status: null,
      referral_source: "a friend referred us", language: "English", site_visit_requested: null, volunteered_budget: null,
      existing_designer_name: null, project_location: null, issue: null, decline_reason: null,
    },
    summary_3_lines: "a\nb\nc",
    brief_for_designer: "",
    open_questions: [],
    caller_sentiment: "neutral",
    frustration_flag: false,
    agent_pricing_violation: false,
    ...extra,
  };
}

describe("deriveOutcome (qualified.md boundary rules)", () => {
  it("all pass → QUALIFIED", () => expect(deriveOutcome(verdict()).outcome).toBe("QUALIFIED"));
  it("existing client → ESCALATED", () => expect(deriveOutcome(verdict({}, { intent: "EXISTING_CLIENT" })).outcome).toBe("ESCALATED"));
  it("out of scope → DECLINED", () => expect(deriveOutcome(verdict({}, { intent: "OUT_OF_SCOPE" })).outcome).toBe("DECLINED"));
  it("service area fail → DECLINED", () => expect(deriveOutcome(verdict({ service_area: "fail" })).outcome).toBe("DECLINED"));
  it("timeline fail → DECLINED", () => expect(deriveOutcome(verdict({ timeline: "fail" })).outcome).toBe("DECLINED"));
  it("volunteered low budget → DECLINED", () => expect(deriveOutcome(verdict({ budget: "fail" })).outcome).toBe("DECLINED"));
  it("two fails → DECLINED", () => expect(deriveOutcome(verdict({ budget: "fail", decision_maker: "fail" })).outcome).toBe("DECLINED"));
  it("unclear decision maker → QUALIFIED_WITH_NOTE", () =>
    expect(deriveOutcome(verdict({ decision_maker: "unclear" })).outcome).toBe("QUALIFIED_WITH_NOTE"));
  it("frustrated caller → QUALIFIED_WITH_NOTE", () =>
    expect(deriveOutcome(verdict({}, { frustration_flag: true })).outcome).toBe("QUALIFIED_WITH_NOTE"));
  it("criteria 1–3 unclear at end → NEEDS_REVIEW", () => expect(deriveOutcome(verdict({ timeline: "unclear" })).outcome).toBe("NEEDS_REVIEW"));
  it("model edge-case flag is respected → NEEDS_REVIEW", () =>
    expect(deriveOutcome(verdict({}, { outcome: "NEEDS_REVIEW", review_reason: "no minimum size defined" })).outcome).toBe("NEEDS_REVIEW"));
  it("model says DECLINED but rules say qualified → NEEDS_REVIEW", () =>
    expect(deriveOutcome(verdict({}, { outcome: "DECLINED" })).outcome).toBe("NEEDS_REVIEW"));
});

describe("computeScore", () => {
  it("never uses budget", () => {
    const a = computeScore(verdict(), 8).score;
    const b = computeScore(verdict({}, { captured: { ...verdict().captured, volunteered_budget: "50 lakh" } }), 8).score;
    expect(a).toBe(b);
  });
  it("referral boosts the score", () => {
    const withRef = computeScore(verdict(), 8).score;
    const without = computeScore(verdict({}, { captured: { ...verdict().captured, referral_source: null } }), 8).score;
    expect(withRef - without).toBe(15);
  });
  it("escalations get no lead score", () => {
    expect(computeScore(verdict({}, { intent: "EXISTING_CLIENT" }), 8).score).toBe(0);
  });
  it("stays within 0–100", () => {
    const s = computeScore(verdict({}, { captured: { ...verdict().captured, carpet_area_sqft: 5000 } }), 8).score;
    expect(s).toBeLessThanOrEqual(100);
  });
});
