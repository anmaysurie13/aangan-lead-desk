/** Helpers for the browser voice call page. */

/** Letters (any script), spaces, dots, apostrophes, hyphens; max 40 chars. The name is spoken aloud and kept in the transcript. */
export function cleanName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[^\p{L}\p{M} .'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Greeting spoken first. Includes the recording disclosure, and the caller's name when they gave one. */
export function greeting(name: string, language: "en" | "hi"): string {
  const who = name ? ` ${name}` : "";
  if (language === "hi") {
    return `नमस्ते${who}, आंगन स्टूडियो में आपका स्वागत है। यह कॉल रिकॉर्ड की जा रही है ताकि हमारे डिज़ाइनर आपसे संपर्क कर सकें। मैं आपकी कैसे मदद कर सकती हूँ?`;
  }
  return `Namaste${who}, thank you for calling Aangan Studio. This call is recorded so our designers can follow up. How can I help you today?`;
}

/**
 * Per-call override for Vaani's modify_agent: the personalised greeting, plus the base prompt with the caller's name appended
 * so the agent already knows it and never asks again. The language note reinforces the page's English/Hindi choice.
 */
export function callerOverride(basePrompt: string, name: string, language: "en" | "hi") {
  const context = [
    "",
    "# This caller",
    name
      ? `The caller's name is ${name}. You have already greeted them by name: use it naturally and do NOT ask for their name again.`
      : "The caller did not give a name; ask for it politely.",
    language === "hi"
      ? "The caller chose Hindi on the website: speak Hindi (simple, spoken), switching to English only if they do."
      : "The caller chose English on the website: speak English, switching to Hindi only if they do.",
  ].join("\n");
  return {
    persona: {
      identity: {
        system_prompt: basePrompt + context,
        greeting_message: { agent_message: greeting(name, language), interruptible: true, let_user_speak_first: false },
      },
    },
  };
}
