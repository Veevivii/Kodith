-- NOTE: scripts/migrate.mjs splits this file at every semicolon character, so
-- never put one inside a comment here (it would cut a statement in half).
-- Kodith database schema.
-- Apply with: npm run db:migrate  (uses DATABASE_URL_UNPOOLED — DDL should
-- not run through the pooled connection).

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Field names mirror site-data.js exactly, so the seed script and the public
-- /api/data endpoint don't need to translate between two schemas.
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  time        TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL DEFAULT '',
  format      TEXT NOT NULL DEFAULT '',
  place       TEXT NOT NULL DEFAULT '',
  blurb       TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_date_idx ON events (date);

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  blurb       TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Live',
  link        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Card-holding community members. Distinct from `team_members` below, which
-- is the small core team shown on the public site — these are everyone
-- issued a member e-card, and this table is only ever read by the admin
-- Cards page and the public /id/<hexId> verification page.
--
-- hex_id is derived from the member's details plus a server-side secret
-- (see api/_lib/card-id.js) and is UNIQUE: it is the card's identity, so a
-- collision must fail loudly rather than quietly issue a duplicate card.
-- mint_number is the sequential "#N member" badge and is likewise UNIQUE.
CREATE TABLE IF NOT EXISTS members (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  hex_id       TEXT NOT NULL UNIQUE,
  mint_number  INTEGER NOT NULL UNIQUE,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_hex_id_idx ON members (hex_id);

-- Email is the key the CSV import matches on: a row whose email already
-- exists is updated rather than inserted again, which is what stops an
-- import creating duplicate people. Indexed on lower(email) so a change of
-- capitalisation can't slip a second card past that check, while the
-- address itself is still stored exactly as the source file wrote it.
CREATE UNIQUE INDEX IF NOT EXISTS members_email_lower_idx ON members (lower(email));

-- "team" is a reserved-enough word to cause confusion against the frontend's
-- `team` key in the /api/data response — table is team_members, JSON key stays `team`.
CREATE TABLE IF NOT EXISTS team_members (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  photo       TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chief Campus Executive applications, submitted through the public form at
-- /cce and reviewed at /admin/cce. Holds applicants' personal details, so it
-- is only ever read through the session-gated admin API. The public endpoint
-- can insert but never list.
CREATE TABLE IF NOT EXISTS cce_applications (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  college      TEXT NOT NULL,
  course_year  TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  linkedin     TEXT NOT NULL DEFAULT '',
  about        TEXT NOT NULL,
  motivation   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlisted', 'contacted', 'accepted', 'rejected')),
  notes        TEXT NOT NULL DEFAULT '',
  -- salted hash of the submitter's IP, used only to rate-limit the public
  -- form. The raw address is never stored
  ip_hash      TEXT NOT NULL DEFAULT '',
  -- why the email alert for this application didn't go out, or empty if it did
  notify_error TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- notify_error arrived after the table was first created, so databases made
-- before then get it here (a no-op everywhere else)
ALTER TABLE cce_applications ADD COLUMN IF NOT EXISTS notify_error TEXT NOT NULL DEFAULT '';
-- 'accepted' was added to the statuses later, so the allowed list is rebuilt
-- here for databases made before then (it ends up identical everywhere)
ALTER TABLE cce_applications DROP CONSTRAINT IF EXISTS cce_applications_status_check;
ALTER TABLE cce_applications ADD CONSTRAINT cce_applications_status_check
  CHECK (status IN ('new', 'shortlisted', 'contacted', 'accepted', 'rejected'));
-- One application per person, and capitalisation can't sneak a second one in.
CREATE UNIQUE INDEX IF NOT EXISTS cce_applications_email_lower_idx ON cce_applications (lower(email));
CREATE INDEX IF NOT EXISTS cce_applications_created_idx ON cce_applications (created_at DESC);
