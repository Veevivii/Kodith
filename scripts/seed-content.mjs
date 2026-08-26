// One-time import of the current site-data.js content into the database.
// Run with: npm run db:seed-content  (after db:migrate)
//
// site-data.js is a browser global script (`const KODITH_DATA = {...}`), not
// a module — it can't be import()'d directly. Running it in a Node `vm`
// sandbox reads back the global it defines without modifying the file at all.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { sql } from "../api/_lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = fs.readFileSync(path.join(__dirname, "..", "site-data.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
// site-data.js declares `const KODITH_DATA = {...}`. A vm context's top-level
// `const`/`let` bindings do NOT become properties of the sandbox object (only
// `var` does) — so KODITH_DATA itself is unreachable from outside afterward.
// Appending an assignment onto `globalThis` (the sandbox's global object,
// still in scope) is what actually exposes it.
vm.runInContext(src + ";globalThis.__KODITH_DATA__ = KODITH_DATA;", sandbox);

const { upcoming, projects, team } = sandbox.__KODITH_DATA__;

const [{ count: existingEvents }] = await sql`SELECT count(*)::int AS count FROM events`;
const [{ count: existingProjects }] = await sql`SELECT count(*)::int AS count FROM projects`;
const [{ count: existingTeam }] = await sql`SELECT count(*)::int AS count FROM team_members`;
if (existingEvents || existingProjects || existingTeam) {
  console.error(
    "Tables already have rows (events: %d, projects: %d, team_members: %d). " +
      "This script is for the one-time initial import only — refusing to run again " +
      "and risk duplicating content. Use the admin dashboard for further edits.",
    existingEvents, existingProjects, existingTeam
  );
  process.exit(1);
}

for (const ev of upcoming) {
  await sql`
    INSERT INTO events (date, time, title, format, place, blurb, link)
    VALUES (${ev.date}, ${ev.time}, ${ev.title}, ${ev.format}, ${ev.place}, ${ev.blurb}, ${ev.link})
  `;
}

for (const [i, p] of projects.entries()) {
  await sql`
    INSERT INTO projects (name, blurb, tag, status, link, sort_order)
    VALUES (${p.name}, ${p.blurb}, ${p.tag}, ${p.status}, ${p.link}, ${i})
  `;
}

for (const [i, m] of team.entries()) {
  await sql`
    INSERT INTO team_members (name, role, photo, link, sort_order)
    VALUES (${m.name}, ${m.role}, ${m.photo}, ${m.link}, ${i})
  `;
}

console.log(
  `Seeded ${upcoming.length} event(s), ${projects.length} project(s), ${team.length} team member(s).`
);
