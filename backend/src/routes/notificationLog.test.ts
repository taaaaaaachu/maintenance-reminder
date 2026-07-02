import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";

const BASE_URL = "https://example.com";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM items").run();
}

beforeEach(async () => {
  await clearAll();
});

describe("GET /api/notification-log", () => {
  it("returns an empty array when nothing has been logged yet", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/notification-log`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("joins item name and recipient label, and orders by most recent first", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-1",
      name: "ロボット掃除機の清掃",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", "父");

    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "pushover",
      recipientIdentifier: "user-key-1",
      status: "success",
    });
    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "pushover",
      recipientIdentifier: "user-key-1",
      status: "failed",
      errorMessage: "timeout",
    });

    const res = await exports.default.fetch(`${BASE_URL}/api/notification-log`);
    const entries = (await res.json()) as Array<Record<string, unknown>>;

    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first?.status).toBe("failed");
    expect(first?.errorMessage).toBe("timeout");
    expect(second?.status).toBe("success");
    for (const entry of entries) {
      expect(entry.itemName).toBe("ロボット掃除機の清掃");
      expect(entry.recipientLabel).toBe("父");
    }
  });

  it("cascades: deleting the item also removes its notification log entries", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-2",
      name: "洗濯機の掃除",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "email",
      recipientIdentifier: "me@example.com",
      status: "success",
    });
    await itemsDb.deleteItem(env.DB, item.id);

    const res = await exports.default.fetch(`${BASE_URL}/api/notification-log`);
    expect(await res.json()).toEqual([]);
  });

  it("respects the limit query parameter", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-3",
      name: "test",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
    });
    for (let i = 0; i < 3; i++) {
      await notificationsDb.recordNotificationLog(env.DB, {
        itemId: item.id,
        channel: "email",
        recipientIdentifier: "me@example.com",
        status: "success",
      });
    }

    const res = await exports.default.fetch(`${BASE_URL}/api/notification-log?limit=2`);
    expect(await res.json()).toHaveLength(2);
  });
});
