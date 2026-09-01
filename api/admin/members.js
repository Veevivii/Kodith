// GET/POST/PATCH/DELETE /api/admin/members — session-gated, same as every
// other admin route. PATCH/DELETE take the row id as ?id= (bracket dynamic
// routes like [id].js are a Next.js file convention, not a confirmed
// bare-Vercel guarantee — see the matching note in api/admin/events.js).
//
// This holds member email addresses, so every method here is behind
// requireAuth() and nothing in this file is ever exposed publicly. The
// public verification page reads the members table separately, and returns
// only name / year / mint number — never email.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";
import { generateHexId } from "../_lib/card-id.js";

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      const rows = await sql`
        SELECT id, name, email, hex_id, mint_number,
               to_char(issued_at, 'YYYY-MM-DD') AS issued_at
        FROM members
        ORDER BY mint_number ASC
      `;
      response.status(200).json(rows);
      return;
    }

    if (request.method === "POST") {
      const { name, email } = request.body || {};
      if (!name || !email) {
        response.status(400).json({ error: "name and email are required" });
        return;
      }

      let hexId;
      try {
        hexId = generateHexId(name, email);
      } catch (err) {
        // Missing salt is a deployment problem, not a bad request — say so
        // plainly rather than surfacing it as a generic 500.
        console.error("api/admin/members: cannot generate hex id:", err);
        response.status(500).json({ error: "CARD_ID_SALT is not configured on the server" });
        return;
      }

      // mint_number is computed inside the INSERT so two admins adding at
      // the same moment can't both read the same MAX() and collide.
      const [row] = await sql`
        INSERT INTO members (name, email, hex_id, mint_number)
        VALUES (
          ${String(name).trim()},
          ${String(email).trim()},
          ${hexId},
          (SELECT COALESCE(MAX(mint_number), 0) + 1 FROM members)
        )
        RETURNING id, name, email, hex_id, mint_number,
                  to_char(issued_at, 'YYYY-MM-DD') AS issued_at
      `;
      response.status(201).json(row);
      return;
    }

    const id = Number(request.query.id);
    if (!id) {
      response.status(400).json({ error: "?id= is required for this method" });
      return;
    }

    if (request.method === "PATCH") {
      const { name, email } = request.body || {};
      if (!name || !email) {
        response.status(400).json({ error: "name and email are required" });
        return;
      }
      // hex_id and mint_number are deliberately NOT recomputed on edit: the
      // card has already been issued and may be printed or shared, so its
      // identity has to stay stable even if a typo in the name is fixed.
      const [row] = await sql`
        UPDATE members
        SET name=${String(name).trim()}, email=${String(email).trim()}, updated_at=now()
        WHERE id=${id}
        RETURNING id, name, email, hex_id, mint_number,
                  to_char(issued_at, 'YYYY-MM-DD') AS issued_at
      `;
      if (!row) { response.status(404).json({ error: "Not found" }); return; }
      response.status(200).json(row);
      return;
    }

    if (request.method === "DELETE") {
      const rows = await sql`DELETE FROM members WHERE id=${id} RETURNING id`;
      if (!rows.length) { response.status(404).json({ error: "Not found" }); return; }
      response.status(204).end();
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    // A duplicate is the one error an admin can actually act on, so name it
    // rather than reporting a generic failure.
    if (err && err.code === "23505") {
      response.status(409).json({
        error: "That name and email already has a card — the ID is derived from them, so it would be a duplicate.",
      });
      return;
    }
    console.error("api/admin/members failed:", err);
    response.status(500).json({ error: "Request failed" });
  }
}
