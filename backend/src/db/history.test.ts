import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import * as itemsDb from "./queries.js";
import * as historyDb from "./history.js";
import * as householdsDb from "./households.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
}

async function makeItem(id: string) {
  return itemsDb.createItem(env.DB, {
    id,
    householdId: TEST_HOUSEHOLD_ID,
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
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    const history = await historyDb.listHistory(env.DB, TEST_HOUSEHOLD_ID, "a");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      itemId: "a",
      eventType: "complete",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });
  });

  it("returns history ordered most-recent-first", async () => {
    await makeItem("a");
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-06-25",
      intervalDays: 7,
      nextDueAtBefore: "2026-06-25",
      nextDueAtAfter: "2026-07-02",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    const history = await historyDb.listHistory(env.DB, TEST_HOUSEHOLD_ID, "a");
    expect(history.map((h) => h.completedDate)).toEqual(["2026-07-02", "2026-06-25"]);
  });

  it("does not return history belonging to a different household", async () => {
    await makeItem("a");
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    await setupTestHousehold("other-household", "other@example.com");
    const history = await historyDb.listHistory(env.DB, "other-household", "a");
    expect(history).toHaveLength(0);
  });

  it("resolves the actor's display name from household_members when available", async () => {
    await makeItem("a");
    await householdsDb.addHouseholdMember(env.DB, TEST_HOUSEHOLD_ID, "haha@example.com", "母");
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
      actorEmail: "haha@example.com",
    });

    const history = await historyDb.listHistory(env.DB, TEST_HOUSEHOLD_ID, "a");
    expect(history[0]).toMatchObject({ actorEmail: "haha@example.com", actorDisplayName: "母" });
  });
});

describe("recordSnooze / listHistory", () => {
  it("records a snooze event retrievable via listHistory", async () => {
    await makeItem("a");

    await historyDb.recordSnooze(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      snoozeDays: 3,
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    const history = await historyDb.listHistory(env.DB, TEST_HOUSEHOLD_ID, "a");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      itemId: "a",
      eventType: "snooze",
      snoozeDays: 3,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });
  });
});

describe("listCompletionsBetween", () => {
  it("returns completions within the date range joined with item names", async () => {
    await makeItem("a");
    await makeItem("b");
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-05",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-05",
      nextDueAtAfter: "2026-07-12",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "b",
      completedDate: "2026-08-01",
      intervalDays: 7,
      nextDueAtBefore: "2026-08-01",
      nextDueAtAfter: "2026-08-08",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    const completions = await historyDb.listCompletionsBetween(env.DB, TEST_HOUSEHOLD_ID, "2026-07-01", "2026-07-31");

    expect(completions).toEqual([{ itemName: "アイテムa", completedDate: "2026-07-05" }]);
  });

  it("excludes snooze events", async () => {
    await makeItem("a");
    await historyDb.recordSnooze(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      snoozeDays: 3,
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    const completions = await historyDb.listCompletionsBetween(env.DB, TEST_HOUSEHOLD_ID, "2026-07-01", "2026-07-31");

    expect(completions).toEqual([]);
  });

  it("excludes completions belonging to a different household", async () => {
    await makeItem("a");
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-05",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-05",
      nextDueAtAfter: "2026-07-12",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    await setupTestHousehold("other-household", "other@example.com");
    const completions = await historyDb.listCompletionsBetween(env.DB, "other-household", "2026-07-01", "2026-07-31");
    expect(completions).toEqual([]);
  });
});

describe("countSnoozesBetween", () => {
  it("counts snooze events within the given ISO timestamp range", async () => {
    await makeItem("a");
    await historyDb.recordSnooze(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      snoozeDays: 3,
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-05",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });
    await historyDb.recordCompletion(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: "a",
      completedDate: "2026-07-02",
      intervalDays: 7,
      nextDueAtBefore: "2026-07-02",
      nextDueAtAfter: "2026-07-09",
      actorEmail: TEST_HOUSEHOLD_EMAIL,
    });

    const count = await historyDb.countSnoozesBetween(
      env.DB,
      TEST_HOUSEHOLD_ID,
      "2020-01-01T00:00:00.000Z",
      "2100-01-01T00:00:00.000Z",
    );
    expect(count).toBe(1);
  });
});
