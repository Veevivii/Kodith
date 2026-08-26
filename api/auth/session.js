// GET /api/auth/session — status check, not a gate. Always 200; the admin
// UI reads `authenticated` to decide whether to show the login form or the
// CRUD panels.
import { getIronSession } from "iron-session";
import { sessionOptions } from "../_lib/session.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getIronSession(request, response, sessionOptions);

  if (session.isLoggedIn) {
    response.status(200).json({ authenticated: true, email: session.email, name: session.name });
  } else {
    response.status(200).json({ authenticated: false });
  }
}
