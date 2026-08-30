// GET/POST/PATCH/DELETE /api/admin/team — session-gated.
// Same ?id= convention as api/admin/events.js. `photo` is a URL, normally
// filled in by uploading through /api/admin/upload first.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      const rows = await sql`
        SELECT id, name, role, photo, link, sort_order
        FROM team_members ORDER BY sort_order ASC, id ASC
      `;
      response.status(200).json(rows);
      return;
    }

    if (request.method === "POST") {
      const { name, role, photo, link } = request.body || {};
      if (!name) {
        response.status(400).json({ error: "name is required" });
        return;
      }
      const [{ next_order }] = await sql`SELECT coalesce(max(sort_order), -1) + 1 AS next_order FROM team_members`;
      const [row] = await sql`
        INSERT INTO team_members (name, role, photo, link, sort_order)
        VALUES (${name}, ${role || ""}, ${photo || ""}, ${link || ""}, ${next_order})
        RETURNING id, name, role, photo, link, sort_order
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
      const { name, role, photo, link, sort_order } = request.body || {};
      if (!name) {
        response.status(400).json({ error: "name is required" });
        return;
      }
      // COALESCE, not `?? 0`: the edit form only sends the visible fields,
      // so an ordinary edit arrives with no sort_order at all. Defaulting
      // that to 0 silently reset the member's position every time anyone
      // edited them — and once several rows sat at 0, reordering had
      // nothing to swap and the list fell back to id order.
      const nextOrder = (sort_order === undefined || sort_order === null) ? null : Number(sort_order);
      const [row] = await sql`
        UPDATE team_members
        SET name=${name}, role=${role || ""}, photo=${photo || ""}, link=${link || ""},
            sort_order = COALESCE(${nextOrder}::int, sort_order), updated_at=now()
        WHERE id=${id}
        RETURNING id, name, role, photo, link, sort_order
      `;
      if (!row) { response.status(404).json({ error: "Not found" }); return; }
      response.status(200).json(row);
      return;
    }

    if (request.method === "DELETE") {
      const rows = await sql`DELETE FROM team_members WHERE id=${id} RETURNING id`;
      if (!rows.length) { response.status(404).json({ error: "Not found" }); return; }
      response.status(204).end();
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/admin/team failed:", err);
    response.status(500).json({ error: "Request failed" });
  }
}
