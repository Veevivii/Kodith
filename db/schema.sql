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
