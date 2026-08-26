// Applies db/schema.sql. Run with: npm run db:migrate
// Uses DATABASE_URL_UNPOOLED — DDL should bypass the pgbouncer pooled
// connection that the app's runtime queries use.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env.local first.");
  process.exit(1);
}

const sql = neon(connectionString);
const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");

// neon() executes one statement per call — split on statement-terminating
// semicolons (the schema has none inside strings/values, so this is safe here).
const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

// sql`...` is a tagged template — a plain string needs sql.query() instead,
// per @neondatabase/serverless's NeonQueryFunction interface.
for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} statements from db/schema.sql`);
