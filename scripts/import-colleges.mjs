// Loads db/colleges.csv.gz (built by scripts/aishe-to-csv.py from the AISHE
// directory) into the `colleges` table. Run with: npm run db:import-colleges
//
// Safe to re-run when AISHE publishes a new list: rows are upserted on their
// AISHE code, so ids stay the same and applications keep pointing at the
// right college. Colleges that drop out of a newer list are left in place,
// since an application may still reference them.
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { parseCsv } from "../api/_lib/csv.js";
import { acronymOf, searchTextOf } from "../api/_lib/colleges.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: [".env.local", ".env"] });

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env.local first.");
  process.exit(1);
}
const sql = neon(connectionString);

const file = path.join(__dirname, "..", "db", "colleges.csv.gz");
const [header, ...rows] = parseCsv(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
const expected = ["aishe_code", "name", "district", "state", "kind"];
if (header.join(",") !== expected.join(",")) {
  console.error(`Unexpected columns in ${file}: ${header.join(", ")} (want ${expected.join(", ")})`);
  process.exit(1);
}

const BATCH = 1000;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const col = (k) => chunk.map((r) => r[k] ?? "");
  const named = chunk.map(([, name, district]) => ({ name, district }));
  await sql`
    INSERT INTO colleges (aishe_code, name, district, state, kind, acronym, search)
    SELECT * FROM unnest(${col(0)}::text[], ${col(1)}::text[], ${col(2)}::text[], ${col(3)}::text[], ${col(4)}::text[],
                         ${named.map((r) => acronymOf(r.name))}::text[], ${named.map(searchTextOf)}::text[])
    ON CONFLICT (aishe_code) DO UPDATE SET
      name = EXCLUDED.name, district = EXCLUDED.district, state = EXCLUDED.state,
      kind = EXCLUDED.kind, acronym = EXCLUDED.acronym, search = EXCLUDED.search
  `;
  done += chunk.length;
  process.stdout.write(`\r${done} / ${rows.length}`);
}
const [{ n, u }] = await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE kind = 'university')::int AS u FROM colleges`;
console.log(`\nDone: ${n} in the table (${u} universities, ${n - u} colleges).`);
