import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { todayJstDateString } from "../lib/date.js";

const BASE_URL = "https://example.com";

async function clearItems() {
  await env.DB.prepare("DELETE FROM item_history").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM app_config").run();
}

beforeEach(async () => {
  await clearItems();
});

async function createItem(body: Record<string, unknown>) {
  const res = await exports.default.fetch(`${BASE_URL}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, json: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/items", () => {
  it("creates an item defaulting lastDoneAt/nextDueAt to today when omitted", async () => {
    const { res, json } = await createItem({ name: "洗濯機のフィルター掃除", intervalDays: 14 });

    expect(res.status).toBe(201);
    expect(json.name).toBe("洗濯機のフィルター掃除");
    expect(json.intervalDays).toBe(14);
    expect(json.lastDoneAt).toBe(todayJstDateString());

    const expectedDue = new Date(`${json.lastDoneAt}T00:00:00Z`);
    expectedDue.setUTCDate(expectedDue.getUTCDate() + 14);
    expect(json.nextDueAt).toBe(expectedDue.toISOString().slice(0, 10));
  });

  it("uses the provided lastDoneAt to compute nextDueAt", async () => {
    const { json } = await createItem({ name: "加湿器の掃除", intervalDays: 30, lastDoneAt: "2026-06-01" });
    expect(json.lastDoneAt).toBe("2026-06-01");
    expect(json.nextDueAt).toBe("2026-07-01");
  });

  it("rejects a missing name with 400", async () => {
    const { res, json } = await createItem({ intervalDays: 7 });
    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("rejects a non-positive intervalDays with 400", async () => {
    const { res } = await createItem({ name: "x", intervalDays: 0 });
    expect(res.status).toBe(400);
  });

  it("defaults notifyDaysBefore to 0 when omitted", async () => {
    const { json } = await createItem({ name: "item", intervalDays: 7 });
    expect(json.notifyDaysBefore).toBe(0);
  });

  it("accepts a provided notifyDaysBefore", async () => {
    const { json } = await createItem({ name: "item", intervalDays: 7, notifyDaysBefore: 3 });
    expect(json.notifyDaysBefore).toBe(3);
  });

  it("rejects a negative notifyDaysBefore with 400", async () => {
    const { res } = await createItem({ name: "item", intervalDays: 7, notifyDaysBefore: -1 });
    expect(res.status).toBe(400);
  });

  it("defaults notifyTime to 07:00 when omitted", async () => {
    const { json } = await createItem({ name: "item", intervalDays: 7 });
    expect(json.notifyTime).toBe("07:00");
  });

  it("accepts a provided notifyTime on a 30-minute boundary", async () => {
    const { json } = await createItem({ name: "item", intervalDays: 7, notifyTime: "20:30" });
    expect(json.notifyTime).toBe("20:30");
  });

  it("rejects a notifyTime that isn't on a 30-minute boundary", async () => {
    const { res } = await createItem({ name: "item", intervalDays: 7, notifyTime: "20:15" });
    expect(res.status).toBe(400);
  });

  it("uses the configured default notify time when notifyTime is omitted", async () => {
    await exports.default.fetch(`${BASE_URL}/api/settings/default-notify-time`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: "19:30" }),
    });

    const { json } = await createItem({ name: "item", intervalDays: 7 });
    expect(json.notifyTime).toBe("19:30");
  });
});

describe("GET /api/items", () => {
  it("lists created items", async () => {
    await createItem({ name: "item1", intervalDays: 7 });
    await createItem({ name: "item2", intervalDays: 14 });

    const res = await exports.default.fetch(`${BASE_URL}/api/items`);
    const items = (await res.json()) as unknown[];

    expect(res.status).toBe(200);
    expect(items).toHaveLength(2);
  });
});

describe("GET /api/items/:id", () => {
  it("returns 404 for a non-existent item", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/items/missing`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/items/:id", () => {
  it("updates the item", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7 });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });
    const updated = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(updated.name).toBe("更新後");
  });

  it("updates notifyDaysBefore", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7 });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyDaysBefore: 5 }),
    });
    const updated = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(updated.notifyDaysBefore).toBe(5);
  });

  it("updates notifyTime", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7 });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyTime: "22:30" }),
    });
    const updated = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(updated.notifyTime).toBe("22:30");
  });

  it("returns 404 for a non-existent item", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/items/missing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/items/:id", () => {
  it("deletes the item and returns 204", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7 });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const getRes = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}`);
    expect(getRes.status).toBe(404);
  });
});

describe("POST /api/items/:id/complete", () => {
  it("sets lastDoneAt and advances nextDueAt by intervalDays", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 10, lastDoneAt: "2026-06-01" });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/complete`, { method: "POST" });
    const completed = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(completed.lastDoneAt).not.toBe("2026-06-01");
    expect(completed.nextDueAt).not.toBe(created.nextDueAt);
  });

  it("returns 404 for a non-existent item", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/items/missing/complete`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/items/:id/snooze", () => {
  it("defaults to 3 days when no body/days is provided", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7, lastDoneAt: "2026-06-01" });
    expect(created.nextDueAt).toBe("2026-06-08");

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/snooze`, { method: "POST" });
    const snoozed = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(snoozed.nextDueAt).toBe("2026-06-11");
  });

  it("uses the provided days", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7, lastDoneAt: "2026-06-01" });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 10 }),
    });
    const snoozed = (await res.json()) as Record<string, unknown>;

    expect(snoozed.nextDueAt).toBe("2026-06-18");
  });

  it("rejects a negative days value with 400", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7 });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: -1 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent item", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/items/missing/snooze`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/items/:id/history", () => {
  it("returns 404 for a non-existent item", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/items/missing/history`);
    expect(res.status).toBe(404);
  });

  it("returns complete and snooze events for the item, most recent first", async () => {
    const { json: created } = await createItem({ name: "item", intervalDays: 7, lastDoneAt: "2026-06-01" });

    await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 3 }),
    });
    await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/complete`, { method: "POST" });

    const res = await exports.default.fetch(`${BASE_URL}/api/items/${created.id}/history`);
    const history = (await res.json()) as Array<{ eventType: string }>;

    expect(res.status).toBe(200);
    expect(history.map((h) => h.eventType)).toEqual(["complete", "snooze"]);
  });
});
