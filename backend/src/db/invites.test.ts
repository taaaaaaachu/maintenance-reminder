import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as householdsDb from "./households.js";
import * as invitesDb from "./invites.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM household_invites").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await householdsDb.createHousehold(env.DB, "h1", "実家");
}

beforeEach(async () => {
  await clearAll();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createInvite / consumeInvite", () => {
  it("issues a code that resolves to the household it was created for", async () => {
    const code = await invitesDb.createInvite(env.DB, "h1", null);
    expect(code).toHaveLength(8);

    expect(await invitesDb.consumeInvite(env.DB, code)).toBe("h1");
  });

  it("cannot be used a second time", async () => {
    const code = await invitesDb.createInvite(env.DB, "h1", null);

    await invitesDb.consumeInvite(env.DB, code);
    expect(await invitesDb.consumeInvite(env.DB, code)).toBeNull();
  });

  it("returns null for an unknown code", async () => {
    expect(await invitesDb.consumeInvite(env.DB, "NOTACODE")).toBeNull();
  });

  it("returns null once the code has expired", async () => {
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    const code = await invitesDb.createInvite(env.DB, "h1", "2026-07-01T00:00:00.000Z");

    vi.setSystemTime(new Date("2026-07-02T00:00:00Z"));
    expect(await invitesDb.consumeInvite(env.DB, code)).toBeNull();
  });

  it("accepts a code that has not yet expired", async () => {
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    const code = await invitesDb.createInvite(env.DB, "h1", "2026-07-08T00:00:00.000Z");

    vi.setSystemTime(new Date("2026-07-02T00:00:00Z"));
    expect(await invitesDb.consumeInvite(env.DB, code)).toBe("h1");
  });
});
