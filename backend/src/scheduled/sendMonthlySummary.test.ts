import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { sendMonthlySummary } from "./sendMonthlySummary.js";

const OTHER_HOUSEHOLD_ID = "other-household";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
}

const fetchMock = vi.fn();

beforeEach(async () => {
  await clearAll();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  // 2026-07-31T15:00:00Z is 2026-08-01 00:00 JST.
  vi.setSystemTime(new Date("2026-07-31T22:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sendMonthlySummary", () => {
  it("sends the previous month's summary to every recipient of an enabled channel", async () => {
    const item = await itemsDb.createItem(env.DB, {
      id: "item-a",
      householdId: TEST_HOUSEHOLD_ID,
      name: "アイテムA",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-05",
      nextDueAt: "2026-07-12",
    });
    await itemsDb.completeItem(env.DB, TEST_HOUSEHOLD_ID, item.id, "2026-07-05", TEST_HOUSEHOLD_EMAIL);
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "pushover", true);
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "pushover", "user-key-1", null);

    await sendMonthlySummary(env);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("title")).toContain("2026年7月");
    expect(body.get("message")).toContain("アイテムA");
  });

  it("does not send twice within the same month", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "pushover", true);
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "pushover", "user-key-1", null);

    await sendMonthlySummary(env);
    await sendMonthlySummary(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no channel is enabled", async () => {
    await sendMonthlySummary(env);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an independent summary per household, scoped to that household's own data", async () => {
    await setupTestHousehold(OTHER_HOUSEHOLD_ID, "other@example.com");

    const myItem = await itemsDb.createItem(env.DB, {
      id: "home-item",
      householdId: TEST_HOUSEHOLD_ID,
      name: "自宅アイテム",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-05",
      nextDueAt: "2026-07-12",
    });
    await itemsDb.completeItem(env.DB, TEST_HOUSEHOLD_ID, myItem.id, "2026-07-05", TEST_HOUSEHOLD_EMAIL);

    const theirItem = await itemsDb.createItem(env.DB, {
      id: "other-item",
      householdId: OTHER_HOUSEHOLD_ID,
      name: "実家アイテム",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-10",
      nextDueAt: "2026-07-17",
    });
    await itemsDb.completeItem(env.DB, OTHER_HOUSEHOLD_ID, theirItem.id, "2026-07-10", "other@example.com");

    await notificationsDb.setNotificationEnabled(env.DB, TEST_HOUSEHOLD_ID, "pushover", true);
    await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "pushover", "my-key", null);
    await notificationsDb.setNotificationEnabled(env.DB, OTHER_HOUSEHOLD_ID, "email", true);
    await notificationsDb.addRecipient(env.DB, OTHER_HOUSEHOLD_ID, "email", "their@example.com", null);

    await sendMonthlySummary(env);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pushoverCall = fetchMock.mock.calls.find((call) => (call[0] as string).includes("pushover")) as [
      string,
      RequestInit,
    ];
    const pushoverBody = new URLSearchParams(pushoverCall[1].body as string);
    expect(pushoverBody.get("message")).toContain("自宅アイテム");
    expect(pushoverBody.get("message")).not.toContain("実家アイテム");
  });
});
