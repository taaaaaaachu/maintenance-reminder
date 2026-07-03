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
  };
}

export interface RecordCompletionParams {
  itemId: string;
  completedDate: string;
  intervalDays: number;
  nextDueAtBefore: string;
  nextDueAtAfter: string;
}

export async function recordCompletion(db: D1Database, params: RecordCompletionParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO item_history (id, item_id, event_type, occurred_at, completed_date, interval_days, next_due_at_before, next_due_at_after)
       VALUES (?, ?, 'complete', ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      params.itemId,
      new Date().toISOString(),
      params.completedDate,
      params.intervalDays,
      params.nextDueAtBefore,
      params.nextDueAtAfter,
    )
    .run();
}

export interface RecordSnoozeParams {
  itemId: string;
  snoozeDays: number;
  intervalDays: number;
  nextDueAtBefore: string;
  nextDueAtAfter: string;
}

export async function recordSnooze(db: D1Database, params: RecordSnoozeParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO item_history (id, item_id, event_type, occurred_at, snooze_days, interval_days, next_due_at_before, next_due_at_after)
       VALUES (?, ?, 'snooze', ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      params.itemId,
      new Date().toISOString(),
      params.snoozeDays,
      params.intervalDays,
      params.nextDueAtBefore,
      params.nextDueAtAfter,
    )
    .run();
}

export async function listHistory(db: D1Database, itemId: string, limit = 50): Promise<ItemHistoryEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM item_history WHERE item_id = ? ORDER BY occurred_at DESC LIMIT ?")
    .bind(itemId, limit)
    .all<ItemHistoryRow>();
  return results.map(rowToEntry);
}

export interface MonthlyCompletion {
  itemName: string;
  completedDate: string;
}

export async function listCompletionsBetween(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<MonthlyCompletion[]> {
  const { results } = await db
    .prepare(
      `SELECT i.name AS item_name, h.completed_date
       FROM item_history h
       JOIN items i ON i.id = h.item_id
       WHERE h.event_type = 'complete' AND h.completed_date BETWEEN ? AND ?
       ORDER BY h.completed_date ASC`,
    )
    .bind(startDate, endDate)
    .all<{ item_name: string; completed_date: string }>();
  return results.map((row) => ({ itemName: row.item_name, completedDate: row.completed_date }));
}

export async function countSnoozesBetween(
  db: D1Database,
  startIsoInclusive: string,
  endIsoExclusive: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) as count FROM item_history WHERE event_type = 'snooze' AND occurred_at >= ? AND occurred_at < ?",
    )
    .bind(startIsoInclusive, endIsoExclusive)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
