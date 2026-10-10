import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/auth";
import { fetchEnquiries, parseRange } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection from caller-supplied text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV of the filtered enquiries. Replaces Nikhil's manual monthly pull. */
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const range = parseRange({ from: p.get("from") || undefined, to: p.get("to") || undefined, month: p.get("month") || undefined });
  const rows = await fetchEnquiries({ ...range, designerId: p.get("designer") || undefined, outcome: p.get("outcome") || undefined });
  const cols = ["first_call_at", "caller_name", "locality", "outcome", "score", "status", "decline_reason", "designer_name", "owner_type", "claimed_at", "booked_at", "consultation_held_at", "brief_rating"] as const;
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="aangan-enquiries-${range.label.replace(/\W+/g, "_")}.csv"` },
  });
}
