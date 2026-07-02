import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateIcsFeedToken } from "../ics/token.js";

const BASE_URL = "https://example.com";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM app_config").run();
});

describe("GET /feed/:token.ics", () => {
  it("returns a calendar feed for the correct token", async () => {
    const token = await getOrCreateIcsFeedToken(env.DB);

    const res = await exports.default.fetch(`${BASE_URL}/feed/${token}.ics`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(body).toContain("BEGIN:VCALENDAR");
  });

  it("includes items in the generated feed", async () => {
    const token = await getOrCreateIcsFeedToken(env.DB);
    await exports.default.fetch(`${BASE_URL}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "洗濯機のフィルター掃除", intervalDays: 14 }),
    });

    const res = await exports.default.fetch(`${BASE_URL}/feed/${token}.ics`);
    const body = await res.text();

    expect(body).toContain("洗濯機のフィルター掃除のお手入れ");
  });

  it("returns 404 for an incorrect token", async () => {
    await getOrCreateIcsFeedToken(env.DB);

    const res = await exports.default.fetch(`${BASE_URL}/feed/wrong-token.ics`);
    expect(res.status).toBe(404);
  });
});
