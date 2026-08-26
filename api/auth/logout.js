import { getIronSession } from "iron-session";
import { sessionOptions } from "../_lib/session.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getIronSession(request, response, sessionOptions);
  session.destroy();

  response.status(200).json({ authenticated: false });
}
