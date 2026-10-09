import type { Verdict } from "../src/lib/scorer/schema";

export type EvalCase = {
  id: string;
  files: string[]; // in evals/fixtures; several = same caller within minutes → merged
  callDate: string; // "today" for the scorer, so timelines are judged as of the call
  expected: Verdict["outcome"];
  extra?: { frustration_flag?: boolean; intent?: Verdict["intent"] };
  why: string;
};

/** Expected outcomes are Nikhil's, from the Phase 2 brief. Do not edit to make a run pass. */
export const CASES: EvalCase[] = [
  { id: "T01", files: ["T01.txt"], callDate: "2026-09-02", expected: "QUALIFIED", why: "3BHK Kothrud, referral, March, owner+spouse" },
  { id: "T02", files: ["T02.txt"], callDate: "2026-09-03", expected: "QUALIFIED", why: "2BHK Wakad, pricing asked twice (not a disqualifier)" },
  { id: "T03", files: ["T03.txt"], callDate: "2026-09-03", expected: "DECLINED", why: "Nashik: outside service area" },
  { id: "T04", files: ["T04.txt"], callDate: "2026-09-04", expected: "DECLINED", why: "advice only, no execution" },
  { id: "T05", files: ["T05.txt"], callDate: "2026-09-05", expected: "QUALIFIED", why: "4BHK KP, 2,400 sq ft, referral" },
  { id: "T06", files: ["T06.txt"], callDate: "2026-09-05", expected: "QUALIFIED", why: "800 sq ft office Baner, founder" },
  { id: "T07", files: ["T07.txt"], callDate: "2026-09-08", expected: "DECLINED", why: "needs it before Diwali, 3 weeks" },
  { id: "T09", files: ["T09.txt"], callDate: "2026-09-10", expected: "ESCALATED", extra: { intent: "EXISTING_CLIENT" }, why: "existing client complaint" },
  { id: "T10", files: ["T10.txt"], callDate: "2026-09-11", expected: "DECLINED", why: "volunteered ₹1–1.5L for kitchen + bedroom" },
  { id: "T11", files: ["T11.txt"], callDate: "2026-09-12", expected: "QUALIFIED", why: "rented, landlord OK, no structural" },
  { id: "T12", files: ["T12.txt"], callDate: "2026-09-15", expected: "QUALIFIED", why: "5,500 sq ft villa Kalyani Nagar" },
  { id: "T13", files: ["T13.txt"], callDate: "2026-09-16", expected: "QUALIFIED", why: "3BHK Aundh, pushes for range" },
  { id: "T14", files: ["T14.txt"], callDate: "2026-09-17", expected: "QUALIFIED_WITH_NOTE", why: "caller is son; parents decide and attend" },
  { id: "T15", files: ["T15.txt"], callDate: "2026-09-18", expected: "QUALIFIED", why: "2BHK Undri, possession in 6 weeks" },
  { id: "T16", files: ["T16.txt"], callDate: "2026-09-19", expected: "QUALIFIED_WITH_NOTE", extra: { frustration_flag: true }, why: "repeat caller, no follow-up, frustrated" },
  { id: "T17", files: ["T17a.txt", "T17b.txt"], callDate: "2026-09-22", expected: "QUALIFIED", why: "dropped call + call-back merged" },
  { id: "T18", files: ["T18.txt"], callDate: "2026-09-23", expected: "NEEDS_REVIEW", why: "180 sq ft pod; no minimum size in docs" },
  { id: "T19", files: ["T19.txt"], callDate: "2026-09-24", expected: "DECLINED", extra: { intent: "OUT_OF_SCOPE" }, why: "restaurant" },
  { id: "T20", files: ["T20.txt"], callDate: "2026-09-25", expected: "QUALIFIED", why: "2BHK Magarpatta, January start" },
];

/** T08 has no fixture: a missed call with no content. 24/7 answering removes this case entirely. */
export const SKIPPED = [{ id: "T08", why: "Missed call at 10:47pm, no voicemail. With Vaani answering 24/7 in <5s, this case no longer exists." }];
