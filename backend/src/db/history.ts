import type { HistoryEventType, ItemHistoryEntry } from "@maintenance-reminder/shared";

interface ItemHistoryRow {
  id: string;
  item_id: string;
  event_type: string;
  occurred_at: string;
  completed_date: string | null;
  snooze_days: number | null;
  interval_days: number;
  next_due_at_before: string;
  next_due_at_after: string;
  actor_email: string | null;
  actor_display_name: string | null;
}

function rowToEntry(row: ItemHistoryRow): ItemHistoryEntry {
  return {
    id: row.id,
    itemId: row.item_id,
    eventType: row.event_type as HistoryEventType,
    occurredAt: row.occurred_at,
    completedDate: row.completed_date,
    snoozeDays: row.snooze_days,
    intervalDays: row.interval_days,
    nextDueAtBefore: row.next_due_at_before,
    nextDueAtAfter: row.next_due_at_after,
    actorEmail: row.actor_email,
    actorDisplayName: row.actor_display_name,
  };
}

export interface RecordCompletionParams {
  householdId: string;
  itemId: string;
  completedDate: string;
  intervalDays: number;
  nextDueAtBefore: string;
  nextDueAtAfter: string;
  actorEmail: string;
}

export async function recordCompletion(db: D1Database, params: RecordCompletionParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO item_history (id, household_id, item_id, event_type, occurred_at, completed_date, interval_days, next_due_at_before, next_due_at_after, actor_email)
       VALUES (?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      params.householdId,
      params.itemId,
      new Date().toISOString(),
      params.completedDate,
      params.intervalDays,
      params.nextDueAtBefore,
      params.nextDueAtAfter,
      params.actorEmail,
    )
    .run();
}

export interface RecordSnoozeParams {
  householdId: string;
  itemId: string;
  snoozeDays: number;
  intervalDays: number;
  nextDueAtBefore: string;
  nextDueAtAfter: string;
  actorEmail: string;
}

export async function recordSnooze(db: D1Database, params: RecordSnoozeParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO item_history (id, household_id, item_id, event_type, occurred_at, snooze_days, interval_days, next_due_at_before, next_due_at_after, actor_email)
       VALUES (?, ?, ?, 'snooze', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      params.householdId,
      params.itemId,
      new Date().toISOString(),
      params.snoozeDays,
      params.intervalDays,
      params.nextDueAtBefore,
      params.nextDueAtAfter,
      params.actorEmail,
    )
    .run();
}

export async function listHistory(
  db: D1Database,
  householdId: string,
  itemId: string,
  limit = 50,
): Promise<ItemHistoryEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT h.*, hm.display_name AS actor_display_name
       FROM item_history h
       LEFT JOIN household_members hm ON hm.household_id = h.household_id AND hm.email = h.actor_email
       WHERE h.household_id = ? AND h.item_id = ?
       ORDER BY h.occurred_at DESC LIMIT ?`,
    )
    .bind(householdId, itemId, limit)
    .all<ItemHistoryRow>();
  return results.map(rowToEntry);
}

export interface MonthlyCompletion {
  itemName: string;
  completedDate: string;
}

export async function listCompletionsBetween(
  db: D1Database,
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<MonthlyCompletion[]> {
  const { results } = await db
    .prepare(
      `SELECT i.name AS item_name, h.completed_date
       FROM item_history h
       JOIN items i ON i.id = h.item_id
       WHERE h.household_id = ? AND h.event_type = 'complete' AND h.completed_date BETWEEN ? AND ?
       ORDER BY h.completed_date ASC`,
    )
    .bind(householdId, startDate, endDate)
    .all<{ item_name: string; completed_date: string }>();
  return results.map((row) => ({ itemName: row.item_name, completedDate: row.completed_date }));
}

export async function countSnoozesBetween(
  db: D1Database,
  householdId: string,
  startIsoInclusive: string,
  endIsoExclusive: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) as count FROM item_history WHERE household_id = ? AND event_type = 'snooze' AND occurred_at >= ? AND occurred_at < ?",
    )
    .bind(householdId, startIsoInclusive, endIsoExclusive)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
