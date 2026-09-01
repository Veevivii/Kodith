// GET /api/admin/members-export — session-gated CSV of all members.
//
// This is the handoff to the offline card-image generator, so the column
// order is a contract: name,email,hex_id,mint_number,issued_at. Don't
// reorder or insert columns without updating that script too.
//
// Session-gated like every other admin route — this contains every member's
// email address and must never be publicly reachable.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

const COLUMNS = ["name", "email", "hex_id", "mint_number", "issued_at"];

/**
 * RFC 4180 escaping: wrap in quotes when the value contains a comma, quote,
 * CR or LF, and double any embedded quotes. Without this a member with a
 * comma in their name would silently shift every later column in that row.
 */
function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const rows = await sql`
      SELECT name, email, hex_id, mint_number,
             to_char(issued_at, 'YYYY-MM-DD') AS issued_at
      FROM members
      ORDER BY mint_number ASC
    `;

    const lines = [COLUMNS.join(",")];
    for (const row of rows) {
      lines.push(COLUMNS.map((c) => csvCell(row[c])).join(","));
    }
    // CRLF line endings, per RFC 4180 — keeps Excel happy on Windows.
    const csv = lines.join("\r\n") + "\r\n";

    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="kodith-members-${stamp}.csv"`);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).send(csv);
  } catch (err) {
    console.error("api/admin/members-export failed:", err);
    response.status(500).json({ error: "Export failed" });
  }
}
