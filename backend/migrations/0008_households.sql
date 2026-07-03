CREATE TABLE households (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE household_members (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_household_members_household_id ON household_members(household_id);

CREATE TABLE household_invites (
  code          TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'line',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  used_at       TEXT,
  expires_at    TEXT
);

CREATE INDEX idx_household_invites_household_id ON household_invites(household_id);
