/**
 * Pushes the knowledge-generated agent config to Vaani (docs: create-agent, update-persona).
 *   npm run vaani:sync                    create the agent if VAANI_AGENT_ID is unset, else update it
 *   npm run vaani:sync -- --dry-run       print what would be sent
 *   npm run vaani:sync -- --if-production run only when VERCEL_ENV=production (used by the build); never fails the build
 * Records the pushed knowledge_version in config.vaani_agent_knowledge_version so /health can flag drift.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { parseKnowledge } from "../src/lib/knowledge/parse";
import { AGENT_GREETING, buildAgentSystemPrompt } from "../src/lib/knowledge/prompts";
import { createAgent, listAgents, updatePersona } from "../src/lib/vaani/client";

const AGENT_NAME = "aangan-front-desk";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ifProd = args.includes("--if-production");

async function main() {
  if (ifProd && process.env.VERCEL_ENV !== "production") return console.log("vaani:sync skipped (not a production build)");
  if (!process.env.VAANI_API_KEY) return console.log("vaani:sync skipped (VAANI_API_KEY not set)");

  const root = path.resolve(__dirname, "..");
  const read = (f: string) => fs.readFileSync(path.join(root, "knowledge", f), "utf8");
  const kb = parseKnowledge({ services: read("services.md"), qualified: read("qualified.md"), pricing: read("pricing.md") });

  let minWeeksRunway = 8;
  if (process.env.DATABASE_URL) {
    const { getConfig } = await import("../src/lib/config");
    minWeeksRunway = await getConfig("min_weeks_runway", 8);
  }

  const persona = {
    identity: {
      system_prompt: buildAgentSystemPrompt(kb, { minWeeksRunway, languages: ["English", "Hindi"] }),
      greeting_message: { agent_message: AGENT_GREETING, interruptible: true, let_user_speak_first: false },
    },
    senses_capabilities: {
      language: "en",
      auto_detect: true, // English + Hindi callers; documented flag "Enable automatic language detection"
      ears: { stt: { primary: { keywords: ["Aangan", ...kb.parsed.inAreaLocalities, ...kb.parsed.outOfAreaPlaces] } } },
    },
    metadata: { knowledge_version: kb.version, managed_by: "aangan-lead-desk" },
  };

  if (dryRun) {
    console.log(JSON.stringify({ ...persona, identity: { ...persona.identity, system_prompt: `<${persona.identity.system_prompt.length} chars>` } }, null, 2));
    return;
  }

  let agentId = process.env.VAANI_AGENT_ID;
  if (!agentId) {
    const existing = (await listAgents(AGENT_NAME)).data.find((a) => a.agent_display_name === AGENT_NAME);
    agentId = existing?.agent_id ?? (await createAgent(AGENT_NAME)).agent_id;
    console.log(`Agent ${existing ? "found" : "created"}: ${agentId}  → set VAANI_AGENT_ID=${agentId}`);
  }

  await updatePersona(agentId, persona);
  console.log(`Pushed knowledge ${kb.version} to Vaani agent ${agentId} (runway ${minWeeksRunway} wk, languages en+hi)`);

  if (process.env.DATABASE_URL) {
    const { db, schema } = await import("../src/db/client");
    const value = { version: kb.version, agent_id: agentId, pushed_at: new Date().toISOString() };
    await db()
      .insert(schema.config)
      .values({ key: "vaani_agent_knowledge_version", value, description: "Last knowledge version pushed to the Vaani agent" })
      .onConflictDoUpdate({ target: schema.config.key, set: { value, updatedAt: new Date() } });
  }
}

main().catch((e) => {
  console.error("vaani:sync failed:", e instanceof Error ? e.message : e);
  process.exit(ifProd ? 0 : 1); // a failed push must not block a deploy; /health shows the drift
});
