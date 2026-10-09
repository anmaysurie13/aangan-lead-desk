import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt, knowledgeVersion, parseKnowledge } from ".";

const dir = path.resolve(__dirname, "../../../knowledge");
const files = {
  services: fs.readFileSync(path.join(dir, "services.md"), "utf8"),
  qualified: fs.readFileSync(path.join(dir, "qualified.md"), "utf8"),
  pricing: fs.readFileSync(path.join(dir, "pricing.md"), "utf8"),
};

describe("knowledge loader", () => {
  const kb = parseKnowledge(files);

  it("extracts the five criteria in order", () => {
    expect(kb.parsed.criteria.map((c) => c.key)).toEqual(["real_project", "service_area", "timeline", "budget", "decision_maker"]);
  });

  it("finds the service area lists", () => {
    expect(kb.parsed.inAreaLocalities).toContain("Baner");
    expect(kb.parsed.inAreaLocalities).toContain("Hinjewadi");
    expect(kb.parsed.outOfAreaPlaces).toEqual(["Talegaon", "Lonavala", "Nashik", "Mumbai"]);
  });

  it("surfaces the 6-week vs 8–10-week conflict as data", () => {
    expect(kb.parsed.servicesMinLeadWeeks).toBe(6);
    expect(kb.parsed.qualifiedTimelineWeeks).toEqual({ min: 8, max: 10 });
  });

  it("hash ignores line endings but changes when content changes", () => {
    const crlf = { ...files, services: files.services.replace(/\n/g, "\r\n") };
    expect(knowledgeVersion(crlf)).toBe(knowledgeVersion(files));
    expect(knowledgeVersion({ ...files, pricing: files.pricing + "\nedit" })).not.toBe(knowledgeVersion(files));
  });

  it("editing a file changes the agent prompt", () => {
    const edited = parseKnowledge({ ...files, services: files.services.replace("Hinjewadi", "Hinjewadi, Wagholi") });
    expect(buildAgentSystemPrompt(edited)).toContain("Wagholi");
    expect(edited.version).not.toBe(kb.version);
  });

  it("agent prompt never contains a price figure from pricing.md", () => {
    const prompt = buildAgentSystemPrompt(kb);
    expect(prompt).not.toMatch(/₹|\blakhs?\b|per sq ft|\/sqft/i);
    expect(prompt).toContain(kb.parsed.pricingApprovedLine);
  });

  it("fails loudly if a required policy element is removed", () => {
    expect(() => parseKnowledge({ ...files, pricing: "# empty" })).toThrow(/Knowledge parse/);
  });
});
