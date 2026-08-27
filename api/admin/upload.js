// POST /api/admin/upload — session-gated. Uploads one team photo to Vercel
// Blob and returns its public URL for the admin UI to save into a team
// member's `photo` field.
//
// The client always sends the actual HTTP request as
// Content-Type: application/octet-stream, with the filename in `x-filename`
// and the photo's real MIME type in `x-content-type` — Vercel's Node runtime
// only auto-parses request.body into a Buffer for a fixed list of content
// types (json, urlencoded, text/plain, octet-stream), and a real image type
// like "image/png" isn't one of them, so the request's actual Content-Type
// has to stay octet-stream regardless of what kind of image it is. This
// needs no multipart-parsing dependency at all.
//
// The admin UI's cropper (admin/admin.js) exports at the crop's own native
// resolution — capped, but not force-shrunk to some small thumbnail size —
// so this passthrough upload has to tolerate genuinely large photos, not
// just tiny ones. MAX_BYTES is set close to Vercel's hard 4.5MB function
// body ceiling (infrastructure-level, not configurable) rather than an
// arbitrary smaller number. If that ever proves too tight in practice, the
// real fix is @vercel/blob's client-direct-upload flow, which bypasses the
// function body entirely — not raising this number further, since it can't
// go past 4.5MB regardless.
import { put } from "@vercel/blob";
import { requireAuth } from "../_lib/require-auth.js";

const MAX_BYTES = 4.4 * 1024 * 1024; // headroom under Vercel's hard 4.5MB body ceiling

export default async function handler(request, response) {
  const session = await requireAuth(request, response);
  if (!session) return;

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = request.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    response.status(400).json({ error: "No file body received" });
    return;
  }
  if (body.length > MAX_BYTES) {
    response.status(413).json({ error: "File too large (max 4.4MB) — try zooming in a bit more in the cropper, which shrinks the exported area" });
    return;
  }

  const filename = (request.headers["x-filename"] || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");

  try {
    const blob = await put(`team/${Date.now()}-${filename}`, body, {
      access: "public",
      contentType: request.headers["x-content-type"] || "application/octet-stream",
    });
    response.status(200).json({ url: blob.url });
  } catch (err) {
    console.error("api/admin/upload failed:", err);
    response.status(500).json({ error: "Upload failed" });
  }
}
