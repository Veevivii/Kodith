// Shared Postgres client. Prefixed with `_` so Vercel does not route this
// file as its own function (see api/README conventions).
import { neon } from "@neondatabase/serverless";

// Constructed lazily, on first query, rather than at import time. This
// matters for local one-off scripts: a static `import { sql } from
// "./_lib/db.js"` is fully evaluated — including this file's top-level code
// — before the importing script's own body runs, so an eager
// `neon(process.env.DATABASE_URL)` here would already have thrown by the
// time that script's own `dotenv.config()` call got a chance to run. On
// Vercel this makes no difference either way, since env vars are already
// present before any function boots.
let client;
function getClient() {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

// Used everywhere as a tagged template — sql`SELECT ...`. Nothing in this
// project needs the client's other methods (e.g. .query()); scripts that
// build dynamic SQL text construct their own neon() client directly instead
// (see scripts/migrate.mjs).
export function sql(strings, ...values) {
  return getClient()(strings, ...values);
}
