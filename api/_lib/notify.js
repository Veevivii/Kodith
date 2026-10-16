// Emails the Kodith inbox when a Chief Campus Executive application arrives.
//
// Sent through Resend's HTTP API with a plain fetch, so there is no SDK to
// keep up to date. Without a verified domain, Resend sends from
// onboarding@resend.dev and only to the address the Resend account was
// created with, which is all an alert to ourselves needs.
//
// It never throws. It returns "" when the email went out, otherwise a short
// reason. api/cce.js stores that reason on the application so /admin/cce can
// say when alerts have stopped working (a revoked key, a used-up quota)
// instead of them failing silently.

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 5000;
const ADMIN_URL = "https://kodith.vercel.app/admin/cce";
const DEFAULT_TO = "kodith.dev@gmail.com";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// The form's one-line inputs can't contain line breaks, but a script posting
// to the API directly could send them.
function oneLine(s) {
  return String(s).replace(/\s+/g, " ");
}

function details(app) {
  return [
    ["Email", app.email],
    ["Phone / WhatsApp", app.phone],
    // picked from the AISHE list: where it is. Typed by hand: say so, since it won't group with the rest yet.
    ["College", app.college_id ? [app.college, app.college_place].filter(Boolean).join(", ") : app.college + " (typed, not in the AISHE list)"],
    ["Course and year", app.course_year],
    ["City", app.city],
    ["LinkedIn", app.linkedin],
  ].filter(([, value]) => value).map(([label, value]) => [label, oneLine(value)]);
}

function textBody(app) {
  return [
    "New Chief Campus Executive application",
    "",
    "Name: " + oneLine(app.name),
    ...details(app).map(([label, value]) => label + ": " + value),
    "",
    "About them:",
    app.about,
    "",
    "Why they want to bring Kodith to their college:",
    app.motivation,
    "",
    "Review it: " + ADMIN_URL,
    "Reply to this email to write to " + oneLine(app.name) + " directly.",
  ].join("\n");
}

// Everything here was typed by a stranger, so every value is escaped, and
// only the two fields api/cce.js already validated become links.
function htmlBody(app) {
  const muted = "color:#6b6b6b";
  const rows = details(app).map(([label, value]) => {
    let shown = esc(value);
    if (label === "Email") shown = `<a href="mailto:${esc(value)}">${esc(value)}</a>`;
    if (label === "LinkedIn" && /^https?:\/\//i.test(value)) shown = `<a href="${esc(value)}">${esc(value)}</a>`;
    return `<tr><td style="padding:3px 16px 3px 0;${muted};white-space:nowrap;vertical-align:top">${esc(label)}</td>`
      + `<td style="padding:3px 0;word-break:break-word">${shown}</td></tr>`;
  }).join("");
  const answer = (q, a) => `<p style="margin:0 0 6px;font-weight:600">${esc(q)}</p>`
    + `<p style="margin:0 0 20px;white-space:pre-wrap">${esc(a)}</p>`;
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;color:#161616;max-width:600px">`
    + `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;${muted}">New Chief Campus Executive application</p>`
    + `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${esc(app.name)}</h1>`
    + `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px">${rows}</table>`
    + answer("About them", app.about)
    + answer("Why they want to bring Kodith to their college", app.motivation)
    + `<p style="margin:0 0 20px"><a href="${ADMIN_URL}" style="display:inline-block;padding:10px 18px;background:#0B0E14;color:#F3EFE6;text-decoration:none;border-radius:6px">Open in admin</a></p>`
    + `<p style="margin:0;font-size:13px;${muted}">Reply to this email to write to ${esc(app.name)} directly.</p>`
    + `</div>`;
}

/** @param app the validated application fields from api/cce.js */
export async function notifyNewApplication(app) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Email alerts are off: RESEND_API_KEY isn't set in Vercel.";

  const subject = oneLine("New CCE application: " + app.name + " (" + app.college + ")").slice(0, 200);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "User-Agent": "kodith-site" },
      body: JSON.stringify({
        from: "Kodith <onboarding@resend.dev>",
        to: [process.env.NOTIFY_EMAIL || DEFAULT_TO],
        reply_to: app.email,
        subject,
        text: textBody(app),
        html: htmlBody(app),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "";
    const body = await res.json().catch(() => ({}));
    const reason = String(body.message || body.error || res.statusText || "no details").slice(0, 300);
    console.error("CCE alert email refused:", res.status, reason);
    return `Resend refused the alert email (${res.status}): ${reason}`;
  } catch (err) {
    console.error("CCE alert email failed:", err);
    return err && err.name === "TimeoutError"
      ? `Resend didn't answer within ${TIMEOUT_MS / 1000} seconds.`
      : "Couldn't reach Resend: " + String((err && err.message) || err).slice(0, 200);
  }
}
