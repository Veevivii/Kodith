// GET/POST/PATCH/DELETE /api/admin/events — session-gated. PATCH/DELETE take
// the row id as ?id= (see README on why: bracket dynamic routes like
// [id].js are a Next.js convention, not a confirmed bare-Vercel guarantee).
//
// PATCH expects the full set of fields, not a partial patch — the admin UI's
// edit form always submits every field, so there's no dynamic SET clause to
// build here, which keeps the SQL a plain parameterized statement.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      const rows = await sql`
        SELECT id, to_char(date, 'YYYY-MM-DD') AS date, time, title, format, place, blurb, link, sort_order
        FROM events ORDER BY date ASC
      `;
      response.status(200).json(rows);
      return;
    }

    if (request.method === "POST") {
      const { date, time, title, format, place, blurb, link } = request.body || {};
      if (!date || !title) {
        response.status(400).json({ error: "date and title are required" });
        return;
      }
      const [row] = await sql`
        INSERT INTO events (date, time, title, format, place, blurb, link)
        VALUES (${date}, ${time || ""}, ${title}, ${format || ""}, ${place || ""}, ${blurb || ""}, ${link || ""})
        RETURNING id, to_char(date, 'YYYY-MM-DD') AS date, time, title, format, place, blurb, link
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
      const { date, time, title, format, place, blurb, link } = request.body || {};
      if (!date || !title) {
        response.status(400).json({ error: "date and title are required" });
        return;
      }
      const [row] = await sql`
        UPDATE events
        SET date=${date}, time=${time || ""}, title=${title}, format=${format || ""},
            place=${place || ""}, blurb=${blurb || ""}, link=${link || ""}, updated_at=now()
        WHERE id=${id}
        RETURNING id, to_char(date, 'YYYY-MM-DD') AS date, time, title, format, place, blurb, link
      `;
      if (!row) { response.status(404).json({ error: "Not found" }); return; }
      response.status(200).json(row);
      return;
    }

    if (request.method === "DELETE") {
      const rows = await sql`DELETE FROM events WHERE id=${id} RETURNING id`;
      if (!rows.length) { response.status(404).json({ error: "Not found" }); return; }
      response.status(204).end();
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/admin/events failed:", err);
    response.status(500).json({ error: "Request failed" });
  }
}
