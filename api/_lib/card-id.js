// Member card ID generation. Prefixed with `_` so Vercel does not route this
// file as its own function.
import crypto from "node:crypto";

/**
 * hex_id = sha256(name + email + secret salt), first 8 hex chars, uppercased.
 *
 * The salt is what stops the ID being computable by anyone who knows a
 * member's name and email — without it these would be trivially forgeable,
 * so a missing CARD_ID_SALT is a hard failure rather than a silent fallback
 * to an empty/weak salt.
 *
 * Note this is deliberately deterministic: the same person always maps to
 * the same ID, so re-adding someone collides on the UNIQUE constraint
 * instead of quietly minting them a second card.
 *
 * Inputs are trimmed — a stray trailing space in an admin form field
 * shouldn't silently produce a different card ID for the same person.
 */
export function generateHexId(name, email) {
  const salt = process.env.CARD_ID_SALT;
  if (!salt) {
    throw new Error("CARD_ID_SALT is not set");
  }
  const input = String(name || "").trim() + String(email || "").trim() + salt;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex").slice(0, 8).toUpperCase();
}

/** Normalises a hex ID from a URL for lookup — IDs are stored uppercase. */
export function normalizeHexId(value) {
  return String(value || "").trim().toUpperCase();
}
