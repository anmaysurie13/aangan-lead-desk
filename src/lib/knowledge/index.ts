import generated from "@/generated/knowledge.json";
import type { KnowledgeBase } from "./parse";

// Generated at build time by scripts/build-knowledge.ts. Never edit the JSON by hand; edit /knowledge/*.md.
export const knowledge = generated as KnowledgeBase;
export const KNOWLEDGE_VERSION = knowledge.version;

export * from "./parse";
export * from "./prompts";
