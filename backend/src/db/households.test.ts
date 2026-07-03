import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as householdsDb from "./households.js";
import * as itemsDb from "./queries.js";
import * as notificationsDb from "./notifications.js";
import { setConfigValue } from "./appConfig.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM household_invites").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
}

beforeEach(async () => {
  await clearAll();
});

describe("createHousehold / getHousehold", () => {
  it("creates a household with no members", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "自宅");
    const household = await householdsDb.getHousehold(env.DB, "h1");

    expect(household).toMatchObject({ id: "h1", name: "自宅", members: [] });
  });

  it("returns null for a non-existent household", async () => {
    expect(await householdsDb.getHousehold(env.DB, "missing")).toBeNull();
  });
});

describe("addHouseholdMember", () => {
  it("adds multiple members to the same household", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "father@example.com", "父");
    await householdsDb.addHouseholdMember(env.DB, "h1", "mother@example.com", "母");

    const household = await householdsDb.getHousehold(env.DB, "h1");
    expect(household?.members).toHaveLength(2);
    expect(household?.members.map((m) => m.email).sort()).toEqual(["father@example.com", "mother@example.com"]);
    expect(household?.members.find((m) => m.email === "father@example.com")?.displayName).toBe("父");
  });

  it("allows a null display name", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    const member = await householdsDb.addHouseholdMember(env.DB, "h1", "someone@example.com", null);
    expect(member.displayName).toBeNull();
  });
});

describe("getHouseholdIdByEmail", () => {
  it("resolves the household a member's email belongs to", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "father@example.com", "父");

    expect(await householdsDb.getHouseholdIdByEmail(env.DB, "father@example.com")).toBe("h1");
  });

  it("returns null for an unregistered email", async () => {
    expect(await householdsDb.getHouseholdIdByEmail(env.DB, "unknown@example.com")).toBeNull();
  });
});

describe("deleteHousehold", () => {
  it("removes the household along with its members, invites, items, and notification data", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "father@example.com", "父");
    const item = await itemsDb.createItem(env.DB, {
      id: "item-1",
      householdId: "h1",
      name: "テストアイテム",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-08",
    });
    await itemsDb.completeItem(env.DB, "h1", item.id, "2026-07-01", "father@example.com");
    await notificationsDb.setNotificationEnabled(env.DB, "h1", "line", true);
    await notificationsDb.addRecipient(env.DB, "h1", "line", "U123", null);
    await notificationsDb.recordNotificationLog(env.DB, {
      householdId: "h1",
      itemId: item.id,
      channel: "line",
      recipientIdentifier: "U123",
      status: "success",
    });
    await setConfigValue(env.DB, "h1", "ics_feed_token", "some-token");

    await householdsDb.deleteHousehold(env.DB, "h1");

    expect(await householdsDb.getHousehold(env.DB, "h1")).toBeNull();
    expect(await householdsDb.getHouseholdIdByEmail(env.DB, "father@example.com")).toBeNull();
    expect(await itemsDb.getItem(env.DB, "h1", item.id)).toBeNull();
    expect(await notificationsDb.listRecipients(env.DB, "h1", "line")).toEqual([]);
    const remainingLogs = await env.DB.prepare("SELECT * FROM notification_log WHERE household_id = ?")
      .bind("h1")
      .all();
    expect(remainingLogs.results).toHaveLength(0);
    const remainingHistory = await env.DB.prepare("SELECT * FROM item_history WHERE household_id = ?")
      .bind("h1")
      .all();
    expect(remainingHistory.results).toHaveLength(0);
    const remainingSettings = await env.DB.prepare("SELECT * FROM notification_settings WHERE household_id = ?")
      .bind("h1")
      .all();
    expect(remainingSettings.results).toHaveLength(0);
    const remainingConfig = await env.DB.prepare("SELECT * FROM app_config WHERE household_id = ?")
      .bind("h1")
      .all();
    expect(remainingConfig.results).toHaveLength(0);
  });

  it("does not affect other households' data", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    await householdsDb.createHousehold(env.DB, "h2", "自宅");
    await householdsDb.addHouseholdMember(env.DB, "h2", "me@example.com", null);
    await itemsDb.createItem(env.DB, {
      id: "item-h2",
      householdId: "h2",
      name: "自宅アイテム",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-01",
      nextDueAt: "2026-07-08",
    });

    await householdsDb.deleteHousehold(env.DB, "h1");

    expect(await householdsDb.getHousehold(env.DB, "h2")).not.toBeNull();
    expect(await itemsDb.getItem(env.DB, "h2", "item-h2")).not.toBeNull();
  });

  it("is a no-op when the household does not exist", async () => {
    await expect(householdsDb.deleteHousehold(env.DB, "missing")).resolves.toBeUndefined();
  });
});

describe("listHouseholds", () => {
  it("lists all households with their members", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "自宅");
    await householdsDb.createHousehold(env.DB, "h2", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "me@example.com", null);
    await householdsDb.addHouseholdMember(env.DB, "h2", "father@example.com", "父");
    await householdsDb.addHouseholdMember(env.DB, "h2", "mother@example.com", "母");

    const households = await householdsDb.listHouseholds(env.DB);

    expect(households).toHaveLength(2);
    const h1 = households.find((h) => h.id === "h1");
    const h2 = households.find((h) => h.id === "h2");
    expect(h1?.members).toHaveLength(1);
    expect(h2?.members).toHaveLength(2);
  });

  it("returns an empty array when there are no households", async () => {
    expect(await householdsDb.listHouseholds(env.DB)).toEqual([]);
  });
});
