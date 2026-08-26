// Creates (or updates the password for) one admin login.
// Not self-serve by design — run locally, once per trusted teammate:
//
//   SEED_ADMIN_PASSWORD="a real password" node scripts/seed-admin.mjs "name@example.com" "Their Name"
//
// The password is read from an env var, never a CLI argument, so it never
// ends up in shell history.
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { sql } from "../api/_lib/db.js";

// `vercel env pull` writes .env.local (Vercel's own convention); a plain
// .env also works if you set one up by hand.
dotenv.config({ path: [".env.local", ".env"] });

const [, , email, name] = process.argv;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!email || !password) {
  console.error(
    'Usage: SEED_ADMIN_PASSWORD="..." node scripts/seed-admin.mjs "email@example.com" "Name"'
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("SEED_ADMIN_PASSWORD is too short — use at least 8 characters.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

await sql`
  INSERT INTO admins (email, password_hash, name)
  VALUES (${email}, ${hash}, ${name || ""})
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
`;

console.log(`Admin upserted: ${email}`);
