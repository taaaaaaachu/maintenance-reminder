import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as queries from "./queries.js";

async function clearItems() {
  await env.DB.prepare("DELETE FROM items").run();
}

function makeCreateParams(overrides: Partial<queries.CreateItemParams> = {}): queries.CreateItemParams {
  return {
    id: crypto.randomUUID(),
    name: "ロボット掃除機のダストボックス清掃",
    category: "掃除機",
    intervalDays: 7,
    notifyDaysBefore: 0,
    memo: null,
    lastDoneAt: "2026-07-01",
    nextDueAt: "2026-07-08",
    ...overrides,
  };
}

beforeEach(async () => {
  await clearItems();
});

describe("createItem / getItem", () => {
  it("creates an item and retrieves it with all fields mapped correctly", async () => {
    const params = makeCreateParams();
    const created = await queries.createItem(env.DB, params);

    expect(created).toMatchObject({
      id: params.id,
      name: params.name,
      category: params.category,
      intervalDays: params.intervalDays,
      memo: params.memo,
      lastDoneAt: params.lastDoneAt,
      nextDueAt: params.nextDueAt,
      isActive: true,
    });

    const fetched = await queries.getItem(env.DB, params.id);
    expect(fetched).toEqual(created);
  });

  it("returns null for a non-existent item", async () => {
    expect(await queries.getItem(env.DB, "does-not-exist")).toBeNull();
  });
});

describe("listItems", () => {
  it("returns only active items by default, ordered by next_due_at ascending", async () => {
    await queries.createItem(env.DB, makeCreateParams({ id: "a", nextDueAt: "2026-07-20" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "b", nextDueAt: "2026-07-05" }));
    const inactive = await queries.createItem(env.DB, makeCreateParams({ id: "c", nextDueAt: "2026-07-10" }));
    await queries.updateItem(env.DB, inactive.id, { isActive: false });

    const items = await queries.listItems(env.DB, false);

    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("includes inactive items when includeInactive is true", async () => {
    const item = await queries.createItem(env.DB, makeCreateParams({ id: "d" }));
    await queries.updateItem(env.DB, item.id, { isActive: false });

    const items = await queries.listItems(env.DB, true);

    expect(items.map((i) => i.id)).toContain("d");
  });
});

describe("listDueItems", () => {
  it("returns only active items whose next_due_at is on or before the given date", async () => {
    await queries.createItem(env.DB, makeCreateParams({ id: "overdue", nextDueAt: "2026-06-01" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "due-today", nextDueAt: "2026-07-02" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "future", nextDueAt: "2026-07-10" }));
    const inactive = await queries.createItem(env.DB, makeCreateParams({ id: "inactive-overdue", nextDueAt: "2026-06-01" }));
    await queries.updateItem(env.DB, inactive.id, { isActive: false });

    const items = await queries.listDueItems(env.DB, "2026-07-02");

    expect(items.map((i) => i.id)).toEqual(["overdue", "due-today"]);
  });

  it("includes items whose lead-time window (notify_days_before) has started even if not yet due", async () => {
    await queries.createItem(
      env.DB,
      makeCreateParams({ id: "early-notice", nextDueAt: "2026-07-05", notifyDaysBefore: 3 }),
    );
    await queries.createItem(
      env.DB,
      makeCreateParams({ id: "too-early", nextDueAt: "2026-07-10", notifyDaysBefore: 3 }),
    );

    const items = await queries.listDueItems(env.DB, "2026-07-02");

    expect(items.map((i) => i.id)).toEqual(["early-notice"]);
  });
});

describe("updateItem", () => {
  it("updates only the provided fields and leaves others untouched", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());

    const updated = await queries.updateItem(env.DB, created.id, { name: "新しい名前" });

    expect(updated).toMatchObject({
      name: "新しい名前",
      category: created.category,
      intervalDays: created.intervalDays,
    });
  });

  it("returns the unchanged item when no fields are provided", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    const updated = await queries.updateItem(env.DB, created.id, {});
    expect(updated).toEqual(created);
  });

  it("returns null when updating a non-existent item", async () => {
    expect(await queries.updateItem(env.DB, "missing", { name: "x" })).toBeNull();
  });

  it("can set category and memo back to null", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams({ category: "掃除機", memo: "メモ" }));
    const updated = await queries.updateItem(env.DB, created.id, { category: null, memo: null });
    expect(updated).toMatchObject({ category: null, memo: null });
  });
});

describe("deleteItem", () => {
  it("removes the item", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    await queries.deleteItem(env.DB, created.id);
    expect(await queries.getItem(env.DB, created.id)).toBeNull();
  });
});

describe("completeItem", () => {
  it("sets last_done_at to today and pushes next_due_at forward by interval_days", async () => {
    const created = await queries.createItem(
      env.DB,
      makeCreateParams({ intervalDays: 10, lastDoneAt: "2026-06-01", nextDueAt: "2026-06-11" }),
    );

    const completed = await queries.completeItem(env.DB, created.id, "2026-07-02");

    expect(completed).toMatchObject({ lastDoneAt: "2026-07-02", nextDueAt: "2026-07-12" });
  });

  it("returns null for a non-existent item", async () => {
    expect(await queries.completeItem(env.DB, "missing", "2026-07-02")).toBeNull();
  });
});

describe("snoozeItem", () => {
  it("pushes next_due_at forward by the given number of days without touching last_done_at", async () => {
    const created = await queries.createItem(
      env.DB,
      makeCreateParams({ lastDoneAt: "2026-06-25", nextDueAt: "2026-07-02" }),
    );

    const snoozed = await queries.snoozeItem(env.DB, created.id, 3);

    expect(snoozed).toMatchObject({ lastDoneAt: "2026-06-25", nextDueAt: "2026-07-05" });
  });

  it("returns null for a non-existent item", async () => {
    expect(await queries.snoozeItem(env.DB, "missing", 3)).toBeNull();
  });
});
