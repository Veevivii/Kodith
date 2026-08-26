import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";
import { sql } from "../_lib/db.js";
import { sessionOptions } from "../_lib/session.js";

// A hash of a value nobody will ever type, used to keep bcrypt.compare()'s
// timing roughly the same whether or not the email exists — so a login
// attempt can't be used to enumerate valid admin addresses.
const DUMMY_HASH = "$2b$12$GVM7I6tAiPaX6VRvwFqwE.v6OHzKznjnZ7gjj.YkDqwR1fyY71cHG";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { email, password } = request.body || {};
  if (!email || !password) {
    response.status(400).json({ error: "Email and password are required" });
    return;
  }

  const rows = await sql`SELECT email, password_hash, name FROM admins WHERE email = ${email}`;
  const admin = rows[0];

  const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const session = await getIronSession(request, response, sessionOptions);
  session.isLoggedIn = true;
  session.email = admin.email;
  session.name = admin.name;
  await session.save();

  response.status(200).json({ authenticated: true, email: admin.email, name: admin.name });
}
