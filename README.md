# Kodith — community site

A single-page site: plain HTML, CSS and JavaScript on the frontend, no
framework, no build step for the page itself. `index.html` works standalone.

Content — the Upcoming/Projects/Team sections — is normally edited through
**the admin dashboard** at `/admin`, backed by a small Postgres database and a
handful of Vercel serverless functions (see **Admin dashboard**, below). If
that backend is ever unreachable — a plain static preview, an outage — the
site falls back to the bundled `site-data.js` automatically, so it never goes
blank.

```
index.html            the page itself
site-data.js          offline/dev fallback data — see "Admin dashboard" for the real source of truth
css/styles.css        all styling
js/hero-boot.js       picks the right hero (video / lighter video / still frame)
js/main.js            renders the data sections, nav, FAQ, scroll reveals, the mascot
assets/video/         the light-leak hero loop (desktop + mobile encodes)
assets/img/           hero poster frames, and team photos if you add them
assets/fonts/         self-hosted type — see "Fonts", below
tools/                contrast checker (developers only, see below)

admin/                the dashboard UI (login + CRUD for events/projects/team)
api/                  Vercel serverless functions: public data feed, auth, admin CRUD
db/schema.sql         the Postgres schema
scripts/              one-off setup scripts (migrate, seed content, seed an admin login)
```

---

## Editing content

**Day to day, use the admin dashboard at `/admin`.** Log in, and you can add,
edit, or remove:

| Section      | What it is                         |
| ------------ | ---------------------------------- |
| **Upcoming** | the next 2–3 workshops or meetups  |
| **Projects** | things members have built          |
| **Team**     | the core team grid, including photo upload |

Changes save straight to the database and show up on the live site on the
next page load — no file to edit, no deploy to trigger.

`site-data.js` still exists as the fallback data source (used only when the
`/api/data` backend is unreachable) and as the one-time seed for the database
the first time it's set up. That file is heavily commented and explains the
format of every field, in case you ever need to edit it directly.

Two things worth knowing:

- **Event dates must be written `YYYY-MM-DD`** (e.g. `2026-09-06`). That's what
  the sorting relies on.
- **Past events disappear on their own**, the day after they happen. You can
  leave an old one in the list for a while without it showing up on the site.

### Team photos

Upload them straight through the admin dashboard's file picker on each team
member — square, around 400×400 works best. It uploads to Vercel Blob and
fills in the `photo` field for you.

Leave a member's photo empty and their initials are shown instead, which
looks fine — an empty slot beats a stretched photo.

---

## Placeholders to replace

Copy that still needs real values is written in `[SQUARE BRACKETS]` so you can
find and replace it.

**Still outstanding:**

| Placeholder | Where                  | Count |
| ----------- | ---------------------- | ----- |
| `[EMAIL]`   | footer, `mailto:` link | 1     |

Until it's filled in, that footer link points at `mailto:[EMAIL]` and will not
work if clicked. Either drop in a real address or delete the `<li>` on line 309
of `index.html`.

`site-data.js` also ships `[NAME]` and `[PROJECT NAME]` in its sample rows —
replace those as you fill the lists in. Anything left in brackets there is
handled gracefully: placeholder names and locations are skipped rather than
rendered as broken links.

**Already filled in:** tagline (*Just Kode it.*), founding year (2026),
Discord (`discord.gg/SwP45GdKm5`, 3 links) and Instagram
(`instagram.com/kodith.io`, 3 links).

---

## Running it locally

Opening `index.html` directly works. To serve it over HTTP instead (closer to
production, and video seeking behaves better):

```bash
python -m http.server 5173
```

Then visit `http://localhost:5173`.

---

## The hero video

The hero plays `assets/video/light-leaks.mp4` — a 18.5-second loop cut from the
source footage, colour-graded warm to match the palette, and crossfaded end-to-
start so it loops without a visible jump.

Three variants are served depending on the visitor:

| Visitor                                       | Gets                          |
| --------------------------------------------- | ----------------------------- |
| Desktop                                       | `light-leaks.mp4` (3.2 MB)    |
| Viewport ≤ 768px                              | `light-leaks-mobile.mp4` (0.5 MB) |
| Data Saver, 2G, or *reduce motion* preference | a still frame, no video       |

If the video files are missing entirely, the hero falls back to a static
gradient and the layout still works.

### Replacing the footage

Re-encode with ffmpeg. The command that produced the current files, for a 20s
window starting at 2m19s of the source:

```bash
ffmpeg -i source.mp4 -filter_complex "[0:v]trim=start=139:end=159,setpts=PTS-STARTPTS,colortemperature=temperature=4200,colorbalance=rs=0.05:rm=0.10:bh=-0.08,eq=saturation=1.12[s];[s]split[a][b];[a]trim=start=0:end=18.5,setpts=PTS-STARTPTS[body];[b]trim=start=18.5:end=20,setpts=PTS-STARTPTS[tail];[tail][body]xfade=transition=fade:duration=1.5:offset=0[v]" -map "[v]" -an -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 25 -g 50 -movflags +faststart -y assets/video/light-leaks.mp4
```

Then regenerate the mobile encode and the poster frames:

```bash
ffmpeg -i assets/video/light-leaks.mp4 -vf scale=960:540,fps=20 -an -c:v libx264 -preset slow -crf 30 -movflags +faststart -y assets/video/light-leaks-mobile.mp4
```

```bash
ffmpeg -i assets/video/light-leaks.mp4 -frames:v 1 -q:v 4 -y assets/img/hero-poster.jpg
```

**If you swap the footage, re-run the contrast check below.** Brighter footage
can push the hero text under the accessibility minimum.

---

## Contrast check (developers)

Hero text sits over moving video, so checking the scrim colour on its own
proves nothing. `tools/contrast-check.js` samples real frames of the encoded
loop, composites the scrim over each pixel exactly as the CSS does, and reports
the worst contrast ratio anywhere text actually sits.

```bash
node tools/contrast-check.js
```

It exits non-zero if any region drops below WCAG AA (4.5:1 for text). Current
worst case is 5.6:1, against the brightest frame in the loop.

If you change `.hero__scrim` in `css/styles.css`, mirror the change in the
`SCRIM` block at the top of that script — it can only check what it knows about.

---

## Admin dashboard

The site's content is backed by a small Postgres database and a handful of
Vercel serverless functions under `/api`. This is the project's only backend
and its only build dependency — everything else is still plain static files.

### One-time setup

A few steps need doing through Vercel's dashboard directly (account creation
and clicking through integrations isn't something to script):

1. Create a Vercel project pointing at this folder (via the CLI's `vercel
   link`, or by connecting a git repo in Vercel's dashboard).
2. In that project: **Storage → Browse Marketplace → Neon** — provisions the
   Postgres database and injects `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
3. In the same dashboard: enable **Vercel Blob** — injects
   `BLOB_READ_WRITE_TOKEN` (used for team photo uploads).
4. Set one more environment variable yourself: `SESSION_SECRET`, a random
   32+ character string (`openssl rand -base64 32`).

Then, from a machine with those env vars available locally (`vercel env pull
.env.local` after `vercel link`, or copy `.env.example` to `.env.local` and
fill it in by hand):

```bash
npm install
npm run db:migrate         # applies db/schema.sql
npm run db:seed-content    # imports the current site-data.js into the database, once
```

`db:seed-content` refuses to run a second time if the tables already have
rows, so it's safe to leave in your history — it's a one-time import, not a
sync.

### Adding a teammate's login

There's no signup form on purpose — admin accounts are created by running a
script locally, once per person:

```bash
SEED_ADMIN_PASSWORD="their password" node scripts/seed-admin.mjs "name@example.com" "Their Name"
```

They can then log in at `/admin`.

### Local development

`vercel dev` serves the static site **and** runs the `/api` functions
locally, against your real (or a branched) Neon database — this is the full
dev workflow once the backend exists:

```bash
npm run dev
```

Plain `python -m http.server` (or any static server) still works for
front-end/content tweaks — the page just falls back to `site-data.js` since
there's no `/api` to answer it, and the `/admin` dashboard won't have
anything to log into.

---

## Fonts

All three typefaces are self-hosted in `assets/fonts/` (not loaded from Google
Fonts) so the page renders correctly with no network at all — including a
plain local preview with the internet off. Each is a single variable-font
`.woff2` file covering every weight the site uses, declared with a
`font-weight: <min> <max>` range in the `00 FONTS` block at the top of
`css/styles.css`. Only the `latin` subset was pulled.

To update a weight or add a new one, fetch Google's CSS2 response with a
modern browser `User-Agent` (required to get `.woff2` URLs back) and pull the
`latin`-subset file it points to:

```bash
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;700&display=swap"
```

That returns several `@font-face` blocks per family (one per Unicode
subset — cyrillic, greek, vietnamese, latin, etc.); take the `url()` from the
block whose `unicode-range` includes `U+0000-00FF` (that's `latin`), download
it into `assets/fonts/`, and point the matching `@font-face` rule in
`css/styles.css` at it.

---

## Mascot

A small pixel-grid rabbit-with-a-cap, in the same construction as the
sparkle accents (inline SVG, coloured via the design tokens rather than
hard-coded hex, so it stays in sync if the palette ever changes). It appears
in three places:

- beside the "Join Kodith" button in the hero (`index.html`)
- beside the Discord/Instagram buttons in the Join section (`index.html`)
- next to the "nothing on the calendar" message when Upcoming is empty
  (generated by `renderEvents()` in `js/main.js`, since that spot is
  conditional)

All three are the same markup, kept in sync by hand — if you ever redesign
the character, update the `MASCOT_SVG` constant in `js/main.js` first (it has
the clearest comments on the pixel grid), then copy the same `<svg>...</svg>`
into the two spots in `index.html`.

The only motion it has is a slow blink (`.mascot__eye`, `css/styles.css`),
which respects `prefers-reduced-motion` like everything else on the page.

---

## Notes on the build

- **Fonts** — three families, no more: *Pixelify Sans* for the wordmark,
  section labels and badges only; the system UI stack (real San Francisco on
  Apple devices, *Inter* elsewhere) for everything you actually read;
  *JetBrains Mono* for dates, stats and other literal data.
- **Motion** respects `prefers-reduced-motion: reduce` throughout — no video,
  no reveals, everything renders in its final state.
- **Without JavaScript** the page still renders completely; only the three
  data-driven sections are empty.
- **Backend** — the only part of this project that isn't a static file:
  `/api`'s serverless functions, a Postgres database, and Vercel Blob for
  photo uploads. The public page degrades gracefully without it (see
  **Admin dashboard** above); the `/admin` dashboard obviously needs it.
- **Accessibility** — semantic landmarks, keyboard-operable FAQ and menu,
  visible focus rings, and the contrast floor above.
