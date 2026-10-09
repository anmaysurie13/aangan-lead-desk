/**
 * Phase 2 eval runner.
 *   npm run evals                      scorer cases + red-team, smart model
 *   npm run evals -- --tier fast       use GEMINI_MODEL_FAST
 *   npm run evals -- --repeat 3        run each scorer case N times (stability)
 *   npm run evals -- --only T07,T16    subset
 *   npm run evals -- --no-redteam
 * Writes evals/results/<stamp>-<tier>.json and evals/results/LATEST-<tier>.md. Exit code 1 if anything fails.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { CASES, SKIPPED, type EvalCase } from "./cases";
import { SCENARIOS, runScenario, type RedTeamResult } from "./redteam";
import { scoreCall, type ScoreResult } from "../src/lib/scorer/score";
import type { ModelTier } from "../src/lib/llm/gemini";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const tier = (flag("tier") ?? "smart") as ModelTier;
const repeat = Number(flag("repeat") ?? 1);
const only = flag("only")?.split(",");
const withRedteam = !args.includes("--no-redteam");
const root = path.resolve(__dirname);

type CaseRun = { run: number; ok: boolean; got?: string; detail: string; seconds: number; result?: ScoreResult; error?: string };

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function runCase(c: EvalCase, run: number): Promise<CaseRun> {
  const t0 = Date.now();
  try {
    const result = await scoreCall({
      transcripts: c.files.map((f) => fs.readFileSync(path.join(root, "fixtures", f), "utf8")),
      tier,
      nowIso: c.callDate,
    });
    const v = result.verdict;
    const problems: string[] = [];
    if (v.outcome !== c.expected) problems.push(`outcome ${v.outcome} ≠ ${c.expected}`);
    if (c.extra?.frustration_flag !== undefined && v.frustration_flag !== c.extra.frustration_flag) problems.push(`frustration_flag=${v.frustration_flag}`);
    if (c.extra?.intent && v.intent !== c.extra.intent) problems.push(`intent ${v.intent} ≠ ${c.extra.intent}`);
    return { run, ok: problems.length === 0, got: v.outcome, detail: problems.join("; ") || v.rule_trace.join("; "), seconds: (Date.now() - t0) / 1000, result };
  } catch (e) {
    return { run, ok: false, detail: "ERROR", error: e instanceof Error ? e.message : String(e), seconds: (Date.now() - t0) / 1000 };
  }
}

async function main() {
  const cases = CASES.filter((c) => !only || only.includes(c.id));
  const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, r) => ({ c, r: r + 1 })));
  console.log(`Scoring ${cases.length} cases × ${repeat} with tier=${tier}…`);
  const runs = await pool(jobs, 4, ({ c, r }) => runCase(c, r));

  const byCase = cases.map((c) => {
    const rs = runs.filter((_, i) => jobs[i].c.id === c.id);
    return { c, rs, pass: rs.every((r) => r.ok) };
  });

  const rt: RedTeamResult[] = withRedteam && !only ? await pool(SCENARIOS, 4, (s) => runScenario(s, "fast")) : [];

  // ---------- table ----------
  const lines: string[] = [];
  const model = runs.find((r) => r.result)?.result?.model ?? tier;
  lines.push(`# Phase 2 eval results`, ``, `Scorer model: \`${model}\` · knowledge \`${runs.find((r) => r.result)?.result?.knowledgeVersion}\` · ${new Date().toISOString()}`, ``);
  lines.push(`| Case | Expected | Got | Pass | Score | Breach | Secs | Notes |`, `|---|---|---|---|---|---|---|---|`);
  for (const { c, rs, pass } of byCase) {
    const got = [...new Set(rs.map((r) => r.got ?? "ERROR"))].join(" / ");
    const r0 = rs[0].result;
    const secs = (rs.reduce((a, r) => a + r.seconds, 0) / rs.length).toFixed(1);
    const note = rs.find((r) => !r.ok)?.detail ?? c.why;
    lines.push(`| ${c.id} | ${c.expected} | ${got} | ${pass ? "✅" : "❌"}${repeat > 1 ? ` ${rs.filter((r) => r.ok).length}/${rs.length}` : ""} | ${r0?.verdict.score_0_100 ?? "-"} | ${r0?.pricingBreach ? "⚠️ " + (r0.pricingHits[0]?.match ?? "model") : ""} | ${secs} | ${note.replace(/\|/g, "/")} |`);
  }
  for (const s of SKIPPED) lines.push(`| ${s.id} | (no fixture) | – | – | – | – | – | ${s.why} |`);

  if (rt.length) {
    lines.push(``, `## Red-team: caller pushes for a number (agent prompt, model \`${rt[0].model}\`)`, ``);
    lines.push(`| Scenario | Pass | Money numbers said | Guardrail hits | Approved line used |`, `|---|---|---|---|---|`);
    for (const r of rt) lines.push(`| ${r.id} ${r.title} | ${r.pass ? "✅" : "❌"} | ${r.numberLeaks.map((l) => l.found.join(",")).join("; ") || "0"} | ${r.guardrailHits.length} | ${r.approvedLineUses}× |`);
  }

  const casePass = byCase.filter((b) => b.pass).length;
  const rtPass = rt.filter((r) => r.pass).length;
  const allPass = casePass === byCase.length && rtPass === rt.length;
  lines.push(``, `**Scorer: ${casePass}/${byCase.length} · Red-team: ${rtPass}/${rt.length} · ${allPass ? "ALL PASS ✅" : "FAILURES ❌"}**`);

  const md = lines.join("\n");
  console.log("\n" + md);
  for (const r of runs.filter((r) => r.error)) console.log(`\nERROR ${r.error}`);

  const outDir = path.join(root, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(outDir, `${stamp}-${tier}.json`), JSON.stringify({ tier, repeat, runs: byCase, redteam: rt }, null, 2));
  if (!only) fs.writeFileSync(path.join(outDir, `LATEST-${tier}.md`), md + "\n");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
