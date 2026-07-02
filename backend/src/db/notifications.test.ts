import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as itemsDb from "./queries.js";
import * as notificationsDb from "./notifications.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM items").run();
}

beforeEach(async () => {
  await clearAll();
});

describe("listNotificationSettings", () => {
  it("returns a disabled/empty default entry for every channel when nothing is configured", async () => {
    const settings = await notificationsDb.listNotificationSettings(env.DB);

    expect(settings).toEqual([
      { channel: "line", isEnabled: false, config: {} },
      { channel: "email", isEnabled: false, config: {} },
      { channel: "pushover", isEnabled: false, config: {} },
    ]);
  });

  it("reflects saved settings for configured channels", async () => {
    await notificationsDb.upsertNotificationSetting(env.DB, "line", true, { userId: "U123" });

    const settings = await notificationsDb.listNotificationSettings(env.DB);
    const line = settings.find((s) => s.channel === "line");

    expect(line).toEqual({ channel: "line", isEnabled: true, config: { userId: "U123" } });
  });
});

describe("getNotificationSetting", () => {
  it("returns a disabled default for an unconfigured channel", async () => {
    expect(await notificationsDb.getNotificationSetting(env.DB, "pushover")).toEqual({
      channel: "pushover",
      isEnabled: false,
      config: {},
    });
  });
});

describe("upsertNotificationSetting", () => {
  it("creates a new setting", async () => {
    const result = await notificationsDb.upsertNotificationSetting(env.DB, "email", true, {
      toAddress: "me@example.com",
    });
    expect(result).toEqual({ channel: "email", isEnabled: true, config: { toAddress: "me@example.com" } });
  });

  it("updates an existing setting rather than duplicating it", async () => {
    await notificationsDb.upsertNotificationSetting(env.DB, "email", true, { toAddress: "old@example.com" });
    const updated = await notificationsDb.upsertNotificationSetting(env.DB, "email", false, {
      toAddress: "new@example.com",
    });

    expect(updated).toEqual({ channel: "email", isEnabled: false, config: { toAddress: "new@example.com" } });

    const { results } = await env.DB.prepare("SELECT * FROM notification_settings WHERE channel = 'email'").all();
    expect(results).toHaveLength(1);
  });
});

describe("recordNotificationLog / hasSuccessfulNotificationSince", () => {
  it("returns false when no successful log exists yet", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-1",
      name: "test",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "2026-07-01T15:00:00.000Z"),
    ).toBe(false);
  });

  it("returns true once a success log is recorded on or after the given instant", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-2",
      name: "test",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });

    await notificationsDb.recordNotificationLog(env.DB, { itemId: item.id, channel: "line", status: "success" });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
  });

  it("ignores failed logs when checking for a successful send", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-3",
      name: "test",
      category: null,
      intervalDays: 7,
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });

    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "line",
      status: "failed",
      errorMessage: "boom",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "2026-07-01T15:00:00.000Z"),
    ).toBe(false);
  });
});
