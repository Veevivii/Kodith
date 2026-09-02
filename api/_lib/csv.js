// CSV parsing for the member import. Prefixed with `_` so Vercel does not
// route this file as its own function.

/**
 * RFC 4180 CSV parser, returning an array of string arrays.
 *
 * Written by hand rather than pulled in as a dependency because the format
 * is small and the failure modes matter: a naive `split(",")` would corrupt
 * any member whose name contains a comma, silently shifting every later
 * column in that row — an email into hex_id, a hex_id into mint_number.
 * Handles quoted fields, escaped quotes (""), commas and newlines inside
 * quotes, and both CRLF and LF line endings.
 *
 * A UTF-8 BOM is stripped: Excel writes one when saving as CSV, and left in
 * place it would attach itself to the first header name, so "name" would not
 * match the "name" column and every import from Excel would be rejected.
 */
export function parseCsv(text) {
  let s = String(text == null ? "" : text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }

    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i += 1; // CRLF counts as one break
      row.push(field); rows.push(row);
      row = []; field = ""; i += 1; continue;
    }

    field += c; i += 1;
  }

  row.push(field);
  rows.push(row);

  // A file ending in a newline leaves a trailing [""] row; blank lines
  // anywhere are equally meaningless. Drop them rather than reporting them
  // to the admin as empty-name errors.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
