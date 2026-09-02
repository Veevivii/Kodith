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

// Used everywhere as a tagged template — sql`SELECT ...`. Scripts that build
// dynamic SQL text construct their own neon() client directly instead (see
// scripts/migrate.mjs), so .query() is deliberately not forwarded here.
export function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

/**
 * Runs several queries as one non-interactive transaction, so a failure
 * part-way through leaves nothing applied. Takes an array of queries built
 * with the `sql` tag above.
 *
 * Forwarded explicitly because `sql` is a wrapper function, not the neon
 * client itself — the client's own properties are not on it.
 */
sql.transaction = function (queries, options) {
  return getClient().transaction(queries, options);
};
