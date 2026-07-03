ALTER TABLE items ADD COLUMN household_id TEXT;
ALTER TABLE notification_recipients ADD COLUMN household_id TEXT;
ALTER TABLE notification_log ADD COLUMN household_id TEXT;
ALTER TABLE item_history ADD COLUMN household_id TEXT;
ALTER TABLE item_history ADD COLUMN actor_email TEXT;
ALTER TABLE notification_settings ADD COLUMN household_id TEXT;
ALTER TABLE app_config ADD COLUMN household_id TEXT;
