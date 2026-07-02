import { NOTIFICATION_CHANNELS } from "@maintenance-reminder/shared";
import type {
  NotificationChannel,
  NotificationLogEntry,
  NotificationRecipient,
  NotificationSetting,
} from "@maintenance-reminder/shared";

interface NotificationSettingRow {
  channel: string;
  is_enabled: number;
}

interface NotificationRecipientRow {
  id: string;
  channel: string;
  identifier: string;
  label: string | null;
  created_at: string;
}

function rowToRecipient(row: NotificationRecipientRow): NotificationRecipient {
  return {
    id: row.id,
    channel: row.channel as NotificationChannel,
    identifier: row.identifier,
    label: row.label,
    createdAt: row.created_at,
  };
}

export async function listNotificationSettings(db: D1Database): Promise<NotificationSetting[]> {
  const { results } = await db.prepare("SELECT * FROM notification_settings").all<NotificationSettingRow>();
  const byChannel = new Map(results.map((row) => [row.channel, row]));
  return NOTIFICATION_CHANNELS.map((channel) => ({
    channel,
    isEnabled: byChannel.get(channel)?.is_enabled === 1,
  }));
}

export async function setNotificationEnabled(
  db: D1Database,
  channel: NotificationChannel,
  isEnabled: boolean,
): Promise<NotificationSetting> {
  await db
    .prepare(
      `INSERT INTO notification_settings (channel, is_enabled, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(channel) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = excluded.updated_at`,
    )
    .bind(channel, isEnabled ? 1 : 0, new Date().toISOString())
    .run();
  return { channel, isEnabled };
}

export async function listRecipients(db: D1Database, channel: NotificationChannel): Promise<NotificationRecipient[]> {
  const { results } = await db
    .prepare("SELECT * FROM notification_recipients WHERE channel = ? ORDER BY created_at ASC")
    .bind(channel)
    .all<NotificationRecipientRow>();
  return results.map(rowToRecipient);
}

export async function addRecipient(
  db: D1Database,
  channel: NotificationChannel,
  identifier: string,
  label: string | null,
): Promise<NotificationRecipient> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO notification_recipients (id, channel, identifier, label)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel, identifier) DO UPDATE SET label = excluded.label`,
    )
    .bind(id, channel, identifier, label)
    .run();
  const row = await db
    .prepare("SELECT * FROM notification_recipients WHERE channel = ? AND identifier = ?")
    .bind(channel, identifier)
    .first<NotificationRecipientRow>();
  if (!row) throw new Error("Failed to add recipient");
  return rowToRecipient(row);
}

export async function removeRecipient(db: D1Database, channel: NotificationChannel, id: string): Promise<void> {
  await db.prepare("DELETE FROM notification_recipients WHERE channel = ? AND id = ?").bind(channel, id).run();
}

export async function getRecipient(
  db: D1Database,
  channel: NotificationChannel,
  id: string,
): Promise<NotificationRecipient | null> {
  const row = await db
    .prepare("SELECT * FROM notification_recipients WHERE channel = ? AND id = ?")
    .bind(channel, id)
    .first<NotificationRecipientRow>();
  return row ? rowToRecipient(row) : null;
}

export interface RecordNotificationLogParams {
  itemId: string;
  channel: NotificationChannel;
  recipientIdentifier: string;
  status: "success" | "failed";
  errorMessage?: string | null;
}

export async function recordNotificationLog(db: D1Database, params: RecordNotificationLogParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notification_log (item_id, channel, recipient_identifier, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.itemId,
      params.channel,
      params.recipientIdentifier,
      params.status,
      params.errorMessage ?? null,
      new Date().toISOString(),
    )
    .run();
}

interface NotificationLogRow {
  id: number;
  item_id: string;
  item_name: string | null;
  channel: string;
  recipient_identifier: string;
  recipient_label: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
}

export async function listNotificationLog(db: D1Database, limit: number): Promise<NotificationLogEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT
         nl.id, nl.item_id, i.name AS item_name, nl.channel, nl.recipient_identifier,
         nr.label AS recipient_label, nl.status, nl.error_message, nl.sent_at
       FROM notification_log nl
       LEFT JOIN items i ON i.id = nl.item_id
       LEFT JOIN notification_recipients nr ON nr.channel = nl.channel AND nr.identifier = nl.recipient_identifier
       ORDER BY nl.sent_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<NotificationLogRow>();

  return results.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    channel: row.channel as NotificationChannel,
    recipientIdentifier: row.recipient_identifier,
    recipientLabel: row.recipient_label,
    status: row.status as "success" | "failed",
    errorMessage: row.error_message,
    sentAt: row.sent_at,
  }));
}

export async function hasSuccessfulNotificationSince(
  db: D1Database,
  itemId: string,
  channel: NotificationChannel,
  recipientIdentifier: string,
  sinceIso: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM notification_log
       WHERE item_id = ? AND channel = ? AND recipient_identifier = ? AND status = 'success' AND sent_at >= ?
       LIMIT 1`,
    )
    .bind(itemId, channel, recipientIdentifier, sinceIso)
    .first();
  return row !== null;
}
