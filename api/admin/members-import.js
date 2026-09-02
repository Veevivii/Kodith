// POST /api/admin/members-import — bulk import of the members CSV produced
// by the offline card-image script. Session-gated like every other admin
// route; this file handles email addresses and is never exposed publicly.
//
// The offline script is the single source of truth for hex_id and
// mint_number, so both are imported exactly as written. Nothing here mints
// an ID.
//
// Rows are matched on email: an email already in the table updates that
// member, a new one inserts. That is what stops a re-run of the same export
// creating a second card for everyone in it.
import { sql } from "../_lib/db.js";
import { requireAuth } from "../_lib/require-auth.js";
import { parseCsv } from "../_lib/csv.js";

const COLUMNS = ["name", "email", "hex_id", "mint_number", "issued_at"];

// Generous next to any real membership list, but bounded: an accidental
// upload of the wrong file shouldn't try to write an unbounded number of
// rows inside one transaction.
const MAX_ROWS = 5000;

const HEX_RE = /^[0-9A-Fa-f]{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a date that exists — rejects 2026-02-30 and friends. */
function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // The browser posts JSON so the body arrives as a parsed object; a raw
    // text/plain post is accepted too, since that is the obvious thing to
    // reach for with curl when testing an import by hand.
    const body = request.body;
    const text = typeof body === "string" ? body : (body && body.csv);
    if (typeof text !== "string" || !text.trim()) {
      response.status(400).json({ error: "No CSV content received." });
      return;
    }

    const rows = parseCsv(text);
    if (!rows.length) {
      response.status(400).json({ error: "That file is empty." });
      return;
    }

    /* ---- header ---- */

    // Matched by name rather than position, so a file whose columns are in
    // a different order still imports correctly instead of silently writing
    // an email into the hex_id column.
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const index = {};
    const missing = [];
    COLUMNS.forEach((col) => {
      const at = header.indexOf(col);
      if (at === -1) missing.push(col);
      else index[col] = at;
    });

    if (missing.length) {
      response.status(400).json({
        error:
          "That file is missing the column" + (missing.length > 1 ? "s " : " ") +
          missing.join(", ") + ". Expected: " + COLUMNS.join(", ") + ".",
      });
      return;
    }

    const dataRows = rows.slice(1);
    if (!dataRows.length) {
      response.status(400).json({ error: "That file has a header but no members in it." });
      return;
    }
    if (dataRows.length > MAX_ROWS) {
      response.status(400).json({ error: "That file has " + dataRows.length + " rows; the limit is " + MAX_ROWS + "." });
      return;
    }

    /* ---- validation ----
       Everything is checked before anything is written. A half-applied
       import would leave the card data in a state nobody could reason
       about, so a bad file is rejected whole, with the line numbers. */

    const problems = [];
    const parsed = [];
    const seenEmail = new Map();
    const seenHex = new Map();
    const seenMint = new Map();

    dataRows.forEach((cells, i) => {
      const line = i + 2; // +1 for the header, +1 because humans count from 1
      const get = (col) => String(cells[index[col]] == null ? "" : cells[index[col]]).trim();

      const name = get("name");
      const email = get("email");
      const hexId = get("hex_id").toUpperCase();
      const mintRaw = get("mint_number");
      const issuedAt = get("issued_at");

      if (!name) problems.push("Line " + line + ": name is empty.");
      if (!email) problems.push("Line " + line + ": email is empty.");
      else if (email.indexOf("@") === -1) problems.push("Line " + line + ': "' + email + '" is not an email address.');

      if (!HEX_RE.test(hexId)) {
        problems.push("Line " + line + ': hex_id "' + hexId + '" is not 8 hex characters.');
      }

      const mint = Number(mintRaw);
      if (!/^\d+$/.test(mintRaw) || !Number.isInteger(mint) || mint < 1) {
        problems.push("Line " + line + ': mint_number "' + mintRaw + '" is not a positive whole number.');
      }

      if (!isRealDate(issuedAt)) {
        problems.push("Line " + line + ': issued_at "' + issuedAt + '" is not a real YYYY-MM-DD date.');
      }

      // Duplicates *within the file* are ambiguous — which row wins? Rather
      // than picking silently, say where the collision is.
      const emailKey = email.toLowerCase();
      if (email) {
        if (seenEmail.has(emailKey)) problems.push("Line " + line + ": email " + email + " also appears on line " + seenEmail.get(emailKey) + ".");
        else seenEmail.set(emailKey, line);
      }
      if (HEX_RE.test(hexId)) {
        if (seenHex.has(hexId)) problems.push("Line " + line + ": hex_id " + hexId + " also appears on line " + seenHex.get(hexId) + ".");
        else seenHex.set(hexId, line);
      }
      if (/^\d+$/.test(mintRaw)) {
        if (seenMint.has(mint)) problems.push("Line " + line + ": mint_number " + mint + " also appears on line " + seenMint.get(mint) + ".");
        else seenMint.set(mint, line);
      }

      parsed.push({ line, name, email, hexId, mint, issuedAt });
    });

    /* ---- conflicts with members already in the table ----
       hex_id and mint_number are UNIQUE. If the file gives one of them to a
       different person than currently holds it, the write would fail on a
       constraint; caught here it can say which line and which member. */

    if (!problems.length) {
      const existing = await sql`SELECT name, email, hex_id, mint_number FROM members`;
      const byHex = new Map(existing.map((r) => [r.hex_id, r]));
      const byMint = new Map(existing.map((r) => [r.mint_number, r]));

      parsed.forEach((r) => {
        const sameEmail = (other) => other.email.toLowerCase() === r.email.toLowerCase();
        const hexOwner = byHex.get(r.hexId);
        if (hexOwner && !sameEmail(hexOwner)) {
          problems.push("Line " + r.line + ": hex_id " + r.hexId + " already belongs to " + hexOwner.name + " (" + hexOwner.email + ").");
        }
        const mintOwner = byMint.get(r.mint);
        if (mintOwner && !sameEmail(mintOwner)) {
          problems.push("Line " + r.line + ": mint_number " + r.mint + " already belongs to " + mintOwner.name + " (" + mintOwner.email + ").");
        }
      });
    }

    if (problems.length) {
      response.status(400).json({
        error: "Nothing was imported — " + problems.length + " problem" + (problems.length > 1 ? "s" : "") + " in that file.",
        problems: problems.slice(0, 50), // enough to act on without an unreadable wall of text
        totalProblems: problems.length,
      });
      return;
    }

    /* ---- write ----
       One transaction, so a failure part-way leaves the table untouched
       rather than half-imported.

       `xmax = 0` is true only for a freshly inserted row, which is what
       separates "added" from "updated" without a second round of queries. */

    const results = await sql.transaction(
      parsed.map((r) => sql`
        INSERT INTO members (name, email, hex_id, mint_number, issued_at)
        VALUES (${r.name}, ${r.email}, ${r.hexId}, ${r.mint}, ${r.issuedAt}::date)
        ON CONFLICT (lower(email)) DO UPDATE SET
          name        = EXCLUDED.name,
          email       = EXCLUDED.email,
          hex_id      = EXCLUDED.hex_id,
          mint_number = EXCLUDED.mint_number,
          issued_at   = EXCLUDED.issued_at,
          updated_at  = now()
        RETURNING (xmax = 0) AS inserted
      `)
    );

    let added = 0;
    let updated = 0;
    results.forEach((rows_) => {
      const first = Array.isArray(rows_) ? rows_[0] : rows_;
      if (first && first.inserted) added += 1;
      else updated += 1;
    });

    response.status(200).json({ added, updated, total: parsed.length });
  } catch (err) {
    if (err && err.code === "23505") {
      // Shouldn't be reachable — the checks above cover the unique columns —
      // but a constraint name is still more useful than "request failed".
      response.status(409).json({ error: "A card ID or mint number in that file is already taken (" + (err.constraint || "unique constraint") + ")." });
      return;
    }
    console.error("api/admin/members-import failed:", err);
    response.status(500).json({ error: "Import failed" });
  }
}
