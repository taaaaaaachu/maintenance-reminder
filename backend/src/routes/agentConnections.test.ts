import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders, setupTestHousehold, TEST_HOUSEHOLD_EMAIL } from "../../test/helpers.js";

const BASE_URL = "https://example.com";

beforeEach(async () => {
  for (const t of ["agent_connections", "household_members", "households"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await setupTestHousehold();
  await env.DB.prepare("INSERT INTO household_members (id, household_id, email) VALUES ('m2', 'test-household', 'family@example.com')").run();
  await setupTestHousehold("other", "other@example.com");
});

const api = (path: string, init: RequestInit = {}, email = TEST_HOUSEHOLD_EMAIL) =>
  exports.default.fetch(`${BASE_URL}/api/agent-connections${path}`, {
    ...init,
    headers: { ...authHeaders(email), "content-type": "application/json", ...init.headers },
  });

describe("/api/agent-connections", () => {
  it("認証が必要", async () => {
    expect((await exports.default.fetch(`${BASE_URL}/api/agent-connections`)).status).toBe(401);
  });

  it("手動発行したトークンは一度だけ返り、世帯の誰でも一覧で見て取り消せる", async () => {
    const res = await api("", { method: "POST", body: JSON.stringify({ name: " dots " }) });
    expect(res.status).toBe(201);
    const { id, token } = (await res.json()) as { id: string; token: string };
    expect(token).toMatch(/^mra_/);

    const list = (await (await api("", {}, "family@example.com")).json()) as Array<Record<string, unknown>>;
    expect(list).toEqual([expect.objectContaining({ id, name: "dots", issuerEmail: TEST_HOUSEHOLD_EMAIL, origin: "手動発行" })]);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(await (await api("", {}, "other@example.com")).json()).toEqual([]);

    expect((await api(`/${id}`, { method: "DELETE" }, "other@example.com")).status).toBe(404);
    expect((await api(`/${id}`, { method: "DELETE" }, "family@example.com")).status).toBe(204);
    expect(await (await api("")).json()).toEqual([]);
  });

  it("名前がなければ400", async () => {
    expect((await api("", { method: "POST", body: JSON.stringify({ name: "" }) })).status).toBe(400);
  });
});
