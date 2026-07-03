import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { sendMonthlySummary } from "./sendMonthlySummary.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM items").run();
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
      name: "アイテムA",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "07:00",
      memo: null,
      lastDoneAt: "2026-07-05",
      nextDueAt: "2026-07-12",
    });
    await itemsDb.completeItem(env.DB, item.id, "2026-07-05");
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await sendMonthlySummary(env);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("title")).toContain("2026年7月");
    expect(body.get("message")).toContain("アイテムA");
  });

  it("does not send twice within the same month", async () => {
    await notificationsDb.setNotificationEnabled(env.DB, "pushover", true);
    await notificationsDb.addRecipient(env.DB, "pushover", "user-key-1", null);

    await sendMonthlySummary(env);
    await sendMonthlySummary(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no channel is enabled", async () => {
    await sendMonthlySummary(env);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
