import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import * as itemsDb from "./queries.js";
import * as notificationsDb from "./notifications.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
}

beforeEach(async () => {
  await clearAll();
});

describe("listNotificationSettings", () => {
  it("returns a disabled entry for every channel when nothing is configured", async () => {
    const settings = await notificationsDb.listNotificationSettings(env.DB, TEST_HOUSEHOLD_ID);

    expect(settings).toEqual([
      { channel: "line", isEnabled: false },
      { channel: "email", isEnabled: false },
      { channel: "pushover", isEnabled: false },
    ]);
  });

  it("reflects saved settings for configured channels", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "line", true);

    const settings = await notificationsDb.listNotificationSettings(env.DB, TEST_HOUSEHOLD_ID);
    expect(settings.find((s) => s.channel === "line")).toEqual({ channel: "line", isEnabled: true });
  });

  it("does not leak settings from a different household", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "line", true);
    await setupTestHousehold("other-household", "other@example.com");

    const settings = await notificationsDb.listNotificationSettings(env.DB, "other-household");
    expect(settings.find((s) => s.channel === "line")).toEqual({ channel: "line", isEnabled: false });
  });
});

describe("setNotificationEnabled", () => {
  it("creates a new setting", async () => {
    const result = await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "email", true);
    expect(result).toEqual({ channel: "email", isEnabled: true });
  });

  it("updates an existing setting rather than duplicating it", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "email", true);
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "email", false);

    const { results } = await env.DB.prepare(
      "SELECT * FROM notification_settings WHERE household_id = ? AND channel = 'email'",
    )
      .bind(TEST_HOUSEHOLD_ID)
      .all();
    expect(results).toHaveLength(1);
    expect((results[0] as { is_enabled: number }).is_enabled).toBe(0);
  });
});

describe("addRecipient / listRecipients / removeRecipient", () => {
  it("adds a recipient and lists it for the correct channel", async () => {
    const recipient = await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "email", "me@example.com", "自分");
    expect(recipient).toMatchObject({ channel: "email", identifier: "me@example.com", label: "自分" });

    const recipients = await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "email");
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toEqual(recipient);
  });

  it("does not list recipients from a different channel", async () => {
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "email", "me@example.com", null);
    expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "pushover")).toHaveLength(0);
  });

  it("updates the label instead of creating a duplicate when the same channel+identifier is added again", async () => {
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", null);
    const updated = await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", "お母さん");

    expect(updated.label).toBe("お母さん");
    expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line")).toHaveLength(1);
  });

  it("allows the same channel+identifier to exist independently in a different household", async () => {
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", "自宅");
    await setupTestHousehold("other-household", "other@example.com");
    await notificationsDb.addRecipient(env.DB, "other-household", "line", "U123", "実家");

    expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line")).toHaveLength(1);
    expect(await notificationsDb.listRecipients(env.DB, "other-household", "line")).toHaveLength(1);
  });

  it("removes a recipient by id", async () => {
    const recipient = await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "pushover", "user-key", null);
    await notificationsDb.removeRecipient(env.DB, TEST_HOUSEHOLD_ID, "pushover", recipient.id);
    expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "pushover")).toHaveLength(0);
  });
});

describe("removeRecipientByIdentifier", () => {
  it("removes a recipient across households by channel and identifier", async () => {
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U999", null);
    await notificationsDb.removeRecipientByIdentifier(env.DB, "line", "U999");
    expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line")).toHaveLength(0);
  });
});

describe("getRecipient", () => {
  it("returns the matching recipient", async () => {
    const created = await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", null);
    expect(await notificationsDb.getRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", created.id)).toEqual(created);
  });

  it("returns null when the id or channel does not match", async () => {
    const created = await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", null);
    expect(await notificationsDb.getRecipient(env.DB, TEST_HOUSEHOLD_ID, "email", created.id)).toBeNull();
    expect(await notificationsDb.getRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "missing")).toBeNull();
  });

  it("returns null when the recipient belongs to a different household", async () => {
    const created = await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", null);
    await setupTestHousehold("other-household", "other@example.com");
    expect(await notificationsDb.getRecipient(env.DB, "other-household", "line", created.id)).toBeNull();
  });
});

describe("recordNotificationLog / hasSuccessfulNotificationSince", () => {
  async function createItem(id: string) {
    return itemsDb.createItem(env.DB, {
      id,
      householdId: TEST_HOUSEHOLD_ID,
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
      await notificationsDb.hasSuccessfulNotificationSince(
        env.DB,
        TEST_HOUSEHOLD_ID,
        item.id,
        "line",
        "U123",
        "2026-07-01T15:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("returns true once a success log is recorded for that recipient", async () => {
    const item = await createItem("item-2");
    await notificationsDb.recordNotificationLog(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(
        env.DB,
        TEST_HOUSEHOLD_ID,
        item.id,
        "line",
        "U123",
        "2026-07-01T15:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("does not consider a different recipient's success as sent", async () => {
    const item = await createItem("item-3");
    await notificationsDb.recordNotificationLog(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(
        env.DB,
        TEST_HOUSEHOLD_ID,
        item.id,
        "line",
        "U456",
        "2026-07-01T15:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("ignores failed logs when checking for a successful send", async () => {
    const item = await createItem("item-4");
    await notificationsDb.recordNotificationLog(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "failed",
      errorMessage: "boom",
    });

    expect(
      await notificationsDb.hasSuccessfulNotificationSince(
        env.DB,
        TEST_HOUSEHOLD_ID,
        item.id,
        "line",
        "U123",
        "2026-07-01T15:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("does not consider a different household's success as sent", async () => {
    const item = await createItem("item-5");
    await notificationsDb.recordNotificationLog(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });

    await setupTestHousehold("other-household", "other@example.com");
    expect(
      await notificationsDb.hasSuccessfulNotificationSince(
        env.DB,
        "other-household",
        item.id,
        "line",
        "U123",
        "2026-07-01T15:00:00.000Z",
      ),
    ).toBe(false);
  });
});

describe("listAllEnabledChannelsByHousehold / listAllRecipients", () => {
  it("groups enabled channels and recipients by household", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "line", true);
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U123", null);
    await setupTestHousehold("other-household", "other@example.com");
    await notificationsDb.setNotificationEnabled(env.DB, "other-household", "email", true);
    await notificationsDb.addRecipient(env.DB, "other-household", "email", "them@example.com", null);

    const channelsByHousehold = await notificationsDb.listAllEnabledChannelsByHousehold(env.DB);
    expect(channelsByHousehold.get(TEST_HOUSEHOLD_ID)).toEqual(["line"]);
    expect(channelsByHousehold.get("other-household")).toEqual(["email"]);

    const recipients = await notificationsDb.listAllRecipients(env.DB);
    expect(recipients.get(`${TEST_HOUSEHOLD_ID}:line`)?.map((r) => r.identifier)).toEqual(["U123"]);
    expect(recipients.get("other-household:email")?.map((r) => r.identifier)).toEqual(["them@example.com"]);
  });
});

describe("listNotifiedItemIds", () => {
  it("returns only item ids with a successful log within the given window", async () => {
    const itemA = await itemsDb.createItem(env.DB, {
      id: "item-a",
      householdId: TEST_HOUSEHOLD_ID,
      name: "test",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });
    const itemB = await itemsDb.createItem(env.DB, {
      id: "item-b",
      householdId: TEST_HOUSEHOLD_ID,
      name: "test",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });
    await notificationsDb.recordNotificationLog(env.DB, {
      householdId: TEST_HOUSEHOLD_ID,
      itemId: itemA.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });

    const notified = await notificationsDb.listNotifiedItemIds(
      env.DB,
      TEST_HOUSEHOLD_ID,
      [itemA.id, itemB.id],
      "line",
      "U123",
      "2026-07-01T15:00:00.000Z",
    );
    expect(notified).toEqual(new Set([itemA.id]));
  });

  it("returns an empty set when given no item ids", async () => {
    const notified = await notificationsDb.listNotifiedItemIds(
      env.DB,
      TEST_HOUSEHOLD_ID,
      [],
      "line",
      "U123",
      "2026-07-01T15:00:00.000Z",
    );
    expect(notified.size).toBe(0);
  });
});

describe("recordNotificationLogBatch", () => {
  it("records one log row per item id", async () => {
    const itemA = await itemsDb.createItem(env.DB, {
      id: "item-a",
      householdId: TEST_HOUSEHOLD_ID,
      name: "test",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });
    const itemB = await itemsDb.createItem(env.DB, {
      id: "item-b",
      householdId: TEST_HOUSEHOLD_ID,
      name: "test",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-02",
    });

    await notificationsDb.recordNotificationLogBatch(
      env.DB,
      TEST_HOUSEHOLD_ID,
      [itemA.id, itemB.id],
      "line",
      "U123",
      "success",
    );

    const { results } = await env.DB.prepare("SELECT * FROM notification_log WHERE household_id = ?")
      .bind(TEST_HOUSEHOLD_ID)
      .all();
    expect(results).toHaveLength(2);
  });
});
