import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { getConfigValue, getHouseholdIdByIcsToken, setConfigValue } from "./appConfig.js";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM app_config").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
});

describe("getConfigValue", () => {
  it("returns null when the key does not exist", async () => {
    expect(await getConfigValue(env.DB, TEST_HOUSEHOLD_ID, "missing_key")).toBeNull();
  });
});

describe("setConfigValue", () => {
  it("stores a value that getConfigValue then returns", async () => {
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "some_key", "some_value");
    expect(await getConfigValue(env.DB, TEST_HOUSEHOLD_ID, "some_key")).toBe("some_value");
  });

  it("overwrites an existing value for the same key rather than duplicating it", async () => {
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "some_key", "first");
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "some_key", "second");

    expect(await getConfigValue(env.DB, TEST_HOUSEHOLD_ID, "some_key")).toBe("second");
    const { results } = await env.DB.prepare(
      "SELECT * FROM app_config WHERE household_id = ? AND key = 'some_key'",
    )
      .bind(TEST_HOUSEHOLD_ID)
      .all();
    expect(results).toHaveLength(1);
  });

  it("keeps different keys independent", async () => {
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "key_a", "a");
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "key_b", "b");

    expect(await getConfigValue(env.DB, TEST_HOUSEHOLD_ID, "key_a")).toBe("a");
    expect(await getConfigValue(env.DB, TEST_HOUSEHOLD_ID, "key_b")).toBe("b");
  });

  it("keeps the same key independent across households", async () => {
    await setupTestHousehold("other-household", "other@example.com");
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "shared_key", "a");
    await setConfigValue(env.DB, "other-household", "shared_key", "b");

    expect(await getConfigValue(env.DB, TEST_HOUSEHOLD_ID, "shared_key")).toBe("a");
    expect(await getConfigValue(env.DB, "other-household", "shared_key")).toBe("b");
  });
});

describe("getHouseholdIdByIcsToken", () => {
  it("resolves the household id from the stored ics_feed_token value", async () => {
    await setConfigValue(env.DB, TEST_HOUSEHOLD_ID, "ics_feed_token", "abc123");
    expect(await getHouseholdIdByIcsToken(env.DB, "abc123")).toBe(TEST_HOUSEHOLD_ID);
  });

  it("returns null for an unknown token", async () => {
    expect(await getHouseholdIdByIcsToken(env.DB, "does-not-exist")).toBeNull();
  });
});
