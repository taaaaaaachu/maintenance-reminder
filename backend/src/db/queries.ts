import type { Item } from "@maintenance-reminder/shared";
import { addDaysToDateString } from "../lib/date.js";

interface ItemRow {
  id: string;
  name: string;
  category: string | null;
  interval_days: number;
  notify_days_before: number;
  last_done_at: string | null;
  next_due_at: string;
  memo: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    intervalDays: row.interval_days,
    notifyDaysBefore: row.notify_days_before,
    lastDoneAt: row.last_done_at,
    nextDueAt: row.next_due_at,
    memo: row.memo,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listItems(db: D1Database, includeInactive: boolean): Promise<Item[]> {
  const query = includeInactive
    ? "SELECT * FROM items ORDER BY next_due_at ASC"
    : "SELECT * FROM items WHERE is_active = 1 ORDER BY next_due_at ASC";
  const { results } = await db.prepare(query).all<ItemRow>();
  return results.map(rowToItem);
}

export async function getItem(db: D1Database, id: string): Promise<Item | null> {
  const row = await db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<ItemRow>();
  return row ? rowToItem(row) : null;
}

export async function listDueItems(db: D1Database, today: string): Promise<Item[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM items
       WHERE is_active = 1 AND date(next_due_at, '-' || notify_days_before || ' days') <= ?
       ORDER BY next_due_at ASC`,
    )
    .bind(today)
    .all<ItemRow>();
  return results.map(rowToItem);
}

export interface CreateItemParams {
  id: string;
  name: string;
  category: string | null;
  intervalDays: number;
  notifyDaysBefore: number;
  memo: string | null;
  lastDoneAt: string;
  nextDueAt: string;
}

export async function createItem(db: D1Database, input: CreateItemParams): Promise<Item> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO items (id, name, category, interval_days, notify_days_before, last_done_at, next_due_at, memo, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      input.id,
      input.name,
      input.category,
      input.intervalDays,
      input.notifyDaysBefore,
      input.lastDoneAt,
      input.nextDueAt,
      input.memo,
      now,
      now,
    )
    .run();
  const created = await getItem(db, input.id);
  if (!created) throw new Error("Failed to create item");
  return created;
}

export interface UpdateItemParams {
  name?: string;
  category?: string | null;
  intervalDays?: number;
  notifyDaysBefore?: number;
  memo?: string | null;
  isActive?: boolean;
}

export async function updateItem(db: D1Database, id: string, input: UpdateItemParams): Promise<Item | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    sets.push("name = ?");
    values.push(input.name);
  }
  if (input.category !== undefined) {
    sets.push("category = ?");
    values.push(input.category);
  }
  if (input.intervalDays !== undefined) {
    sets.push("interval_days = ?");
    values.push(input.intervalDays);
  }
  if (input.notifyDaysBefore !== undefined) {
    sets.push("notify_days_before = ?");
    values.push(input.notifyDaysBefore);
  }
  if (input.memo !== undefined) {
    sets.push("memo = ?");
    values.push(input.memo);
  }
  if (input.isActive !== undefined) {
    sets.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (sets.length === 0) return getItem(db, id);

  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  await db
    .prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  return getItem(db, id);
}

export async function deleteItem(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
}

export async function completeItem(db: D1Database, id: string, today: string): Promise<Item | null> {
  const item = await getItem(db, id);
  if (!item) return null;
  const nextDueAt = addDaysToDateString(today, item.intervalDays);
  await db
    .prepare("UPDATE items SET last_done_at = ?, next_due_at = ?, updated_at = ? WHERE id = ?")
    .bind(today, nextDueAt, new Date().toISOString(), id)
    .run();
  return getItem(db, id);
}

export async function snoozeItem(db: D1Database, id: string, days: number): Promise<Item | null> {
  const item = await getItem(db, id);
  if (!item) return null;
  const nextDueAt = addDaysToDateString(item.nextDueAt, days);
  await db
    .prepare("UPDATE items SET next_due_at = ?, updated_at = ? WHERE id = ?")
    .bind(nextDueAt, new Date().toISOString(), id)
    .run();
  return getItem(db, id);
}
