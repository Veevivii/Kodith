// GET/POST/PATCH/DELETE /api/admin/members — session-gated, same as every
// other admin route. PATCH/DELETE take the row id as ?id= (bracket dynamic
// routes like [id].js are a Next.js file convention, not a confirmed
// bare-Vercel guarantee — see the matching note in api/admin/events.js).
//
// This holds member email addresses, so every method here is behind
// requireAuth() and nothing in this file is ever exposed publicly. The
// public verification page reads the members table separately, and returns
// only name / year / mint number — never email.
//
// Bulk loading happens in members-import.js. What is left here is the
// single-row escape hatch: fixing one entry by hand. hex_id and mint_number
// are therefore taken exactly as typed and never generated — the offline
// card script mints those, and the site must not invent an identity that
// disagrees with a card someone is already carrying.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";

const HEX_RE = /^[0-9A-Fa-f]{8}$/;

/**
 * Validates the four fields an admin can type. Returns an error string, or
 * null when the values are usable.
 */
function validate({ name, email, hex_id, mint_number }) {
  if (!name || !String(name).trim()) return "Name is required.";
  if (!email || !String(email).trim()) return "Email is required.";
  if (String(email).indexOf("@") === -1) return "That doesn't look like an email address.";

  const hex = String(hex_id == null ? "" : hex_id).trim();
  if (!HEX_RE.test(hex)) return "Card ID must be exactly 8 hex characters (0-9, A-F).";

  const mintRaw = String(mint_number == null ? "" : mint_number).trim();
  if (!/^\d+$/.test(mintRaw) || Number(mintRaw) < 1) return "Mint number must be a positive whole number.";

  return null;
}

/** Field values, normalised the same way for both insert and update. */
function normalise({ name, email, hex_id, mint_number }) {
  return {
    name: String(name).trim(),
    email: String(email).trim(),
    hexId: String(hex_id).trim().toUpperCase(),
    mint: Number(String(mint_number).trim()),
  };
}

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
      const invalid = validate(request.body || {});
      if (invalid) { response.status(400).json({ error: invalid }); return; }
      const v = normalise(request.body);

      const [row] = await sql`
        INSERT INTO members (name, email, hex_id, mint_number)
        VALUES (${v.name}, ${v.email}, ${v.hexId}, ${v.mint})
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
      const invalid = validate(request.body || {});
      if (invalid) { response.status(400).json({ error: invalid }); return; }
      const v = normalise(request.body);

      const [row] = await sql`
        UPDATE members
        SET name=${v.name}, email=${v.email}, hex_id=${v.hexId},
            mint_number=${v.mint}, updated_at=now()
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
    // Every unique column here means something different to an admin, so
    // name the one that actually collided rather than reporting a generic
    // duplicate they then have to go hunting for.
    if (err && err.code === "23505") {
      const c = String(err.constraint || "");
      const message =
        c.indexOf("email") !== -1 ? "Another member already has that email address."
        : c.indexOf("hex_id") !== -1 ? "Another member already has that card ID."
        : c.indexOf("mint") !== -1 ? "Another member already has that mint number."
        : "That would duplicate an existing member.";
      response.status(409).json({ error: message });
      return;
    }
    console.error("api/admin/members failed:", err);
    response.status(500).json({ error: "Request failed" });
  }
}
