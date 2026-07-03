import { NOTIFICATION_CHANNELS } from "@maintenance-reminder/shared";
import type {
  NotificationChannel,
  NotificationLogEntry,
  NotificationRecipient,
  NotificationSetting,
  NotificationStatus,
} from "@maintenance-reminder/shared";

interface NotificationSettingRow {
  household_id: string;
  channel: string;
  is_enabled: number;
}

interface NotificationRecipientRow {
  id: string;
  household_id: string;
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

export async function listNotificationSettings(db: D1Database, householdId: string): Promise<NotificationSetting[]> {
  const { results } = await db
    .prepare("SELECT * FROM notification_settings WHERE household_id = ?")
    .bind(householdId)
    .all<NotificationSettingRow>();
  const byChannel = new Map(results.map((row) => [row.channel, row]));
  return NOTIFICATION_CHANNELS.map((channel) => ({
    channel,
    isEnabled: byChannel.get(channel)?.is_enabled === 1,
  }));
}

export async function setNotificationEnabled(
  db: D1Database,
  householdId: string,
  channel: NotificationChannel,
  isEnabled: boolean,
): Promise<NotificationSetting> {
  await db
    .prepare(
      `INSERT INTO notification_settings (household_id, channel, is_enabled, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(household_id, channel) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = excluded.updated_at`,
    )
    .bind(householdId, channel, isEnabled ? 1 : 0, new Date().toISOString())
    .run();
  return { channel, isEnabled };
}

export async function listRecipients(
  db: D1Database,
  householdId: string,
  channel: NotificationChannel,
): Promise<NotificationRecipient[]> {
  const { results } = await db
    .prepare("SELECT * FROM notification_recipients WHERE household_id = ? AND channel = ? ORDER BY created_at ASC")
    .bind(householdId, channel)
    .all<NotificationRecipientRow>();
  return results.map(rowToRecipient);
}

export async function addRecipient(
  db: D1Database,
  householdId: string,
  channel: NotificationChannel,
  identifier: string,
  label: string | null,
): Promise<NotificationRecipient> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO notification_recipients (id, household_id, channel, identifier, label)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(household_id, channel, identifier) DO UPDATE SET label = excluded.label`,
    )
    .bind(id, householdId, channel, identifier, label)
    .run();
  const row = await db
    .prepare("SELECT * FROM notification_recipients WHERE household_id = ? AND channel = ? AND identifier = ?")
    .bind(householdId, channel, identifier)
    .first<NotificationRecipientRow>();
  if (!row) throw new Error("Failed to add recipient");
  return rowToRecipient(row);
}

export async function removeRecipient(
  db: D1Database,
  householdId: string,
  channel: NotificationChannel,
  id: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM notification_recipients WHERE household_id = ? AND channel = ? AND id = ?")
    .bind(householdId, channel, id)
    .run();
}

/**
 * LINEのunfollowイベントにはhousehold情報が含まれないため、household横断でidentifierのみで
 * 削除する。他の全関数と異なりhouseholdId境界を跨ぐ唯一の例外。
 */
export async function removeRecipientByIdentifier(
  db: D1Database,
  channel: NotificationChannel,
  identifier: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM notification_recipients WHERE channel = ? AND identifier = ?")
    .bind(channel, identifier)
    .run();
}

export async function getRecipient(
  db: D1Database,
  householdId: string,
  channel: NotificationChannel,
  id: string,
): Promise<NotificationRecipient | null> {
  const row = await db
    .prepare("SELECT * FROM notification_recipients WHERE household_id = ? AND channel = ? AND id = ?")
    .bind(householdId, channel, id)
    .first<NotificationRecipientRow>();
  return row ? rowToRecipient(row) : null;
}

export interface RecordNotificationLogParams {
  householdId: string;
  itemId: string;
  channel: NotificationChannel;
  recipientIdentifier: string;
  status: NotificationStatus;
  errorMessage?: string | null;
}

export async function recordNotificationLog(db: D1Database, params: RecordNotificationLogParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notification_log (household_id, item_id, channel, recipient_identifier, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.householdId,
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

export async function listNotificationLog(
  db: D1Database,
  householdId: string,
  limit: number,
): Promise<NotificationLogEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT
         nl.id, nl.item_id, i.name AS item_name, nl.channel, nl.recipient_identifier,
         nr.label AS recipient_label, nl.status, nl.error_message, nl.sent_at
       FROM notification_log nl
       LEFT JOIN items i ON i.id = nl.item_id
       LEFT JOIN notification_recipients nr
         ON nr.household_id = nl.household_id AND nr.channel = nl.channel AND nr.identifier = nl.recipient_identifier
       WHERE nl.household_id = ?
       ORDER BY nl.sent_at DESC
       LIMIT ?`,
    )
    .bind(householdId, limit)
    .all<NotificationLogRow>();

  return results.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    channel: row.channel as NotificationChannel,
    recipientIdentifier: row.recipient_identifier,
    recipientLabel: row.recipient_label,
    status: row.status as NotificationStatus,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
  }));
}

export async function hasSuccessfulNotificationSince(
  db: D1Database,
  householdId: string,
  itemId: string,
  channel: NotificationChannel,
  recipientIdentifier: string,
  sinceIso: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM notification_log
       WHERE household_id = ? AND item_id = ? AND channel = ? AND recipient_identifier = ? AND status = 'success' AND sent_at >= ?
       LIMIT 1`,
    )
    .bind(householdId, itemId, channel, recipientIdentifier, sinceIso)
    .first();
  return row !== null;
}

// --- household横断の一括取得(Cronのクエリ数対策) ---

export async function listAllEnabledChannelsByHousehold(db: D1Database): Promise<Map<string, NotificationChannel[]>> {
  const { results } = await db
    .prepare("SELECT household_id, channel FROM notification_settings WHERE is_enabled = 1")
    .all<{ household_id: string; channel: string }>();
  const map = new Map<string, NotificationChannel[]>();
  for (const row of results) {
    const channel = row.channel as NotificationChannel;
    const list = map.get(row.household_id) ?? [];
    list.push(channel);
    map.set(row.household_id, list);
  }
  return map;
}

export async function listAllRecipients(db: D1Database): Promise<Map<string, NotificationRecipient[]>> {
  const { results } = await db.prepare("SELECT * FROM notification_recipients").all<NotificationRecipientRow>();
  const map = new Map<string, NotificationRecipient[]>();
  for (const row of results) {
    const key = `${row.household_id}:${row.channel}`;
    const list = map.get(key) ?? [];
    list.push(rowToRecipient(row));
    map.set(key, list);
  }
  return map;
}

export async function listNotifiedItemIds(
  db: D1Database,
  householdId: string,
  itemIds: string[],
  channel: NotificationChannel,
  recipientIdentifier: string,
  sinceIso: string,
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const placeholders = itemIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT DISTINCT item_id FROM notification_log
       WHERE household_id = ? AND channel = ? AND recipient_identifier = ? AND status = 'success'
         AND sent_at >= ? AND item_id IN (${placeholders})`,
    )
    .bind(householdId, channel, recipientIdentifier, sinceIso, ...itemIds)
    .all<{ item_id: string }>();
  return new Set(results.map((r) => r.item_id));
}

export async function recordNotificationLogBatch(
  db: D1Database,
  householdId: string,
  itemIds: string[],
  channel: NotificationChannel,
  recipientIdentifier: string,
  status: NotificationStatus,
  errorMessage?: string | null,
): Promise<void> {
  if (itemIds.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO notification_log (household_id, item_id, channel, recipient_identifier, status, error_message, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  await db.batch(
    itemIds.map((itemId) => stmt.bind(householdId, itemId, channel, recipientIdentifier, status, errorMessage ?? null, now)),
  );
}
