import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { checkReminders } from "./checkReminders.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM items").run();
}

const fetchMock = vi.fn();

beforeEach(async () => {
  await clearAll();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  // 2026-07-01T22:00:00Z is 2026-07-02 07:00 JST.
  vi.setSystemTime(new Date("2026-07-01T22:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("checkReminders", () => {
  it("sends a notification to every recipient of an enabled channel for a due item at its notify time", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "due-1",
      name: "ロボット掃除機の清掃",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", "父");
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-2", "母");

    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "pushover", "user-key-1", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "pushover", "user-key-2", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
  });

  it("does not resend to the same recipient on the same day once successfully notified", async () => {
    await itemsDb.createItem(env.DB, {
      id: "due-2",
      name: "洗濯機の掃除",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);
    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips items that are not yet due", async () => {
    await itemsDb.createItem(env.DB, {
      id: "future",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 30,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-31",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes items whose notify_days_before lead time has started", async () => {
    await itemsDb.createItem(env.DB, {
      id: "lead-time",
      name: "エアコンフィルター清掃",
      category: null,
      intervalDays: 30,
      notifyDaysBefore: 5,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-05",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips channels that are not enabled even if recipients are registered", async () => {
    await itemsDb.createItem(env.DB, {
      id: "due-3",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);
    // pushover left disabled (default)

    await checkReminders(env);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a failed log entry per recipient and does not throw when the send fails", async () => {
    fetchMock.mockResolvedValue(new Response("server error", { status: 500 }));
    const item = await itemsDb.createItem(env.DB, {
      id: "due-4",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await expect(checkReminders(env)).resolves.toBeUndefined();

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "pushover", "user-key-1", "2026-07-01T15:00:00.000Z"),
    ).toBe(false);

    const { results } = await env.DB.prepare(
      "SELECT * FROM notification_log WHERE item_id = ? AND status = 'failed'",
    )
      .bind(item.id)
      .all();
    expect(results).toHaveLength(1);
  });

  it("does not notify an item whose notify_time does not match the current time", async () => {
    await itemsDb.createItem(env.DB, {
      id: "due-5",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "20:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifies only the items whose notify_time matches the current time when items differ", async () => {
    const morningItem = await itemsDb.createItem(env.DB, {
      id: "morning-item",
      name: "朝アイテム",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await itemsDb.createItem(env.DB, {
      id: "evening-item",
      name: "夜アイテム",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "20:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, morningItem.id, "pushover", "user-key-1", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
  });

  it("bundles multiple due items for the same recipient into a single notification", async () => {
    const itemA = await itemsDb.createItem(env.DB, {
      id: "due-a",
      name: "アイテムA",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    const itemB = await itemsDb.createItem(env.DB, {
      id: "due-b",
      name: "アイテムB",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-20",
      nextDueAt: "2026-06-27",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("message")).toContain("アイテムA");
    expect(body.get("message")).toContain("アイテムB");
    expect(body.get("url")).toContain("due-a");
    expect(body.get("url")).toContain("due-b");

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, itemA.id, "pushover", "user-key-1", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, itemB.id, "pushover", "user-key-1", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
  });

  it("records a failed log entry for every bundled item when the send fails", async () => {
    fetchMock.mockResolvedValue(new Response("server error", { status: 500 }));
    const itemA = await itemsDb.createItem(env.DB, {
      id: "due-c",
      name: "アイテムC",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    const itemB = await itemsDb.createItem(env.DB, {
      id: "due-d",
      name: "アイテムD",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-20",
      nextDueAt: "2026-06-27",
    });
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const item of [itemA, itemB]) {
      const { results } = await env.DB.prepare(
        "SELECT * FROM notification_log WHERE item_id = ? AND status = 'failed'",
      )
        .bind(item.id)
        .all();
      expect(results).toHaveLength(1);
    }
  });
});
