import { createHash } from "node:crypto";

/**
 * Parses the three knowledge files into structured policy. The markdown files are the single
 * source of truth (Check 02): nothing here hardcodes policy, it only extracts it. If a file is
 * edited so that a required piece can't be found, parsing throws and the build fails loudly.
 */

export type KnowledgeFiles = { services: string; qualified: string; pricing: string };

export const CRITERIA_KEYS = ["real_project", "service_area", "timeline", "budget", "decision_maker"] as const;
export type CriterionKey = (typeof CRITERIA_KEYS)[number];

export type Criterion = { key: CriterionKey; number: number; title: string; body: string };

export type ParsedKnowledge = {
  criteria: Criterion[];
  boundaryRules: string[];
  notDisqualifying: string[];
  declineLine: string;
  qualifiedTimelineWeeks: { min: number; max: number };
  servicesMinLeadWeeks: number;
  inAreaLocalities: string[];
  outOfAreaPlaces: string[];
  outOfScope: { title: string; detail: string }[];
  pricingApprovedLine: string;
  pricingNeverSay: string[];
};

export type KnowledgeBase = {
  version: string;
  files: KnowledgeFiles;
  parsed: ParsedKnowledge;
};

const lf = (s: string) => s.replace(/\r\n/g, "\n").replace(/^﻿/, "");

/** Hash is stable across OSes (CRLF→LF) so Windows dev and Vercel builds agree. */
export function knowledgeVersion(files: KnowledgeFiles): string {
  const h = createHash("sha256");
  for (const name of ["services", "qualified", "pricing"] as const) {
    h.update(`--- ${name}.md ---\n`);
    h.update(lf(files[name]));
  }
  return h.digest("hex").slice(0, 12);
}

function section(md: string, heading: RegExp): string {
  const lines = lf(md).split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) throw new Error(`Knowledge parse: heading ${heading} not found`);
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l) && l.match(/^#+/)![0].length <= level);
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

function bullets(md: string): string[] {
  return md
    .split("\n")
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, "").trim());
}

function required<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === "") {
    throw new Error(`Knowledge parse: could not find ${what}`);
  }
  return v;
}

const stripMd = (s: string) => s.replace(/\*\*/g, "").replace(/\*/g, "").trim();

function splitList(s: string): string[] {
  return s
    .split(/,|\band\b|\bor\b/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(adjoining areas|other cities.*|outside this area)$/i.test(x));
}

export function parseKnowledge(raw: KnowledgeFiles): KnowledgeBase {
  const files = { services: lf(raw.services), qualified: lf(raw.qualified), pricing: lf(raw.pricing) };

  // ---- qualified.md ----
  const critSection = section(files.qualified, /^##\s+The five criteria/i);
  const critMatches = [...critSection.matchAll(/^###\s+(\d+)\.\s+(.+)\n([\s\S]*?)(?=^###\s|\s*$(?![\s\S]))/gm)];
  const criteria = critMatches.map((m, i) => ({
    key: CRITERIA_KEYS[i],
    number: Number(m[1]),
    title: m[2].trim(),
    body: m[3].trim(),
  }));
  if (criteria.length !== CRITERIA_KEYS.length) {
    throw new Error(`Knowledge parse: expected ${CRITERIA_KEYS.length} criteria in qualified.md, found ${criteria.length}`);
  }

  const boundary = section(files.qualified, /^##\s+At the boundary/i);
  const boundaryRules = required(bullets(boundary).map(stripMd), "boundary rules in qualified.md");
  const declineLine = required(boundary.match(/decline gracefully\.\s*["“]([^"”]+)["”]/i)?.[1], "decline line in qualified.md");
  const notDisqualifying = required(bullets(section(files.qualified, /^##\s+What does NOT disqualify/i)), "'What does NOT disqualify' list");

  const tl = criteria[2].body.match(/within\s+(\d+)\s*[–-]\s*(\d+)\s+weeks/i);
  const qualifiedTimelineWeeks = { min: Number(required(tl?.[1], "timeline weeks in criterion 3")), max: Number(tl![2]) };

  // ---- services.md ----
  const area = section(files.services, /^##\s+Service area/i);
  const puneList = area.match(/Pune city\s*\(including\s+([^)]+)\)/i)?.[1];
  const pcmcList = area.match(/PCMC\s*\(([^)]+)\)/i)?.[1];
  const inAreaLocalities = required([...splitList(puneList ?? ""), ...splitList(pcmcList ?? "")], "service-area localities");
  const outOfAreaPlaces = required(splitList(area.match(/do not currently serve\s+([^.]+)\./i)?.[1] ?? ""), "out-of-area places");

  const dont = section(files.services, /^##\s+What we don't do/i);
  const outOfScope = required(
    bullets(dont).map((b) => {
      const m = b.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
      return { title: stripMd(m?.[1] ?? b).replace(/:$/, ""), detail: (m?.[2] ?? "").trim() };
    }),
    "'What we don't do' list",
  );

  const lead = files.services.match(/under\s+(\d+)\s+weeks/i);
  const servicesMinLeadWeeks = Number(required(lead?.[1], "minimum lead time in services.md"));

  // ---- pricing.md ----
  const approved = files.pricing.match(/only acceptable response to a pricing question\*?\*?:?\s*["“]([^"”]+)["”]/i)?.[1];
  const pricingApprovedLine = required(approved, "approved pricing line in pricing.md");
  const pricingNeverSay = required(bullets(section(files.pricing, /^##\s+What the agent must never say/i)), "never-say list in pricing.md");

  const parsed: ParsedKnowledge = {
    criteria,
    boundaryRules,
    notDisqualifying,
    declineLine,
    qualifiedTimelineWeeks,
    servicesMinLeadWeeks,
    inAreaLocalities,
    outOfAreaPlaces,
    outOfScope,
    pricingApprovedLine,
    pricingNeverSay,
  };

  return { version: knowledgeVersion(files), files, parsed };
}
