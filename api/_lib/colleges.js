// College matching for the CCE college picker. One normaliser shared by the
// importer (scripts/import-colleges.mjs builds each row's `search` text) and
// the search endpoint (GET /api/cce?q=), so a query and a row are always
// reduced the same way.
//
// AISHE names often carry an address after the first comma ("Shri G. S.
// Institute of Technology & Science, 23, Park Road, Indore"), so short forms
// are built from the part before it: "sgsits". Dotted initials split into
// letters ("G.S.I.T.S." -> g s i t s), which gives them the same acronym.

const STOP = new Set(["of", "and", "the", "for", "in", "at", "on", "to", "by", "a", "an"]);

/** lowercase ASCII words: accents dropped, & -> and, anything else becomes a space */
export function normalize(s) {
  return String(s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const VISHWAVIDYALAYA = /^vi(s|sh)(w|v)a?vid(h)?yalaya$/;   // written as one word, said as two: "DAVV"

function headWords(name) {
  return normalize(String(name || "").split(",")[0]).split(" ").filter((w) => w && !STOP.has(w) && !/^\d/.test(w));
}
/** initials of the institution's own name (before the first comma), skipping small words and numbers */
export function acronymOf(name) {
  return headWords(name).map((w) => w[0]).join("");
}
/** the acronym plus the "vv" spelling for a Vishwavidyalaya: Devi Ahilya Vishwavidyalaya is "dav" and "davv" */
export function acronymsOf(name) {
  const words = headWords(name), a = words.map((w) => w[0]).join("");
  const b = words.map((w) => (VISHWAVIDYALAYA.test(w) ? "vv" : w[0])).join("");
  return a === b ? [a] : [a, b];
}

/** what a row is matched against: its words, the same with no spaces ("medicaps"), its acronym and its district */
export function searchTextOf({ name, district }) {
  const words = normalize(name);
  const headSquashed = normalize(String(name || "").split(",")[0]).replace(/ /g, "");
  return [words, headSquashed, ...acronymsOf(name), normalize(district)].filter(Boolean).join(" ");
}

export function queryTokens(q) {
  return normalize(q).split(" ").filter(Boolean).slice(0, 6);
}

/**
 * Up to 8 colleges for a typed query. Every word typed must appear in the
 * row's search text, so "iit indore" and "devi ahilya" narrow quickly. The
 * longest word goes in as a plain LIKE, which the trigram index can serve.
 * Ranked: exact acronym, acronym prefix, closeness, then universities, then
 * Madhya Pradesh (Kodith is in Indore, so a tie goes to the nearer college),
 * then the shorter name.
 * Nothing found (usually a typo) falls back to trigram word similarity.
 */
export async function searchColleges(sql, q) {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  const phrase = tokens.join(" "), squashed = tokens.join("");
  const rows = await sql`
    SELECT id, name, district, state, kind FROM colleges
    WHERE search LIKE ${"%" + longest + "%"}
      AND (SELECT bool_and(search LIKE '%' || t || '%') FROM unnest(${tokens}::text[]) AS t)
    ORDER BY (acronym = ${squashed}) DESC, (acronym LIKE ${squashed + "%"}) DESC,
             word_similarity(${phrase}, search) DESC, (kind = 'university') DESC,
             (state = 'Madhya Pradesh') DESC, length(name), name
    LIMIT 8
  `;
  if (rows.length || phrase.length < 4) return rows;
  return sql`
    SELECT id, name, district, state, kind FROM colleges
    WHERE ${phrase} <% search
    ORDER BY word_similarity(${phrase}, search) DESC, (state = 'Madhya Pradesh') DESC, length(name)
    LIMIT 8
  `;
}
