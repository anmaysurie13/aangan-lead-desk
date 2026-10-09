import { z } from "zod";

export const CriterionStatus = z.enum(["pass", "fail", "unclear"]);
export const Intent = z.enum(["NEW_ENQUIRY", "EXISTING_CLIENT", "OUT_OF_SCOPE", "UNKNOWN"]);
export const Outcome = z.enum(["QUALIFIED", "QUALIFIED_WITH_NOTE", "DECLINED", "ESCALATED", "NEEDS_REVIEW"]);

const criterion = z.object({ status: CriterionStatus, evidence_quote: z.string() });

const nullableStr = z.string().nullable();

export const Captured = z.object({
  caller_name: nullableStr,
  locality: nullableStr,
  property_type: nullableStr,
  bhk: nullableStr,
  carpet_area_sqft: z.number().int().nullable(),
  scope_rooms: nullableStr,
  current_state: nullableStr,
  timeline_text: nullableStr,
  timeline_weeks: z.number().int().nullable(),
  ownership: z.enum(["owned", "rented"]).nullable(),
  decision_maker_status: nullableStr,
  referral_source: nullableStr,
  language: nullableStr,
  site_visit_requested: z.boolean().nullable(),
  volunteered_budget: nullableStr,
  // existing-client escalation
  existing_designer_name: nullableStr,
  project_location: nullableStr,
  issue: nullableStr,
  decline_reason: nullableStr,
});

/** What the model must return. score_0_100 is NOT asked of the model: it is computed deterministically in rubric.ts. */
export const ModelVerdict = z.object({
  intent: Intent,
  criteria: z.object({
    real_project: criterion,
    service_area: criterion,
    timeline: criterion,
    budget: criterion,
    decision_maker: criterion,
  }),
  outcome: Outcome,
  review_reason: nullableStr,
  captured: Captured,
  summary_3_lines: z.string(),
  brief_for_designer: z.string(),
  open_questions: z.array(z.string()),
  caller_sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  frustration_flag: z.boolean(),
  agent_pricing_violation: z.boolean(),
});
export type ModelVerdict = z.infer<typeof ModelVerdict>;

/** Final record stored in qualification_results: the brief's contract plus audit fields. */
export type Verdict = Omit<ModelVerdict, "outcome"> & {
  outcome: z.infer<typeof Outcome>;
  model_outcome: z.infer<typeof Outcome>;
  rule_trace: string[];
  score_0_100: number;
  score_breakdown: Record<string, number>;
};

/** JSON Schema handed to Gemini's structured-output mode (responseJsonSchema). */
export const modelVerdictJsonSchema = z.toJSONSchema(ModelVerdict, { target: "draft-7" });
