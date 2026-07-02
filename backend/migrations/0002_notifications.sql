CREATE TABLE notification_settings (
  channel         TEXT PRIMARY KEY,
  is_enabled      INTEGER NOT NULL DEFAULT 0,
  config_json     TEXT NOT NULL DEFAULT '{}',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notification_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL,
  error_message   TEXT,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notification_log_item_id ON notification_log(item_id);
CREATE INDEX idx_notification_log_sent_at ON notification_log(sent_at);
