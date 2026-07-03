import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import * as householdsDb from "./households.js";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM items").run();
  await env.DB.prepare("DELETE FROM household_invites").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
}

beforeEach(async () => {
  await clearAll();
});

describe("createHousehold / getHousehold", () => {
  it("creates a household with no members", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "自宅");
    const household = await householdsDb.getHousehold(env.DB, "h1");

    expect(household).toMatchObject({ id: "h1", name: "自宅", members: [] });
  });

  it("returns null for a non-existent household", async () => {
    expect(await householdsDb.getHousehold(env.DB, "missing")).toBeNull();
  });
});

describe("addHouseholdMember", () => {
  it("adds multiple members to the same household", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "father@example.com", "父");
    await householdsDb.addHouseholdMember(env.DB, "h1", "mother@example.com", "母");

    const household = await householdsDb.getHousehold(env.DB, "h1");
    expect(household?.members).toHaveLength(2);
    expect(household?.members.map((m) => m.email).sort()).toEqual(["father@example.com", "mother@example.com"]);
    expect(household?.members.find((m) => m.email === "father@example.com")?.displayName).toBe("父");
  });

  it("allows a null display name", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    const member = await householdsDb.addHouseholdMember(env.DB, "h1", "someone@example.com", null);
    expect(member.displayName).toBeNull();
  });
});

describe("getHouseholdIdByEmail", () => {
  it("resolves the household a member's email belongs to", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "father@example.com", "父");

    expect(await householdsDb.getHouseholdIdByEmail(env.DB, "father@example.com")).toBe("h1");
  });

  it("returns null for an unregistered email", async () => {
    expect(await householdsDb.getHouseholdIdByEmail(env.DB, "unknown@example.com")).toBeNull();
  });
});

describe("listHouseholds", () => {
  it("lists all households with their members", async () => {
    await householdsDb.createHousehold(env.DB, "h1", "自宅");
    await householdsDb.createHousehold(env.DB, "h2", "実家");
    await householdsDb.addHouseholdMember(env.DB, "h1", "me@example.com", null);
    await householdsDb.addHouseholdMember(env.DB, "h2", "father@example.com", "父");
    await householdsDb.addHouseholdMember(env.DB, "h2", "mother@example.com", "母");

    const households = await householdsDb.listHouseholds(env.DB);

    expect(households).toHaveLength(2);
    const h1 = households.find((h) => h.id === "h1");
    const h2 = households.find((h) => h.id === "h2");
    expect(h1?.members).toHaveLength(1);
    expect(h2?.members).toHaveLength(2);
  });

  it("returns an empty array when there are no households", async () => {
    expect(await householdsDb.listHouseholds(env.DB)).toEqual([]);
  });
});
