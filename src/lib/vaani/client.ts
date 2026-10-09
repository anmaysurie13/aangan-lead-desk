/**
 * Vaani AI Research API client. Every endpoint, header and field here comes from
 * https://docs.vaanivoice.ai (fetched 2026-10-09). Nothing is guessed:
 *   auth:    X-API-Key header, base https://api.vaanivoice.ai
 *   agents:  GET /api/agents, POST /api/create-agent, PATCH /api/agent/{id}/persona (deep merge)
 *   calls:   GET /api/call-history, GET /api/transcript/{call_id}
 */

const BASE = "https://api.vaanivoice.ai";

function key() {
  const k = process.env.VAANI_API_KEY;
  if (!k) throw new Error("VAANI_API_KEY is not set");
  return k;
}

export class VaaniApiError extends Error {
  constructor(readonly status: number, readonly path: string, readonly body: string) {
    super(`Vaani ${path} → ${status}: ${body.slice(0, 300)}`);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "X-API-Key": key(), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new VaaniApiError(res.status, path, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export type VaaniAgentSummary = { agent_id: string; agent_display_name?: string; [k: string]: unknown };

export async function listAgents(search?: string) {
  const q = new URLSearchParams({ page: "1", page_size: "50", ...(search ? { search } : {}) });
  return call<{ data: VaaniAgentSummary[]; pagination: unknown }>("GET", `/api/agents?${q}`);
}

export async function createAgent(displayName: string, config: Record<string, unknown> = {}) {
  return call<{ success: boolean; agent_id: string; agent_name: string; client_id: string }>("POST", "/api/create-agent", {
    agent_display_name: displayName,
    config,
  });
}

export async function updatePersona(agentId: string, persona: Record<string, unknown>) {
  return call<Record<string, unknown>>("PATCH", `/api/agent/${agentId}/persona`, persona);
}

/** Documented call-history record (subset we use). */
export type VaaniCallRecord = {
  call_id: string;
  call_type?: string;
  direction?: string;
  agent_id?: string;
  from_number?: string;
  to_number?: string;
  Start_time?: string;
  End_time?: string;
  duration_ms?: number;
  call_cost?: number;
  user_picked_up_at?: string;
  call_dialing_at?: string;
  call_ringing_at?: string;
};

/** Finds one call in paginated history (newest first). Returns null if not found or the endpoint errors. */
export async function findCallInHistory(callId: string, maxPages = 3): Promise<VaaniCallRecord | null> {
  for (let page = 1; page <= maxPages; page++) {
    const res = await call<{ data: VaaniCallRecord[]; pagination: { has_next: boolean } }>("GET", `/api/call-history?page=${page}&page_size=50`);
    const hit = res.data.find((c) => c.call_id === callId);
    if (hit) return hit;
    if (!res.pagination?.has_next) break;
  }
  return null;
}
