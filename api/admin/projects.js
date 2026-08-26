// GET/POST/PATCH/DELETE /api/admin/projects — session-gated.
// Same ?id= convention as api/admin/events.js.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      const rows = await sql`
        SELECT id, name, blurb, tag, status, link, sort_order
        FROM projects ORDER BY sort_order ASC, id ASC
      `;
      response.status(200).json(rows);
      return;
    }

    if (request.method === "POST") {
      const { name, blurb, tag, status, link } = request.body || {};
      if (!name) {
        response.status(400).json({ error: "name is required" });
        return;
      }
      const [{ next_order }] = await sql`SELECT coalesce(max(sort_order), -1) + 1 AS next_order FROM projects`;
      const [row] = await sql`
        INSERT INTO projects (name, blurb, tag, status, link, sort_order)
        VALUES (${name}, ${blurb || ""}, ${tag || ""}, ${status || "Live"}, ${link || ""}, ${next_order})
        RETURNING id, name, blurb, tag, status, link, sort_order
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
      const { name, blurb, tag, status, link, sort_order } = request.body || {};
      if (!name) {
        response.status(400).json({ error: "name is required" });
        return;
      }
      const [row] = await sql`
        UPDATE projects
        SET name=${name}, blurb=${blurb || ""}, tag=${tag || ""}, status=${status || "Live"},
            link=${link || ""}, sort_order=${sort_order ?? 0}, updated_at=now()
        WHERE id=${id}
        RETURNING id, name, blurb, tag, status, link, sort_order
      `;
      if (!row) { response.status(404).json({ error: "Not found" }); return; }
      response.status(200).json(row);
      return;
    }

    if (request.method === "DELETE") {
      const rows = await sql`DELETE FROM projects WHERE id=${id} RETURNING id`;
      if (!rows.length) { response.status(404).json({ error: "Not found" }); return; }
      response.status(204).end();
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/admin/projects failed:", err);
    response.status(500).json({ error: "Request failed" });
  }
}
