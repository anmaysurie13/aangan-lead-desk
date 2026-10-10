/**
 * HubSpot CRM v3 client (developers.hubspot.com). Auth: a service key (pat-na2-…) as a Bearer token with scopes
 * crm.objects.contacts.read/write and crm.objects.deals.read/write.
 *   POST /crm/v3/objects/contacts/search | POST/PATCH /crm/v3/objects/contacts
 *   POST/PATCH /crm/v3/objects/deals     (associations inline)
 *   POST /crm/v3/objects/notes           (HubSpot-defined associations: note→contact 202, note→deal 214; deal→contact 3)
 * The founder reads HubSpot; designers use the dashboard.
 */
const BASE = "https://api.hubapi.com";

export class HubspotError extends Error {
  constructor(readonly status: number, readonly path: string, readonly body: string) {
    super(`HubSpot ${path} → ${status}: ${body.slice(0, 300)}`);
  }
}

export const hubspotConfigured = () => Boolean(process.env.HUBSPOT_TOKEN);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new HubspotError(res.status, path, text);
  return (text ? JSON.parse(text) : {}) as T;
}

type Obj = { id: string; properties: Record<string, string | null> };

export async function findContact(opts: { email?: string | null; phone?: string | null }): Promise<Obj | null> {
  const filters = opts.email
    ? [{ propertyName: "email", operator: "EQ", value: opts.email.toLowerCase() }]
    : opts.phone
      ? [{ propertyName: "phone", operator: "EQ", value: opts.phone }]
      : null;
  if (!filters) return null;
  const r = await call<{ results: Obj[] }>("POST", "/crm/v3/objects/contacts/search", { filterGroups: [{ filters }], properties: ["email", "phone", "firstname", "lastname"], limit: 1 });
  return r.results[0] ?? null;
}

export const createContact = (properties: Record<string, string>) => call<Obj>("POST", "/crm/v3/objects/contacts", { properties });
export const updateContact = (id: string, properties: Record<string, string>) => call<Obj>("PATCH", `/crm/v3/objects/contacts/${id}`, { properties });

export const createDeal = (properties: Record<string, string>, contactId: string | null) =>
  call<Obj>("POST", "/crm/v3/objects/deals", {
    properties,
    ...(contactId ? { associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }] } : {}),
  });
export const updateDeal = (id: string, properties: Record<string, string>) => call<Obj>("PATCH", `/crm/v3/objects/deals/${id}`, { properties });

/** A note on the contact (and the deal, if any). Body is plain text with line breaks. */
export function createNote(body: string, contactId: string | null, dealId: string | null) {
  const associations = [
    ...(contactId ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }] : []),
    ...(dealId ? [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }] : []),
  ];
  const html = body.split("\n").map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("<br>");
  return call<Obj>("POST", "/crm/v3/objects/notes", { properties: { hs_timestamp: new Date().toISOString(), hs_note_body: html }, associations });
}

export const archiveObject = (type: "contacts" | "deals" | "notes", id: string) => call<unknown>("DELETE", `/crm/v3/objects/${type}/${id}`);

export const recordUrl = (type: "contact" | "deal", id: string) =>
  `https://app-na2.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID ?? ""}/record/${type === "contact" ? "0-1" : "0-3"}/${id}`;
