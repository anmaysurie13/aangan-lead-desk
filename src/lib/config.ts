import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

/** Reads one config value (rate cards, SLAs, runway). Returns the fallback when unset/NULL. */
export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const rows = await db().select({ value: schema.config.value }).from(schema.config).where(eq(schema.config.key, key)).limit(1);
  const v = rows[0]?.value;
  return v === null || v === undefined ? fallback : (v as T);
}

/** 10:00–19:00 IST by default (front-desk hours from the case). */
export async function isInOfficeHours(at: Date): Promise<boolean> {
  const oh = await getConfig("office_hours", { tz: "Asia/Kolkata", start: "10:00", end: "19:00" });
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: oh.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  return hhmm >= oh.start && hhmm < oh.end;
}
