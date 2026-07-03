import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders, setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { getOrCreateIcsFeedToken } from "../ics/token.js";

const BASE_URL = "https://example.com";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
});

function authFetch(url: string, options?: RequestInit, email: string = TEST_HOUSEHOLD_EMAIL) {
  return exports.default.fetch(url, {
    ...options,
    headers: { ...authHeaders(email), ...options?.headers },
  });
}

describe("GET /feed/:token.ics", () => {
  it("returns a calendar feed for the correct token", async () => {
    const token = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);

    const res = await exports.default.fetch(`${BASE_URL}/feed/${token}.ics`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(body).toContain("BEGIN:VCALENDAR");
  });

  it("includes items in the generated feed", async () => {
    const token = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);
    await authFetch(`${BASE_URL}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "洗濯機のフィルター掃除", intervalDays: 14 }),
    });

    const res = await exports.default.fetch(`${BASE_URL}/feed/${token}.ics`);
    const body = await res.text();

    expect(body).toContain("洗濯機のフィルター掃除");
  });

  it("returns 404 for an incorrect token", async () => {
    await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);

    const res = await exports.default.fetch(`${BASE_URL}/feed/wrong-token.ics`);
    expect(res.status).toBe(404);
  });

  it("only includes items belonging to the token's own household", async () => {
    await setupTestHousehold("other-household", "other@example.com");
    const myToken = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);
    const theirToken = await getOrCreateIcsFeedToken(env.DB, "other-household");

    await authFetch(`${BASE_URL}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "自宅のアイテム", intervalDays: 14 }),
    });
    await authFetch(
      `${BASE_URL}/api/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "実家のアイテム", intervalDays: 14 }),
      },
      "other@example.com",
    );

    const myFeed = await (await exports.default.fetch(`${BASE_URL}/feed/${myToken}.ics`)).text();
    expect(myFeed).toContain("自宅のアイテム");
    expect(myFeed).not.toContain("実家のアイテム");

    const theirFeed = await (await exports.default.fetch(`${BASE_URL}/feed/${theirToken}.ics`)).text();
    expect(theirFeed).toContain("実家のアイテム");
    expect(theirFeed).not.toContain("自宅のアイテム");
  });
});
