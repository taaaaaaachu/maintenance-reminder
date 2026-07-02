import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateIcsFeedToken, regenerateIcsFeedToken } from "./token.js";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM app_config").run();
});

describe("getOrCreateIcsFeedToken", () => {
  it("creates a token on first call and returns the same token on subsequent calls", async () => {
    const first = await getOrCreateIcsFeedToken(env.DB);
    const second = await getOrCreateIcsFeedToken(env.DB);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });
});

describe("regenerateIcsFeedToken", () => {
  it("replaces the existing token with a new, different value", async () => {
    const original = await getOrCreateIcsFeedToken(env.DB);
    const regenerated = await regenerateIcsFeedToken(env.DB);

    expect(regenerated).not.toBe(original);
    expect(await getOrCreateIcsFeedToken(env.DB)).toBe(regenerated);
  });
});
