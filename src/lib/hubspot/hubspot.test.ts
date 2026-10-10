import { describe, expect, it } from "vitest";
import { dealStageFor, leadStatusFor } from "./sync";

describe("HubSpot mapping", () => {
  it.each([
    ["QUALIFIED", "QUALIFIED", "OPEN"],
    ["QUALIFIED_WITH_NOTE", "QUALIFIED_WITH_NOTE", "OPEN"],
    ["CLAIMED", "QUALIFIED", "IN_PROGRESS"],
    ["BOOKED", "QUALIFIED", "OPEN_DEAL"],
    ["CONSULTATION_HELD", "QUALIFIED", "OPEN_DEAL"],
    ["ESCALATED", "ESCALATED", "IN_PROGRESS"],
    ["DECLINED", "DECLINED", "UNQUALIFIED"],
    ["NEEDS_REVIEW", "NEEDS_REVIEW", "NEW"],
  ])("status %s / outcome %s → lead status %s", (status, outcome, want) => expect(leadStatusFor(status, outcome)).toBe(want));

  it("deals exist only for qualified leads, and move to Presentation Scheduled when booked", () => {
    expect(dealStageFor("QUALIFIED")).toBe("qualifiedtobuy");
    expect(dealStageFor("QUALIFIED_WITH_NOTE")).toBe("qualifiedtobuy");
    expect(dealStageFor("CLAIMED")).toBe("qualifiedtobuy");
    expect(dealStageFor("BOOKED")).toBe("presentationscheduled");
    expect(dealStageFor("DECLINED")).toBeNull();
    expect(dealStageFor("ESCALATED")).toBeNull();
    expect(dealStageFor("NEEDS_REVIEW")).toBeNull();
  });
});
