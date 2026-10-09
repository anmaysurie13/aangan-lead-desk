/**
 * Score transcript file(s) from the command line.
 *   npm run score -- path/to/call.txt                 one call
 *   npm run score -- part1.txt part2.txt --merge      dropped-call merge (one enquiry)
 *   add --fast to use GEMINI_MODEL_FAST instead of SMART
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import { scoreCall } from "../src/lib/scorer/score";

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) throw new Error("usage: npm run score -- <transcript.txt> [more.txt --merge] [--fast]");
  const tier = args.includes("--fast") ? "fast" : "smart";
  const groups = args.includes("--merge") ? [files] : files.map((f) => [f]);
  for (const group of groups) {
    const t0 = Date.now();
    const r = await scoreCall({ transcripts: group.map((f) => fs.readFileSync(f, "utf8")), tier });
    console.log(`\n=== ${group.join(" + ")}  (${((Date.now() - t0) / 1000).toFixed(1)}s, ${r.model}, attempts ${r.attempts}) ===`);
    console.log(JSON.stringify({ ...r.verdict, pricing_breach: r.pricingBreach, pricing_hits: r.pricingHits, knowledge_version: r.knowledgeVersion, usage: r.usage }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
