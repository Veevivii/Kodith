// Session guard used by every admin CRUD/upload route. Not itself routed
// (the `_lib` folder is excluded from Vercel's /api routing).
import { getIronSession } from "iron-session";
import { sessionOptions } from "./session.js";

/**
 * Returns the session if the request is authenticated, otherwise writes a
 * 401 response and returns null. Callers must check for null and return
 * immediately — the response has already been sent in that case.
 */
export async function requireAuth(request, response) {
  const session = await getIronSession(request, response, sessionOptions);
  if (!session.isLoggedIn) {
    response.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return session;
}
