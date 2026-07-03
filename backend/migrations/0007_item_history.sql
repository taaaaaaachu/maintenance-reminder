CREATE TABLE item_history (
  id                  TEXT PRIMARY KEY,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (event_type IN ('complete', 'snooze')),
  occurred_at         TEXT NOT NULL,
  completed_date      TEXT,
  snooze_days         INTEGER,
  interval_days       INTEGER NOT NULL,
  next_due_at_before  TEXT NOT NULL,
  next_due_at_after   TEXT NOT NULL
);

CREATE INDEX idx_item_history_item_id ON item_history(item_id, occurred_at DESC);
CREATE INDEX idx_item_history_event_type ON item_history(event_type, occurred_at);
