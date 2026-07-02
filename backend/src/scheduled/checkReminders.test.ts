import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { checkReminders } from "./checkReminders.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM items").run();
}

const fetchMock = vi.fn();

beforeEach(async () => {
  await clearAll();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.setSystemTime(new Date("2026-07-02T03:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("checkReminders", () => {
  it("sends a notification for a due item on an enabled channel and records success", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "due-1",
      name: "ロボット掃除機の清掃",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.upsertNotificationSetting(env.DB, "pushover", true, { userKey: "abc123" });

    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledOnce();
    const sent = await notificationsDb.hasSuccessfulNotificationSince(
      env.DB,
      item.id,
      "pushover",
      "2026-07-01T15:00:00.000Z",
    );
    expect(sent).toBe(true);
  });

  it("does not resend on the same day once a successful notification is recorded", async () => {
    await itemsDb.createItem(env.DB, {
      id: "due-2",
      name: "洗濯機の掃除",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.upsertNotificationSetting(env.DB, "pushover", true, { userKey: "abc123" });

    await checkReminders(env);
    await checkReminders(env);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("skips items that are not yet due", async () => {
    await itemsDb.createItem(env.DB, {
      id: "future",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 30,
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-31",
    });
    await notificationsDb.upsertNotificationSetting(env.DB, "pushover", true, { userKey: "abc123" });

    await checkReminders(env);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips channels that are not enabled", async () => {
    await itemsDb.createItem(env.DB, {
      id: "due-3",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    // pushover left disabled (default)

    await checkReminders(env);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a failed log entry and does not throw when the send fails", async () => {
    fetchMock.mockResolvedValue(new Response("server error", { status: 500 }));
    const item = await itemsDb.createItem(env.DB, {
      id: "due-4",
      name: "加湿器の掃除",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.upsertNotificationSetting(env.DB, "pushover", true, { userKey: "abc123" });

    await expect(checkReminders(env)).resolves.toBeUndefined();

    const sent = await notificationsDb.hasSuccessfulNotificationSince(
      env.DB,
      item.id,
      "pushover",
      "2026-07-01T15:00:00.000Z",
    );
    expect(sent).toBe(false);

    const { results } = await env.DB.prepare(
      "SELECT * FROM notification_log WHERE item_id = ? AND status = 'failed'",
    )
      .bind(item.id)
      .all();
    expect(results).toHaveLength(1);
  });
});
