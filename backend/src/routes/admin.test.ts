import { Hono } from "hono";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { adminRouter } from "./admin.js";
import { HttpError } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";

const BASE_URL = "https://example.com";

async function clearAll() {
  await env.DB.prepare("DELETE FROM household_invites").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
}

beforeEach(async () => {
  await clearAll();
});

function adminFetch(url: string, options?: RequestInit) {
  return exports.default.fetch(url, {
    ...options,
    headers: { "cf-access-authenticated-user-email": env.ADMIN_EMAIL, ...options?.headers },
  });
}

describe("admin API authorization", () => {
  it("rejects requests without the admin email header", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/admin/households`);
    expect(res.status).toBe(401);
  });

  it("rejects requests from a non-admin email", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/admin/households`, {
      headers: { "cf-access-authenticated-user-email": "someone-else@example.com" },
    });
    expect(res.status).toBe(401);
  });

  it("falls back to DEV_HOUSEHOLD_EMAIL when no Access header is present (local dev only)", async () => {
    const app = new Hono<HonoEnv>();
    app.route("/api/admin", adminRouter);
    app.onError((err, c) => {
      if (err instanceof HttpError) return c.json({ error: { message: err.message, code: err.code } }, err.status as 401);
      throw err;
    });

    const allowed = await app.request(
      "/api/admin/households",
      undefined,
      { ...env, DEV_HOUSEHOLD_EMAIL: env.ADMIN_EMAIL },
    );
    expect(allowed.status).toBe(200);

    const rejected = await app.request(
      "/api/admin/households",
      undefined,
      { ...env, DEV_HOUSEHOLD_EMAIL: "someone-else@example.com" },
    );
    expect(rejected.status).toBe(401);
  });
});

describe("POST /api/admin/households", () => {
  it("creates a household", async () => {
    const res = await adminFetch(`${BASE_URL}/api/admin/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "実家" }),
    });
    const json = (await res.json()) as { id: string; name: string; members: unknown[] };

    expect(res.status).toBe(201);
    expect(json.name).toBe("実家");
    expect(json.members).toEqual([]);
  });

  it("rejects an empty name", async () => {
    const res = await adminFetch(`${BASE_URL}/api/admin/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/households", () => {
  it("lists households with their members", async () => {
    await adminFetch(`${BASE_URL}/api/admin/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "実家" }),
    });

    const res = await adminFetch(`${BASE_URL}/api/admin/households`);
    const json = (await res.json()) as Array<{ name: string }>;

    expect(res.status).toBe(200);
    expect(json.map((h) => h.name)).toEqual(["実家"]);
  });
});

describe("POST /api/admin/households/:id/members", () => {
  it("adds a member to an existing household", async () => {
    const createRes = await adminFetch(`${BASE_URL}/api/admin/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "実家" }),
    });
    const household = (await createRes.json()) as { id: string };

    const res = await adminFetch(`${BASE_URL}/api/admin/households/${household.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Father@Example.com", displayName: "父" }),
    });
    const member = (await res.json()) as { email: string; displayName: string | null };

    expect(res.status).toBe(201);
    expect(member.email).toBe("father@example.com");
    expect(member.displayName).toBe("父");
  });

  it("returns 404 for a non-existent household", async () => {
    const res = await adminFetch(`${BASE_URL}/api/admin/households/missing/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "father@example.com" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid email", async () => {
    const createRes = await adminFetch(`${BASE_URL}/api/admin/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "実家" }),
    });
    const household = (await createRes.json()) as { id: string };

    const res = await adminFetch(`${BASE_URL}/api/admin/households/${household.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/households/:id/invites", () => {
  it("issues an invite code for the household", async () => {
    const createRes = await adminFetch(`${BASE_URL}/api/admin/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "実家" }),
    });
    const household = (await createRes.json()) as { id: string };

    const res = await adminFetch(`${BASE_URL}/api/admin/households/${household.id}/invites`, {
      method: "POST",
    });
    const json = (await res.json()) as { code: string };

    expect(res.status).toBe(201);
    expect(json.code).toHaveLength(8);
  });

  it("returns 404 for a non-existent household", async () => {
    const res = await adminFetch(`${BASE_URL}/api/admin/households/missing/invites`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
