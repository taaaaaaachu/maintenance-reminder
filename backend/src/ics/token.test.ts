import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { getOrCreateIcsFeedToken, regenerateIcsFeedToken } from "./token.js";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
});

describe("getOrCreateIcsFeedToken", () => {
  it("creates a token on first call and returns the same token on subsequent calls", async () => {
    const first = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);
    const second = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("issues an independent token per household", async () => {
    await setupTestHousehold("other-household", "other@example.com");

    const mine = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);
    const theirs = await getOrCreateIcsFeedToken(env.DB, "other-household");

    expect(theirs).not.toBe(mine);
  });
});

describe("regenerateIcsFeedToken", () => {
  it("replaces the existing token with a new, different value", async () => {
    const original = await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);
    const regenerated = await regenerateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID);

    expect(regenerated).not.toBe(original);
    expect(await getOrCreateIcsFeedToken(env.DB, TEST_HOUSEHOLD_ID)).toBe(regenerated);
  });
});
