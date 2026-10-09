/**
 * Build step: /knowledge/*.md → src/generated/knowledge.json (+ a readable agent prompt preview).
 * Runs before dev/build/test, so editing a markdown file updates the agent on the next deploy.
 * Fails the build if a knowledge file no longer contains a required policy element.
 */
import fs from "node:fs";
import path from "node:path";
import { parseKnowledge } from "../src/lib/knowledge/parse";
import { buildAgentSystemPrompt, DEFAULT_PROMPT_CONFIG } from "../src/lib/knowledge/prompts";

const root = path.resolve(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(root, "knowledge", f), "utf8");

const kb = parseKnowledge({ services: read("services.md"), qualified: read("qualified.md"), pricing: read("pricing.md") });
const outDir = path.join(root, "src", "generated");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "knowledge.json"), JSON.stringify(kb, null, 2));
fs.writeFileSync(path.join(outDir, "agent-system-prompt.md"), buildAgentSystemPrompt(kb, DEFAULT_PROMPT_CONFIG));

console.log(
  `knowledge ${kb.version}: ${kb.parsed.criteria.length} criteria, ${kb.parsed.inAreaLocalities.length} in-area localities, ` +
    `${kb.parsed.outOfAreaPlaces.length} out-of-area, ${kb.parsed.outOfScope.length} out-of-scope rules`,
);
