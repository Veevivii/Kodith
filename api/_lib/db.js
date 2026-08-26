// Shared Postgres client. Prefixed with `_` so Vercel does not route this
// file as its own function (see api/README conventions).
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// HTTP-based driver: one request per query, no connection to leak across
// serverless cold starts. Use sql`...` as a tagged template for queries;
// use sql.query(text, params) when the query text is built dynamically.
export const sql = neon(process.env.DATABASE_URL);
