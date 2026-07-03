import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import * as queries from "./queries.js";

async function clearItems() {
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
}

function makeCreateParams(overrides: Partial<queries.CreateItemParams> = {}): queries.CreateItemParams {
  return {
    id: crypto.randomUUID(),
    householdId: TEST_HOUSEHOLD_ID,
    name: "ロボット掃除機のダストボックス清掃",
    category: "掃除機",
    intervalDays: 7,
    notifyDaysBefore: 0,
    notifyTime: "07:00",
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

    const fetched = await queries.getItem(env.DB, TEST_HOUSEHOLD_ID, params.id);
    expect(fetched).toEqual(created);
  });

  it("returns null for a non-existent item", async () => {
    expect(await queries.getItem(env.DB, TEST_HOUSEHOLD_ID, "does-not-exist")).toBeNull();
  });

  it("returns null when the item belongs to a different household", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    await setupTestHousehold("other-household", "other@example.com");
    expect(await queries.getItem(env.DB, "other-household", created.id)).toBeNull();
  });
});

describe("listItems", () => {
  it("returns only active items by default, ordered by next_due_at ascending", async () => {
    await queries.createItem(env.DB, makeCreateParams({ id: "a", nextDueAt: "2026-07-20" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "b", nextDueAt: "2026-07-05" }));
    const inactive = await queries.createItem(env.DB, makeCreateParams({ id: "c", nextDueAt: "2026-07-10" }));
    await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, inactive.id, { isActive: false });

    const items = await queries.listItems(env.DB, TEST_HOUSEHOLD_ID, false);

    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("includes inactive items when includeInactive is true", async () => {
    const item = await queries.createItem(env.DB, makeCreateParams({ id: "d" }));
    await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, item.id, { isActive: false });

    const items = await queries.listItems(env.DB, TEST_HOUSEHOLD_ID, true);

    expect(items.map((i) => i.id)).toContain("d");
  });

  it("does not include items belonging to a different household", async () => {
    await setupTestHousehold("other-household", "other@example.com");
    await queries.createItem(env.DB, makeCreateParams({ id: "mine" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "theirs", householdId: "other-household" }));

    const items = await queries.listItems(env.DB, TEST_HOUSEHOLD_ID, false);

    expect(items.map((i) => i.id)).toEqual(["mine"]);
  });
});

describe("listDueItemsAllHouseholds", () => {
  it("returns only active items whose next_due_at is on or before the given date, across all households", async () => {
    await queries.createItem(env.DB, makeCreateParams({ id: "overdue", nextDueAt: "2026-06-01" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "due-today", nextDueAt: "2026-07-02" }));
    await queries.createItem(env.DB, makeCreateParams({ id: "future", nextDueAt: "2026-07-10" }));
    const inactive = await queries.createItem(
      env.DB,
      makeCreateParams({ id: "inactive-overdue", nextDueAt: "2026-06-01" }),
    );
    await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, inactive.id, { isActive: false });

    const items = await queries.listDueItemsAllHouseholds(env.DB, "2026-07-02");

    expect(items.map((i) => i.id)).toEqual(["overdue", "due-today"]);
    expect(items.every((i) => i.householdId === TEST_HOUSEHOLD_ID)).toBe(true);
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

    const items = await queries.listDueItemsAllHouseholds(env.DB, "2026-07-02");

    expect(items.map((i) => i.id)).toEqual(["early-notice"]);
  });
});

describe("updateItem", () => {
  it("updates only the provided fields and leaves others untouched", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());

    const updated = await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, created.id, { name: "新しい名前" });

    expect(updated).toMatchObject({
      name: "新しい名前",
      category: created.category,
      intervalDays: created.intervalDays,
    });
  });

  it("returns the unchanged item when no fields are provided", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    const updated = await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, created.id, {});
    expect(updated).toEqual(created);
  });

  it("returns null when updating a non-existent item", async () => {
    expect(await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, "missing", { name: "x" })).toBeNull();
  });

  it("can set category and memo back to null", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams({ category: "掃除機", memo: "メモ" }));
    const updated = await queries.updateItem(env.DB, TEST_HOUSEHOLD_ID, created.id, { category: null, memo: null });
    expect(updated).toMatchObject({ category: null, memo: null });
  });

  it("does not update an item belonging to a different household", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    await setupTestHousehold("other-household", "other@example.com");
    expect(await queries.updateItem(env.DB, "other-household", created.id, { name: "乗っ取り" })).toBeNull();
  });
});

describe("deleteItem", () => {
  it("removes the item", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    await queries.deleteItem(env.DB, TEST_HOUSEHOLD_ID, created.id);
    expect(await queries.getItem(env.DB, TEST_HOUSEHOLD_ID, created.id)).toBeNull();
  });

  it("does not remove an item belonging to a different household", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams());
    await setupTestHousehold("other-household", "other@example.com");
    await queries.deleteItem(env.DB, "other-household", created.id);
    expect(await queries.getItem(env.DB, TEST_HOUSEHOLD_ID, created.id)).not.toBeNull();
  });
});

describe("completeItem", () => {
  it("sets last_done_at to today and pushes next_due_at forward by interval_days", async () => {
    const created = await queries.createItem(
      env.DB,
      makeCreateParams({ intervalDays: 10, lastDoneAt: "2026-06-01", nextDueAt: "2026-06-11" }),
    );

    const completed = await queries.completeItem(
      env.DB,
      TEST_HOUSEHOLD_ID,
      created.id,
      "2026-07-02",
      TEST_HOUSEHOLD_EMAIL,
    );

    expect(completed).toMatchObject({ lastDoneAt: "2026-07-02", nextDueAt: "2026-07-12" });
  });

  it("returns null for a non-existent item", async () => {
    expect(
      await queries.completeItem(env.DB, TEST_HOUSEHOLD_ID, "missing", "2026-07-02", TEST_HOUSEHOLD_EMAIL),
    ).toBeNull();
  });

  it("records a complete event in item_history with the actor's email", async () => {
    const created = await queries.createItem(
      env.DB,
      makeCreateParams({ intervalDays: 10, lastDoneAt: "2026-06-01", nextDueAt: "2026-06-11" }),
    );

    await queries.completeItem(env.DB, TEST_HOUSEHOLD_ID, created.id, "2026-07-02", TEST_HOUSEHOLD_EMAIL);

    const { results } = await env.DB.prepare("SELECT * FROM item_history WHERE item_id = ?").bind(created.id).all<{
      event_type: string;
      completed_date: string;
      interval_days: number;
      next_due_at_before: string;
      next_due_at_after: string;
      actor_email: string;
      household_id: string;
    }>();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      event_type: "complete",
      completed_date: "2026-07-02",
      interval_days: 10,
      next_due_at_before: "2026-06-11",
      next_due_at_after: "2026-07-12",
      actor_email: TEST_HOUSEHOLD_EMAIL,
      household_id: TEST_HOUSEHOLD_ID,
    });
  });
});

describe("snoozeItem", () => {
  it("pushes next_due_at forward by the given number of days without touching last_done_at", async () => {
    const created = await queries.createItem(
      env.DB,
      makeCreateParams({ lastDoneAt: "2026-06-25", nextDueAt: "2026-07-02" }),
    );

    const snoozed = await queries.snoozeItem(env.DB, TEST_HOUSEHOLD_ID, created.id, 3, TEST_HOUSEHOLD_EMAIL);

    expect(snoozed).toMatchObject({ lastDoneAt: "2026-06-25", nextDueAt: "2026-07-05" });
  });

  it("returns null for a non-existent item", async () => {
    expect(await queries.snoozeItem(env.DB, TEST_HOUSEHOLD_ID, "missing", 3, TEST_HOUSEHOLD_EMAIL)).toBeNull();
  });

  it("records a snooze event in item_history with the actor's email", async () => {
    const created = await queries.createItem(
      env.DB,
      makeCreateParams({ lastDoneAt: "2026-06-25", nextDueAt: "2026-07-02" }),
    );

    await queries.snoozeItem(env.DB, TEST_HOUSEHOLD_ID, created.id, 3, TEST_HOUSEHOLD_EMAIL);

    const { results } = await env.DB.prepare("SELECT * FROM item_history WHERE item_id = ?").bind(created.id).all<{
      event_type: string;
      snooze_days: number;
      next_due_at_before: string;
      next_due_at_after: string;
      actor_email: string;
    }>();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      event_type: "snooze",
      snooze_days: 3,
      next_due_at_before: "2026-07-02",
      next_due_at_after: "2026-07-05",
      actor_email: TEST_HOUSEHOLD_EMAIL,
    });
  });
});

describe("recentSnoozeCount", () => {
  it("counts snoozes within the last 30 days and reflects it in listItems/getItem", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams({ id: "snoozy" }));
    await queries.snoozeItem(env.DB, TEST_HOUSEHOLD_ID, created.id, 3, TEST_HOUSEHOLD_EMAIL);
    await queries.snoozeItem(env.DB, TEST_HOUSEHOLD_ID, created.id, 3, TEST_HOUSEHOLD_EMAIL);

    const fetched = await queries.getItem(env.DB, TEST_HOUSEHOLD_ID, created.id);
    expect(fetched?.recentSnoozeCount).toBe(2);

    const listedItems = await queries.listItems(env.DB, TEST_HOUSEHOLD_ID, false);
    expect(listedItems[0]?.recentSnoozeCount).toBe(2);
  });

  it("does not count snoozes older than 30 days", async () => {
    const created = await queries.createItem(env.DB, makeCreateParams({ id: "old-snooze" }));
    await env.DB.prepare(
      `INSERT INTO item_history (id, household_id, item_id, event_type, occurred_at, snooze_days, interval_days, next_due_at_before, next_due_at_after)
       VALUES (?, ?, ?, 'snooze', ?, 3, 7, '2026-01-01', '2026-01-04')`,
    )
      .bind(crypto.randomUUID(), TEST_HOUSEHOLD_ID, created.id, "2020-01-01T00:00:00.000Z")
      .run();

    const fetched = await queries.getItem(env.DB, TEST_HOUSEHOLD_ID, created.id);
    expect(fetched?.recentSnoozeCount).toBe(0);
  });
});
