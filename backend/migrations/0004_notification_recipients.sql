CREATE TABLE notification_recipients (
  id          TEXT PRIMARY KEY,
  channel     TEXT NOT NULL,
  identifier  TEXT NOT NULL,
  label       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel, identifier)
);

CREATE INDEX idx_notification_recipients_channel ON notification_recipients(channel);

ALTER TABLE notification_settings DROP COLUMN config_json;

ALTER TABLE notification_log ADD COLUMN recipient_identifier TEXT;
