// Member card ID helpers. Prefixed with `_` so Vercel does not route this
// file as its own function.
//
// Note there is deliberately no ID *generation* here any more. hex_id and
// mint_number are minted by the offline card-image script, which is the
// single source of truth for them; the site only ever imports or displays
// what that script produced. Re-deriving an ID here would risk the site and
// the printed cards disagreeing about who someone is.

/** Normalises a hex ID from a URL for lookup — IDs are stored uppercase. */
export function normalizeHexId(value) {
  return String(value || "").trim().toUpperCase();
}
