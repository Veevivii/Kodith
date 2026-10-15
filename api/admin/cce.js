// GET/PATCH/DELETE /api/admin/cce — review Chief Campus Executive applications.
// Session-gated like every other admin route. PATCH/DELETE take the row id as
// ?id= (same convention as api/admin/events.js).
//
// PATCH only touches the fields it is given. An edit that sends just a status
// must not wipe the notes, the same bug that once reset team sort order when
// an edit didn't send it (see api/admin/team.js), hence COALESCE.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

const STATUSES = ["new", "shortlisted", "contacted", "rejected"];

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      const rows = await sql`
        SELECT id, name, email, phone, college, course_year, city, linkedin, about, motivation, status, notes, notify_error,
               to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS submitted
        FROM cce_applications
        ORDER BY created_at DESC
      `;
      response.status(200).json(rows);
      return;
    }

    const id = Number(request.query.id);
    if (!id) {
      response.status(400).json({ error: "?id= is required for this method" });
      return;
    }

    if (request.method === "PATCH") {
      const { status, notes } = request.body || {};
      if (status !== undefined && !STATUSES.includes(status)) {
        response.status(400).json({ error: "Unknown status" });
        return;
      }
      if (notes !== undefined && String(notes).length > 4000) {
        response.status(400).json({ error: "Notes can be at most 4000 characters" });
        return;
      }
      const nextStatus = status === undefined ? null : status;
      const nextNotes = notes === undefined ? null : String(notes);
      const [row] = await sql`
        UPDATE cce_applications
        SET status = COALESCE(${nextStatus}::text, status),
            notes = COALESCE(${nextNotes}::text, notes),
            updated_at = now()
        WHERE id = ${id}
        RETURNING id, status, notes
      `;
      if (!row) { response.status(404).json({ error: "Not found" }); return; }
      response.status(200).json(row);
      return;
    }

    if (request.method === "DELETE") {
      const rows = await sql`DELETE FROM cce_applications WHERE id = ${id} RETURNING id`;
      if (!rows.length) { response.status(404).json({ error: "Not found" }); return; }
      response.status(204).end();
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/admin/cce failed:", err);
    response.status(500).json({ error: "Request failed" });
  }
}
