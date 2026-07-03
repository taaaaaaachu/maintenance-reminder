import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as itemsDb from "./queries.js";
import * as historyDb from "./history.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM items").run();
}

async function makeItem(id: string) {
  return itemsDb.createItem(env.DB, {
    id,
    name: `アイテム${id}`,
    category: null,
    intervalDays: 7,
    notifyDaysBefore: 0,
    notifyTime: "07:00",
    memo: null,
    lastDoneAt: "2026-06-25",
    nextDueAt: "2026-07-02",
  });
}

beforeEach(async () => {
  await clearAll();
});

describe("recordCompletion / listHistory", () => {
  it("records a complete event retrievable via listHistory", async () => {
    await makeItem("a");

    await historyDb.recordCompletion(env.DB, {
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
    });

    const history = await historyDb.listHistory(env.DB, "a");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      itemId: "a",
      eventType: "complete",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
    });
  });

  it("returns history ordered most-recent-first", async () => {
    await makeItem("a");
    await historyDb.recordCompletion(env.DB, {
      itemId: "a",
      completedDate: "2026-06-25",
      intervalDays: 7,
      nextDueAtBefore: "2026-06-25",
      nextDueAtAfter: "2026-07-02",
    });
    await historyDb.recordCompletion(env.DB, {
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
    });

    const history = await historyDb.listHistory(env.DB, "a");
    expect(history.map((h) => h.completedDate)).toEqual(["2026-07-02", "2026-06-25"]);
  });
});

describe("recordSnooze / listHistory", () => {
  it("records a snooze event retrievable via listHistory", async () => {
    await makeItem("a");

    await historyDb.recordSnooze(env.DB, {
      itemId: "a",
      snoozeDays: 3,
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
    });

    const history = await historyDb.listHistory(env.DB, "a");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      itemId: "a",
      eventType: "snooze",
      snoozeDays: 3,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
    });
  });
});

describe("listCompletionsBetween", () => {
  it("returns completions within the date range joined with item names", async () => {
    await makeItem("a");
    await makeItem("b");
    await historyDb.recordCompletion(env.DB, {
      itemId: "a",
      completedDate: "2026-07-05",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-05",
      nextDueAtAfter: "2026-07-12",
    });
    await historyDb.recordCompletion(env.DB, {
      itemId: "b",
      completedDate: "2026-08-01",
      intervalDays: 7,
      nextDueAtBefore: "2026-08-01",
      nextDueAtAfter: "2026-08-08",
    });

    const completions = await historyDb.listCompletionsBetween(env.DB, "2026-07-01", "2026-07-31");

    expect(completions).toEqual([{ itemName: "アイテムa", completedDate: "2026-07-05" }]);
  });

  it("excludes snooze events", async () => {
    await makeItem("a");
    await historyDb.recordSnooze(env.DB, {
      itemId: "a",
      snoozeDays: 3,
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
    });

    const completions = await historyDb.listCompletionsBetween(env.DB, "2026-07-01", "2026-07-31");

    expect(completions).toEqual([]);
  });
});

describe("countSnoozesBetween", () => {
  it("counts snooze events within the given ISO timestamp range", async () => {
    await makeItem("a");
    await historyDb.recordSnooze(env.DB, {
      itemId: "a",
      snoozeDays: 3,
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
    });
    await historyDb.recordCompletion(env.DB, {
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
    });

    const count = await historyDb.countSnoozesBetween(env.DB, "2020-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z");
    expect(count).toBe(1);
  });
});
