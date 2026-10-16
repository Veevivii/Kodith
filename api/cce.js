// POST /api/cce — public endpoint behind the "Become CCE" form at /cce.
// GET  /api/cce?q= — college suggestions for that form (public AISHE data).
//
// For applications it can only insert. They contain applicants' personal details, so
// reading them back goes exclusively through api/admin/cce.js, which is
// session-gated like every other admin route.
//
// Spam protection is three cheap layers rather than a CAPTCHA:
//   - a hidden "website" field humans never see (bots fill every field)
//   - a minimum fill time (the form asks for two paragraphs of text)
//   - a per-network rate limit, keyed on a salted hash of the IP so the raw
//     address is never stored
// Bot submissions get the same success response as real ones, so a script
// can't tell it was filtered and adapt.
//
// Every saved application also emails the team (see _lib/notify.js).
import crypto from "node:crypto";
import { sql } from "./_lib/db.js";
import { notifyNewApplication } from "./_lib/notify.js";
import { searchColleges } from "./_lib/colleges.js";

const MIN_FILL_MS = 2500;
const RATE_LIMIT = 5;            // submissions per network per hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,30}$/;

const FIELDS = {
  name:        { label: "Name", min: 2, max: 100, required: true },
  email:       { label: "Email", min: 5, max: 200, required: true },
  phone:       { label: "Phone / WhatsApp", min: 0, max: 30 },
  college:     { label: "College", min: 2, max: 150, required: true },
  course_year: { label: "Course and year", min: 0, max: 100 },
  city:        { label: "City", min: 0, max: 80 },
  linkedin:    { label: "LinkedIn", min: 0, max: 300 },
  about:       { label: "About you", min: 30, max: 2000, required: true },
  motivation:  { label: "Why you want to bring Kodith to your college", min: 30, max: 2000, required: true },
};

/** Same idea as js/main.js normalizeUrl: people paste "linkedin.com/in/x" without a scheme. */
function normalizeUrl(value) {
  if (!value) return "";
  const v = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : "https://" + value;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
}

function clientIp(request) {
  const fwd = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || request.socket?.remoteAddress || "unknown";
}

// GET /api/cce?q=... : college suggestions for the form's College field, from
// the AISHE list (public data, see api/_lib/colleges.js). Lives here rather
// than in its own file to stay under Vercel's function limit (README).
async function suggestColleges(request, response) {
  const q = String((request.query && request.query.q) || "").trim();
  if (q.length < 2 || q.length > 80) {
    response.status(400).json({ error: "Type 2 to 80 characters to search." });
    return;
  }
  try {
    const rows = await searchColleges(sql, q);
    // The list changes once a year, so the CDN can answer repeat searches.
    response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    response.status(200).json(rows);
  } catch (err) {
    console.error("api/cce college search failed:", err);
    response.status(500).json({ error: "College search is unavailable right now." });
  }
}

export default async function handler(request, response) {
  if (request.method === "GET") return suggestColleges(request, response);
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = request.body && typeof request.body === "object" ? request.body : {};

    // Bots: accept quietly, store nothing.
    const elapsed = Number(body.elapsed_ms);
    if (String(body.website || "").trim() !== "" || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
      response.status(201).json({ ok: true });
      return;
    }

    const v = {};
    const problems = [];
    for (const [key, rule] of Object.entries(FIELDS)) {
      const value = String(body[key] ?? "").trim();
      if (rule.required && !value) { problems.push(`${rule.label} is required.`); continue; }
      if (value && value.length < rule.min) problems.push(`${rule.label} needs at least ${rule.min} characters.`);
      if (value.length > rule.max) problems.push(`${rule.label} can be at most ${rule.max} characters.`);
      v[key] = value;
    }
    if (v.email && !EMAIL_RE.test(v.email)) problems.push("That email address doesn't look right.");
    if (v.phone && !PHONE_RE.test(v.phone)) problems.push("Phone / WhatsApp should be digits, spaces, +, - or brackets only.");
    if (v.linkedin) {
      const url = normalizeUrl(v.linkedin);
      if (url === null) problems.push("LinkedIn should be a link to your profile.");
      else v.linkedin = url;
    }
    if (body.consent !== true) problems.push("Please confirm we can contact you about the role.");

    // College: picked from the AISHE list (stored with its id and the list's
    // own spelling, so applications group cleanly), or typed by someone who
    // said theirs isn't listed (kept as text, college_id NULL).
    v.college_id = null;
    v.college_place = "";
    const pickedId = body.college_id === undefined || body.college_id === null || body.college_id === "" ? null : Number(body.college_id);
    if (pickedId !== null) {
      const [c] = Number.isInteger(pickedId) && pickedId > 0
        ? await sql`SELECT id, name, district, state FROM colleges WHERE id = ${pickedId}`
        : [];
      if (!c) problems.push("Please pick your college from the list again.");
      else { v.college_id = c.id; v.college = c.name; v.college_place = [c.district, c.state].filter(Boolean).join(", "); }
    } else if (v.college && body.college_unlisted !== true) {
      problems.push("Pick your college from the list, or choose \"My college isn't listed\".");
    }

    if (problems.length) {
      response.status(400).json({ error: problems[0], problems });
      return;
    }

    const ipHash = crypto.createHash("sha256")
      .update("cce-ip:" + clientIp(request) + ":" + (process.env.SESSION_SECRET || ""))
      .digest("hex");

    const [{ recent }] = await sql`
      SELECT count(*)::int AS recent FROM cce_applications
      WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'
    `;
    if (recent >= RATE_LIMIT) {
      response.status(429).json({ error: "Too many applications from this network in the last hour. Please try again later, or email us instead." });
      return;
    }

    const [saved] = await sql`
      INSERT INTO cce_applications (name, email, phone, college, college_id, course_year, city, linkedin, about, motivation, ip_hash)
      VALUES (${v.name}, ${v.email}, ${v.phone}, ${v.college}, ${v.college_id}, ${v.course_year}, ${v.city}, ${v.linkedin},
              ${v.about}, ${v.motivation}, ${ipHash})
      RETURNING id
    `;

    // Email the team. This runs before responding because Vercel can pause a
    // function once its response is sent. The application is already saved,
    // so a failed alert never fails it: the reason is recorded instead, and
    // /admin/cce shows it.
    const notifyError = await notifyNewApplication(v);
    if (notifyError) {
      try {
        await sql`UPDATE cce_applications SET notify_error = ${notifyError} WHERE id = ${saved.id}`;
      } catch (err) {
        console.error("api/cce could not record the alert failure:", err);
      }
    }
    response.status(201).json({ ok: true });
  } catch (err) {
    // One application per email. Say so plainly rather than offering to
    // overwrite it, since anyone who knows an address could otherwise
    // replace someone else's application.
    if (err && err.code === "23505") {
      response.status(409).json({ error: "We already have an application from this email. We'll be in touch. Need to change something? Email kodith.dev@gmail.com." });
      return;
    }
    console.error("api/cce failed:", err);
    response.status(500).json({ error: "Something went wrong sending your application. Please try again, or email us instead." });
  }
}
