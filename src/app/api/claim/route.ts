import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { verifySignedParams } from "@/lib/auth";
import { syncEnquiryToHubspot } from "@/lib/hubspot/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;background:#fdf9f0;color:#111;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:420px;margin:16px;padding:24px;background:#fff;border:2px solid #111;border-radius:18px;box-shadow:6px 6px 0 #111">
<h1 style="margin:0 0 12px;font-size:22px;text-transform:uppercase">${title}</h1>${body}</div></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
const btn = "background:#ff3d81;border:2px solid #111;border-radius:8px;padding:10px 18px;font-weight:700;box-shadow:4px 4px 0 #111;cursor:pointer;font-size:16px";

/** GET only shows a confirm button (email scanners that pre-fetch links must not claim leads). POST claims. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (!verifySignedParams("claim", p)) return page("Invalid link", "<p>This link is not valid.</p>", 400);
  return page("Take this lead?", `<p>Confirm that you will call this enquiry back.</p><form method="post" action="${req.nextUrl.pathname}?${p.toString()}"><button style="${btn}">Yes, I'll take it</button></form>`);
}

export async function POST(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (!verifySignedParams("claim", p)) return page("Invalid link", "<p>This link is not valid.</p>", 400);
  const enquiryId = p.get("e")!;
  const designerId = p.get("d")!;
  const now = new Date();
  const d = db();
  const won = await d
    .update(schema.enquiries)
    .set({ claimedAt: now, status: "CLAIMED", ownerType: "designer", ownerDesignerId: designerId, updatedAt: now })
    .where(and(eq(schema.enquiries.id, enquiryId), isNull(schema.enquiries.claimedAt)))
    .returning({ id: schema.enquiries.id });
  if (!won.length) return page("Already taken", "<p>Someone has already claimed this lead.</p>");
  await d.update(schema.notifications).set({ claimedAt: now, claimedByDesignerId: designerId }).where(and(eq(schema.notifications.enquiryId, enquiryId), eq(schema.notifications.kind, "hot_lead")));
  await syncEnquiryToHubspot(enquiryId, "claimed");
  return page("It's yours", "<p>Claimed. Please call the customer back soon, and use the booking link in the brief.</p>");
}
