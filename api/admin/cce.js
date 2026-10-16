// GET/PATCH/DELETE /api/admin/cce — review Chief Campus Executive applications.
// Session-gated like every other admin route. PATCH/DELETE take the row id as
// ?id= (same convention as api/admin/events.js).
//
// PATCH only touches the fields it is given. An edit that sends just a status
// must not wipe the notes, the same bug that once reset team sort order when
// an edit didn't send it (see api/admin/team.js), hence COALESCE.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

const STATUSES = ["new", "shortlisted", "contacted", "accepted", "rejected"];

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      // college = what the applicant chose or typed. college_name/district/state
      // = the AISHE college it's linked to, if any (picked on the form, or
      // linked here later), which is what the by-college filter groups on.
      const rows = await sql`
        SELECT a.id, a.name, a.email, a.phone, a.college, a.college_id,
               c.name AS college_name, c.district AS college_district, c.state AS college_state,
               a.course_year, a.city, a.linkedin, a.about, a.motivation, a.status, a.notes, a.notify_error,
               to_char(a.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS submitted
        FROM cce_applications a
        LEFT JOIN colleges c ON c.id = a.college_id
        ORDER BY a.created_at DESC
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
      const body = request.body || {};
      const { status, notes } = body;
      // college_id only changes when the key is sent: a number links (or
      // re-links) the application to that college, null unlinks it.
      const setCollege = Object.prototype.hasOwnProperty.call(body, "college_id");
      let collegeId = null;
      if (setCollege && body.college_id !== null) {
        collegeId = Number(body.college_id);
        const [c] = Number.isInteger(collegeId) && collegeId > 0 ? await sql`SELECT id FROM colleges WHERE id = ${collegeId}` : [];
        if (!c) { response.status(400).json({ error: "Unknown college" }); return; }
      }
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
        WITH u AS (
          UPDATE cce_applications
          SET status = COALESCE(${nextStatus}::text, status),
              notes = COALESCE(${nextNotes}::text, notes),
              college_id = CASE WHEN ${setCollege} THEN ${collegeId}::int ELSE college_id END,
              updated_at = now()
          WHERE id = ${id}
          RETURNING id, status, notes, college_id
        )
        SELECT u.*, c.name AS college_name, c.district AS college_district, c.state AS college_state
        FROM u LEFT JOIN colleges c ON c.id = u.college_id
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
