import { NOTIFICATION_CHANNELS } from "@maintenance-reminder/shared";
import type { NotificationChannel, NotificationSetting } from "@maintenance-reminder/shared";

interface NotificationSettingRow {
  channel: string;
  is_enabled: number;
  config_json: string;
  updated_at: string;
}

function rowToSetting(channel: NotificationChannel, row: NotificationSettingRow | null): NotificationSetting {
  return {
    channel,
    isEnabled: row ? row.is_enabled === 1 : false,
    config: row ? (JSON.parse(row.config_json) as Record<string, string>) : {},
  };
}

export async function listNotificationSettings(db: D1Database): Promise<NotificationSetting[]> {
  const { results } = await db.prepare("SELECT * FROM notification_settings").all<NotificationSettingRow>();
  const byChannel = new Map(results.map((row) => [row.channel, row]));
  return NOTIFICATION_CHANNELS.map((channel) => rowToSetting(channel, byChannel.get(channel) ?? null));
}

export async function getNotificationSetting(db: D1Database, channel: NotificationChannel): Promise<NotificationSetting> {
  const row = await db
    .prepare("SELECT * FROM notification_settings WHERE channel = ?")
    .bind(channel)
    .first<NotificationSettingRow>();
  return rowToSetting(channel, row);
}

export async function upsertNotificationSetting(
  db: D1Database,
  channel: NotificationChannel,
  isEnabled: boolean,
  config: Record<string, string>,
): Promise<NotificationSetting> {
  await db
    .prepare(
      `INSERT INTO notification_settings (channel, is_enabled, config_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel) DO UPDATE SET is_enabled = excluded.is_enabled, config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    .bind(channel, isEnabled ? 1 : 0, JSON.stringify(config), new Date().toISOString())
    .run();
  return getNotificationSetting(db, channel);
}

export interface RecordNotificationLogParams {
  itemId: string;
  channel: NotificationChannel;
  status: "success" | "failed";
  errorMessage?: string | null;
}

export async function recordNotificationLog(db: D1Database, params: RecordNotificationLogParams): Promise<void> {
  await db
    .prepare(
      "INSERT INTO notification_log (item_id, channel, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(params.itemId, params.channel, params.status, params.errorMessage ?? null, new Date().toISOString())
    .run();
}

export async function hasSuccessfulNotificationSince(
  db: D1Database,
  itemId: string,
  channel: NotificationChannel,
  sinceIso: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT id FROM notification_log WHERE item_id = ? AND channel = ? AND status = 'success' AND sent_at >= ? LIMIT 1",
    )
    .bind(itemId, channel, sinceIso)
    .first();
  return row !== null;
}
