// /api/auth/login, /api/auth/logout, /api/auth/session: one function behind
// three URLs.
//
// Vercel's Hobby plan caps a deployment at 12 serverless functions, and every
// routed file under api/ counts as one. The three small auth handlers share
// this one, and vercel.json rewrites /api/auth/:action to /api/auth?action=:action,
// so the URLs the admin pages call are unchanged. The handlers themselves are
// untouched in _lib/auth/ (the leading underscore keeps them from being routed).
import login from "./_lib/auth/login.js";
import logout from "./_lib/auth/logout.js";
import session from "./_lib/auth/session.js";

const ACTIONS = { login, logout, session };

export default async function handler(request, response) {
  const action = ACTIONS[request.query && request.query.action];
  if (!action) {
    response.status(404).json({ error: "Not found" });
    return;
  }
  return action(request, response);
}
