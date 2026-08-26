// GET /api/data — public. Returns { upcoming, projects, team } in exactly
// the shape site-data.js's KODITH_DATA has always had, so js/main.js's
// existing render functions need no changes.
import { sql } from "./_lib/db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Dates come back as plain YYYY-MM-DD strings via to_char — the driver's
    // default JS Date object would serialize as a full UTC timestamp and
    // break main.js's parseDate() regex (^\d{4}-\d{2}-\d{2}$), silently
    // dropping every event off the Upcoming list.
    const events = await sql`
      SELECT id, to_char(date, 'YYYY-MM-DD') AS date, time, title, format, place, blurb, link
      FROM events
      ORDER BY date ASC
    `;
    const projects = await sql`
      SELECT id, name, blurb, tag, status, link
      FROM projects
      ORDER BY sort_order ASC, id ASC
    `;
    const team = await sql`
      SELECT id, name, role, photo, link
      FROM team_members
      ORDER BY sort_order ASC, id ASC
    `;

    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    response.status(200).json({ upcoming: events, projects, team });
  } catch (err) {
    console.error("GET /api/data failed:", err);
    response.status(500).json({ error: "Failed to load site data" });
  }
}
