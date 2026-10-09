/** Ad-hoc read-only SQL for debugging: npx tsx scripts/sql.ts "select ..." */
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
const q = process.argv[2];
if (!/^\s*select\b/i.test(q ?? "")) throw new Error("select only");
db().execute(sql.raw(q)).then((r) => { console.table(r.rows); process.exit(0); });
