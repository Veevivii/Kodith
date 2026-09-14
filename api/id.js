// Public member verification page, served at /id/<hexId> via the rewrite in
// vercel.json. No auth — that's the point, anyone holding a card should be
// able to check it.
//
// Rendered server-side rather than as a static page that fetches JSON,
// for three reasons:
//   1. it works with JavaScript disabled,
//   2. it can return a real 404 status for an unknown ID, and
//   3. it means there is no public members endpoint to enumerate — the only
//      way to learn anything is to already hold a specific valid ID.
//
// Only name, member-since date and mint number are ever rendered. Email is
// deliberately never exposed here.
import { sql } from "./_lib/db.js";
import { normalizeHexId } from "./_lib/card-id.js";

/** Escapes text for HTML. Member names come from admin input, but this page
 *  is public and unauthenticated — it should not be able to inject markup. */
function esc(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page({ title, body, status }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/styles.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 0C12 6.6 17.4 12 24 12C17.4 12 12 17.4 12 24C12 17.4 6.6 12 0 12C6.6 12 12 6.6 12 0Z' fill='%23FF8A4C'/%3E%3C/svg%3E">
<style>
  .idp {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .idp__card {
    width: 100%;
    max-width: 420px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
    padding: 36px 32px;
    text-align: center;
  }
  .idp__mark {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.25rem;
    margin-bottom: 28px;
  }
  .idp__status {
    font-family: var(--font-display);
    font-size: 0.8125rem;
    letter-spacing: 0.14em;
    text-transform: lowercase;
    margin-bottom: 18px;
  }
  .idp__status--ok { color: var(--accent-signal); }
  .idp__status--no { color: var(--text-muted); }
  .idp__name {
    font-size: clamp(1.5rem, 6vw, 2rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  /* Reads as one sentence with the name above it, so the page states the
     claim in full rather than leaving it implied by a status label. */
  .idp__claim {
    margin-top: 10px;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .idp__meta {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--hairline);
    display: flex;
    justify-content: center;
    gap: 32px;
    font-family: var(--font-mono);
  }
  .idp__meta dt {
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 5px;
  }
  .idp__meta dd { font-size: 0.9375rem; }
  .idp__note {
    margin-top: 20px;
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.6;
  }
  .idp__back {
    display: inline-block;
    margin-top: 28px;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--hairline);
  }
  .idp__back:hover { color: var(--accent-signal); }
</style>
</head>
<body>
<main class="idp">
  <div class="idp__card">
    <p class="idp__mark">Kōdith</p>
${body}
    <a class="idp__back" href="/">kodith.vercel.app</a>
  </div>
</main>
</body>
</html>`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-12" -> "12 September 2026". Built from the string's parts rather
 *  than a Date object, so no timezone can nudge the day, and the month is
 *  spelled out so it can't be misread as 09/12 versus 12/09. Returns "" for
 *  anything that isn't a well-formed date, and the sentence then simply ends
 *  without "since". */
function formatSince(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function foundBody(member) {
  const since = formatSince(member.since);
  return `    <p class="idp__status idp__status--ok">✦ verified</p>
    <p class="idp__name">${esc(member.name)}</p>
    <p class="idp__claim">is a verified member of the Kōdith Community${since ? ` since ${esc(since)}` : ""}.</p>
    <dl class="idp__meta">
      <div>
        <dt>mint</dt>
        <dd>#${esc(member.mint_number)}</dd>
      </div>
    </dl>`;
}

function notFoundBody() {
  return `    <p class="idp__status idp__status--no">not verified</p>
    <p class="idp__name">Not a verified member</p>
    <p class="idp__note">This ID doesn't match any Kōdith member card. Check the
      code on the card, or get in touch if you think it should be valid.</p>`;
}

export default async function handler(request, response) {
  const hexId = normalizeHexId(request.query.hex);

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  // Verification should always reflect current data — a revoked or corrected
  // card must not keep verifying from a CDN copy.
  response.setHeader("Cache-Control", "no-store");

  // Every failure path below renders the same clean "not verified" card
  // rather than an error page: someone scanning a card should never be
  // shown a stack trace or a raw 500.
  if (!/^[0-9A-F]{8}$/.test(hexId)) {
    response.status(404).send(page({ title: "Not a verified member — Kōdith", body: notFoundBody() }));
    return;
  }

  try {
    // issued_at is the member-since date. The import writes it as a bare date
    // and this reads it back in the same session timezone, so the calendar day
    // round-trips exactly — the same expression api/admin/members.js uses.
    // Don't add AT TIME ZONE on this side alone: it would shift the day
    // whenever the database's default zone isn't UTC.
    const [row] = await sql`
      SELECT name, mint_number, to_char(issued_at, 'YYYY-MM-DD') AS since
      FROM members
      WHERE hex_id = ${hexId}
    `;
    if (!row) {
      response.status(404).send(page({ title: "Not a verified member — Kōdith", body: notFoundBody() }));
      return;
    }
    response.status(200).send(page({ title: `${row.name} — verified Kōdith member`, body: foundBody(row) }));
  } catch (err) {
    console.error("api/id failed:", err);
    // Even a database outage shows the clean card, not an error dump. 503
    // so it isn't cached or read as a permanent "this ID is fake".
    response.status(503).send(page({ title: "Verification unavailable — Kōdith", body: notFoundBody() }));
  }
}
