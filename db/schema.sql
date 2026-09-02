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
