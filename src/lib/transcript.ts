export type Speaker = "agent" | "caller";
export type Turn = { speaker: Speaker; text: string };

const AGENT = /^(agent|aangan|assistant|receptionist|ai|bot|front ?desk|studio)\b/i;
const CALLER = /^(caller|customer|user|client|human)\b/i;

/**
 * Parses "SPEAKER: text" transcripts into turns. Lines without a speaker prefix continue the previous turn.
 * Speaker labels other than agent-like ones are treated as the caller (e.g. a caller's name).
 * The Vaani payload adapter (Phase 3) will map its own format into Turn[] directly.
 */
export function parseTranscript(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[?[\d:.\s]*\]?\s*([A-Za-z][\w .'-]{0,30}?)\s*:\s*(.*)$/);
    if (m) {
      const label = m[1].trim();
      const speaker: Speaker = AGENT.test(label) ? "agent" : CALLER.test(label) ? "caller" : "caller";
      turns.push({ speaker, text: m[2].trim() });
    } else if (turns.length) {
      turns[turns.length - 1].text += " " + line;
    }
  }
  return turns;
}

export function renderTranscript(turns: Turn[]): string {
  return turns.map((t) => `${t.speaker === "agent" ? "AGENT" : "CALLER"}: ${t.text}`).join("\n");
}
