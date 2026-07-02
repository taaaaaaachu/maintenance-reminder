import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getConfigValue, setConfigValue } from "./appConfig.js";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM app_config").run();
});

describe("getConfigValue", () => {
  it("returns null when the key does not exist", async () => {
    expect(await getConfigValue(env.DB, "missing_key")).toBeNull();
  });
});

describe("setConfigValue", () => {
  it("stores a value that getConfigValue then returns", async () => {
    await setConfigValue(env.DB, "some_key", "some_value");
    expect(await getConfigValue(env.DB, "some_key")).toBe("some_value");
  });

  it("overwrites an existing value for the same key rather than duplicating it", async () => {
    await setConfigValue(env.DB, "some_key", "first");
    await setConfigValue(env.DB, "some_key", "second");

    expect(await getConfigValue(env.DB, "some_key")).toBe("second");
    const { results } = await env.DB.prepare("SELECT * FROM app_config WHERE key = 'some_key'").all();
    expect(results).toHaveLength(1);
  });

  it("keeps different keys independent", async () => {
    await setConfigValue(env.DB, "key_a", "a");
    await setConfigValue(env.DB, "key_b", "b");

    expect(await getConfigValue(env.DB, "key_a")).toBe("a");
    expect(await getConfigValue(env.DB, "key_b")).toBe("b");
  });
});
