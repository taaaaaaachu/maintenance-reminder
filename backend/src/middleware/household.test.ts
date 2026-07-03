import { Hono } from "hono";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { householdMiddleware } from "./household.js";
import { HttpError } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
}

beforeEach(async () => {
  await clearAll();
});

function buildApp() {
  const app = new Hono<HonoEnv>();
  app.use("*", householdMiddleware);
  app.get("/whoami", (c) => c.json({ householdId: c.get("householdId"), actorEmail: c.get("actorEmail") }));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { message: err.message, code: err.code } }, err.status as 401);
    throw err;
  });
  return app;
}

describe("householdMiddleware", () => {
  it("resolves householdId and actorEmail from the Access header", async () => {
    const app = buildApp();
    const res = await app.request(
      "/whoami",
      { headers: { "cf-access-authenticated-user-email": TEST_HOUSEHOLD_EMAIL } },
      env,
    );
    const json = (await res.json()) as { householdId: string; actorEmail: string };

    expect(res.status).toBe(200);
    expect(json.householdId).toBe(TEST_HOUSEHOLD_ID);
    expect(json.actorEmail).toBe(TEST_HOUSEHOLD_EMAIL);
  });

  it("is case-insensitive and trims whitespace on the email header", async () => {
    const app = buildApp();
    const res = await app.request(
      "/whoami",
      { headers: { "cf-access-authenticated-user-email": `  ${TEST_HOUSEHOLD_EMAIL.toUpperCase()}  ` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 when no Access header is present", async () => {
    const app = buildApp();
    const res = await app.request("/whoami", undefined, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 for an email not registered to any household", async () => {
    const app = buildApp();
    const res = await app.request(
      "/whoami",
      { headers: { "cf-access-authenticated-user-email": "unknown@example.com" } },
      env,
    );
    expect(res.status).toBe(401);
  });
});
