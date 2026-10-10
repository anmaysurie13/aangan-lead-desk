import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { startWebrtcSession } from "@/lib/vaani/client";
import { callerOverride, cleanName, greeting } from "@/lib/talk";
import { buildAgentSystemPrompt, knowledge } from "@/lib/knowledge";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint that spends money per minute, so it is rate-limited and calls are capped at 10 min (vaani-sync).
const PER_IP_10_MIN = 3;
const GLOBAL_PER_HOUR = 40;

/** Starts a browser voice session with the Aangan agent. Returns the LiveKit credentials for the caller's browser. */
export async function POST(req: NextRequest) {
  const agentId = process.env.VAANI_AGENT_ID;
  if (!agentId || !process.env.VAANI_API_KEY) return NextResponse.json({ error: "Voice calls are not available right now." }, { status: 503 });

  let language: "en" | "hi" = "en";
  let name = "";
  try {
    const body = (await req.json()) as { language?: string; name?: string };
    if (body.language === "hi") language = "hi";
    name = cleanName(body.name); // spoken aloud and kept in the transcript
  } catch {
    /* default */
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ipHash = createHash("sha256").update(`${ip}:${process.env.AUTH_SECRET ?? ""}`).digest("hex").slice(0, 32);
  const d = db();
  const tenMin = new Date(Date.now() - 10 * 60_000);
  const hour = new Date(Date.now() - 60 * 60_000);
  const [mine] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.webSessions).where(and(eq(schema.webSessions.ipHash, ipHash), gte(schema.webSessions.createdAt, tenMin)));
  if (mine.n >= PER_IP_10_MIN) return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
  const [all] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.webSessions).where(gte(schema.webSessions.createdAt, hour));
  if (all.n >= GLOBAL_PER_HOUR) return NextResponse.json({ error: "We are very busy right now. Please try again shortly." }, { status: 429 });

  try {
    const minWeeksRunway = await getConfig("min_weeks_runway", 8);
    const base = buildAgentSystemPrompt(knowledge, { minWeeksRunway, languages: ["English", "Hindi"] });
    const s = await startWebrtcSession({ agentId, language, welcomeMessage: greeting(name, language), modifyAgent: callerOverride(base, name, language) });
    await d.insert(schema.webSessions).values({ roomName: s.room_name, ipHash, language });
    return NextResponse.json({ token: s.token, connectionUrl: s.connection_url, roomName: s.room_name });
  } catch (e) {
    await d.insert(schema.deadLetters).values({ source: "web_call_start", error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) });
    return NextResponse.json({ error: "Could not start the call. Please try again." }, { status: 502 });
  }
}
