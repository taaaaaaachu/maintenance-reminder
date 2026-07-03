-- 1. 自分の世帯を作成
INSERT INTO households (id, name) VALUES ('household-home', '自宅');

-- 2. 自分のメールアドレスを紐付け
INSERT INTO household_members (id, household_id, email)
VALUES ('member-home-owner', 'household-home', 'owner@example.com');

-- 3. 既存データへバックフィル
UPDATE items SET household_id = 'household-home';
UPDATE notification_recipients SET household_id = 'household-home';
UPDATE notification_log SET household_id = 'household-home';
UPDATE item_history SET household_id = 'household-home';
UPDATE notification_settings SET household_id = 'household-home';
UPDATE app_config SET household_id = 'household-home';

-- 4. items 再作成(household_id を NOT NULL 化)
CREATE TABLE items_new (
  id                  TEXT PRIMARY KEY,
  household_id        TEXT NOT NULL,
  name                TEXT NOT NULL,
  category            TEXT,
  interval_days       INTEGER NOT NULL,
  notify_days_before  INTEGER NOT NULL DEFAULT 0,
  notify_time         TEXT NOT NULL DEFAULT '07:00',
  last_done_at        TEXT,
  next_due_at         TEXT NOT NULL,
  memo                TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES households(id)
);
INSERT INTO items_new (id, household_id, name, category, interval_days, notify_days_before, notify_time, last_done_at, next_due_at, memo, is_active, created_at, updated_at)
  SELECT id, household_id, name, category, interval_days, notify_days_before, notify_time, last_done_at, next_due_at, memo, is_active, created_at, updated_at FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
CREATE INDEX idx_items_household_next_due_at ON items(household_id, next_due_at);
CREATE INDEX idx_items_household_is_active ON items(household_id, is_active);

-- 5. notification_recipients 再作成(UNIQUEをhousehold_id込みに変更)
CREATE TABLE notification_recipients_new (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL,
  channel       TEXT NOT NULL,
  identifier    TEXT NOT NULL,
  label         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES households(id),
  UNIQUE(household_id, channel, identifier)
);
INSERT INTO notification_recipients_new (id, household_id, channel, identifier, label, created_at)
  SELECT id, household_id, channel, identifier, label, created_at FROM notification_recipients;
DROP TABLE notification_recipients;
ALTER TABLE notification_recipients_new RENAME TO notification_recipients;
CREATE INDEX idx_notification_recipients_household_channel ON notification_recipients(household_id, channel);

-- 6. notification_log 再作成
CREATE TABLE notification_log_new (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id          TEXT NOT NULL,
  item_id               TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL,
  recipient_identifier  TEXT,
  status                TEXT NOT NULL,
  error_message         TEXT,
  sent_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES households(id)
);
INSERT INTO notification_log_new (id, household_id, item_id, channel, recipient_identifier, status, error_message, sent_at)
  SELECT id, household_id, item_id, channel, recipient_identifier, status, error_message, sent_at FROM notification_log;
DROP TABLE notification_log;
ALTER TABLE notification_log_new RENAME TO notification_log;
CREATE INDEX idx_notification_log_household_item_id ON notification_log(household_id, item_id);
CREATE INDEX idx_notification_log_household_sent_at ON notification_log(household_id, sent_at);

-- 7. item_history 再作成(actor_email も引き継ぐ)
CREATE TABLE item_history_new (
  id                  TEXT PRIMARY KEY,
  household_id        TEXT NOT NULL,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (event_type IN ('complete', 'snooze')),
  occurred_at         TEXT NOT NULL,
  completed_date      TEXT,
  snooze_days         INTEGER,
  interval_days       INTEGER NOT NULL,
  next_due_at_before  TEXT NOT NULL,
  next_due_at_after   TEXT NOT NULL,
  actor_email         TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id)
);
INSERT INTO item_history_new (id, household_id, item_id, event_type, occurred_at, completed_date, snooze_days, interval_days, next_due_at_before, next_due_at_after, actor_email)
  SELECT id, household_id, item_id, event_type, occurred_at, completed_date, snooze_days, interval_days, next_due_at_before, next_due_at_after, actor_email FROM item_history;
DROP TABLE item_history;
ALTER TABLE item_history_new RENAME TO item_history;
CREATE INDEX idx_item_history_household_item_id ON item_history(household_id, item_id, occurred_at DESC);
CREATE INDEX idx_item_history_household_event_type ON item_history(household_id, event_type, occurred_at);

-- 8. notification_settings 再作成(PKを household_id, channel の複合キーに変更)
CREATE TABLE notification_settings_new (
  household_id  TEXT NOT NULL,
  channel       TEXT NOT NULL,
  is_enabled    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, channel),
  FOREIGN KEY (household_id) REFERENCES households(id)
);
INSERT INTO notification_settings_new (household_id, channel, is_enabled, updated_at)
  SELECT household_id, channel, is_enabled, updated_at FROM notification_settings;
DROP TABLE notification_settings;
ALTER TABLE notification_settings_new RENAME TO notification_settings;

-- 9. app_config 再作成(PKを household_id, key の複合キーに変更)
CREATE TABLE app_config_new (
  household_id  TEXT NOT NULL,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  PRIMARY KEY (household_id, key),
  FOREIGN KEY (household_id) REFERENCES households(id)
);
INSERT INTO app_config_new (household_id, key, value)
  SELECT household_id, key, value FROM app_config;
DROP TABLE app_config;
ALTER TABLE app_config_new RENAME TO app_config;
