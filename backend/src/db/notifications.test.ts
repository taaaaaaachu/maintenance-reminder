import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as itemsDb from "./queries.js";
import * as notificationsDb from "./notifications.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM items").run();
}

beforeEach(async () => {
  await clearAll();
});

describe("listNotificationSettings", () => {
  it("returns a disabled entry for every channel when nothing is configured", async () => {
    const settings = await notificationsDb.listNotificationSettings(env.DB);

    expect(settings).toEqual([
      { channel: "line", isEnabled: false },
      { channel: "email", isEnabled: false },
      { channel: "pushover", isEnabled: false },
    ]);
  });

  it("reflects saved settings for configured channels", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, "line", true);

    const settings = await notificationsDb.listNotificationSettings(env.DB);
    expect(settings.find((s) => s.channel === "line")).toEqual({ channel: "line", isEnabled: true });
  });
});

describe("setNotificationEnabled", () => {
  it("creates a new setting", async () => {
    const result = await notificationsDb.setNotificationEnabled(env.DB, "email", true);
    expect(result).toEqual({ channel: "email", isEnabled: true });
  });

  it("updates an existing setting rather than duplicating it", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, "email", true);
    await notificationsDb.setNotificationEnabled(env.DB, "email", false);

    const { results } = await env.DB.prepare("SELECT * FROM notification_settings WHERE channel = 'email'").all();
    expect(results).toHaveLength(1);
    expect((results[0] as { is_enabled: number }).is_enabled).toBe(0);
  });
});

describe("addRecipient / listRecipients / removeRecipient", () => {
  it("adds a recipient and lists it for the correct channel", async () => {
    const recipient = await notificationsDb.addRecipient(env.DB, "email", "me@example.com", "自分");
    expect(recipient).toMatchObject({ channel: "email", identifier: "me@example.com", label: "自分" });

    const recipients = await notificationsDb.listRecipients(env.DB, "email");
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toEqual(recipient);
  });

  it("does not list recipients from a different channel", async () => {
    await notificationsDb.addRecipient(env.DB, "email", "me@example.com", null);
    expect(await notificationsDb.listRecipients(env.DB, "pushover")).toHaveLength(0);
  });

  it("updates the label instead of creating a duplicate when the same channel+identifier is added again", async () => {
    await notificationsDb.addRecipient(env.DB, "line", "U123", null);
    const updated = await notificationsDb.addRecipient(env.DB, "line", "U123", "お母さん");

    expect(updated.label).toBe("お母さん");
    expect(await notificationsDb.listRecipients(env.DB, "line")).toHaveLength(1);
  });

  it("removes a recipient by id", async () => {
    const recipient = await notificationsDb.addRecipient(env.DB, "pushover", "user-key", null);
    await notificationsDb.removeRecipient(env.DB, "pushover", recipient.id);
    expect(await notificationsDb.listRecipients(env.DB, "pushover")).toHaveLength(0);
  });
});

describe("getRecipient", () => {
  it("returns the matching recipient", async () => {
    const created = await notificationsDb.addRecipient(env.DB, "line", "U123", null);
    expect(await notificationsDb.getRecipient(env.DB, "line", created.id)).toEqual(created);
  });

  it("returns null when the id or channel does not match", async () => {
    const created = await notificationsDb.addRecipient(env.DB, "line", "U123", null);
    expect(await notificationsDb.getRecipient(env.DB, "email", created.id)).toBeNull();
    expect(await notificationsDb.getRecipient(env.DB, "line", "missing")).toBeNull();
  });
});

describe("recordNotificationLog / hasSuccessfulNotificationSince", () => {
  async function createItem(id: string) {
    return itemsDb.createItem(env.DB, {
      id,
      name: "test",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });
  }

  it("returns false when no successful log exists yet", async () => {
    const item = await createItem("item-1");
    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "U123", "2026-07-01T15:00:00.000Z"),
    ).toBe(false);
  });

  it("returns true once a success log is recorded for that recipient", async () => {
    const item = await createItem("item-2");
    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "U123", "2026-07-01T15:00:00.000Z"),
    ).toBe(true);
  });

  it("does not consider a different recipient's success as sent", async () => {
    const item = await createItem("item-3");
    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "U456", "2026-07-01T15:00:00.000Z"),
    ).toBe(false);
  });

  it("ignores failed logs when checking for a successful send", async () => {
    const item = await createItem("item-4");
    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "failed",
      errorMessage: "boom",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(env.DB, item.id, "line", "U123", "2026-07-01T15:00:00.000Z"),
    ).toBe(false);
  });
});
