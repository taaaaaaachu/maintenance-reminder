CREATE TABLE items (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT,
  interval_days   INTEGER NOT NULL,
  last_done_at    TEXT,
  next_due_at     TEXT NOT NULL,
  memo            TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_items_next_due_at ON items(next_due_at);
CREATE INDEX idx_items_is_active ON items(is_active);
