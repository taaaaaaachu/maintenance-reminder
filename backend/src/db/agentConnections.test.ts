import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import {
  AGENT_IDLE_TTL_MS,
  ACCESS_TOKEN_TTL_MS,
  authenticateAgent,
  createOAuthConnection,
  issueManualConnection,
  listAgentConnections,
  normalizeAgentName,
  refreshConnection,
  revokeAgentConnection,
  revokeByToken,
} from "./agentConnections.js";

const NOW = Date.UTC(2026, 9, 25);
const grant = { householdId: TEST_HOUSEHOLD_ID, issuerEmail: TEST_HOUSEHOLD_EMAIL, clientId: "dcr_x", name: "muse" };

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM agent_connections").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
});

describe("normalizeAgentName", () => {
  it("前後の空白を除き、空・長すぎはnull", () => {
    expect(normalizeAgentName("  muse ")).toBe("muse");
    expect(normalizeAgentName("  ")).toBeNull();
    expect(normalizeAgentName("x".repeat(51))).toBeNull();
    expect(normalizeAgentName(1)).toBeNull();
  });
});

describe("手動発行", () => {
  it("発行したトークンで世帯と発行者が分かり、期限はない", async () => {
    const { token } = await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "dots", NOW);
    expect(token).toMatch(/^mra_/);
    expect(await authenticateAgent(env.DB, token, NOW + AGENT_IDLE_TTL_MS - 1)).toMatchObject({
      householdId: TEST_HOUSEHOLD_ID,
      issuerEmail: TEST_HOUSEHOLD_EMAIL,
    });
  });

  it("90日使われなかった接続は使えず、消える", async () => {
    const { token } = await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "dots", NOW);
    expect(await authenticateAgent(env.DB, token, NOW + AGENT_IDLE_TTL_MS + 1)).toBeNull();
    expect(await listAgentConnections(env.DB, TEST_HOUSEHOLD_ID, NOW)).toEqual([]);
  });

  it("発行者が世帯から外れたら使えない", async () => {
    const { token } = await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "dots", NOW);
    await env.DB.prepare("DELETE FROM household_members").run();
    expect(await authenticateAgent(env.DB, token, NOW)).toBeNull();
  });

  it("世帯を消すと接続も消える", async () => {
    await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "dots", NOW);
    await env.DB.prepare("DELETE FROM households").run();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM agent_connections").first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("不明なトークンはnull", async () => {
    expect(await authenticateAgent(env.DB, "mra_unknown", NOW)).toBeNull();
  });
});

describe("OAuthの接続", () => {
  it("アクセストークンは1時間で切れる", async () => {
    const t = await createOAuthConnection(env.DB, grant, NOW);
    expect(t.expiresIn).toBe(3600);
    expect(await authenticateAgent(env.DB, t.accessToken, NOW + ACCESS_TOKEN_TTL_MS - 1)).not.toBeNull();
    expect(await authenticateAgent(env.DB, t.accessToken, NOW + ACCESS_TOKEN_TTL_MS)).toBeNull();
  });

  it("同じクライアント・同じ発行者で繋ぎ直すと置き換わる", async () => {
    await createOAuthConnection(env.DB, grant, NOW);
    await createOAuthConnection(env.DB, grant, NOW);
    expect(await listAgentConnections(env.DB, TEST_HOUSEHOLD_ID, NOW)).toHaveLength(1);
  });

  it("リフレッシュで入れ替わり、古いトークンが再び使われたら接続ごと消える", async () => {
    const first = await createOAuthConnection(env.DB, grant, NOW);
    expect(await refreshConnection(env.DB, first.refreshToken, "dcr_other", NOW)).toBeNull();
    const second = await refreshConnection(env.DB, first.refreshToken, grant.clientId, NOW);
    expect(second).not.toBeNull();
    expect(await authenticateAgent(env.DB, first.accessToken, NOW)).toBeNull();
    expect(await authenticateAgent(env.DB, second!.accessToken, NOW)).not.toBeNull();

    expect(await refreshConnection(env.DB, first.refreshToken, grant.clientId, NOW)).toBeNull();
    expect(await authenticateAgent(env.DB, second!.accessToken, NOW)).toBeNull();
    expect(await refreshConnection(env.DB, second!.refreshToken, grant.clientId, NOW)).toBeNull();
  });

  it("発行者が世帯から外れたらリフレッシュできない", async () => {
    const t = await createOAuthConnection(env.DB, grant, NOW);
    await env.DB.prepare("DELETE FROM household_members").run();
    expect(await refreshConnection(env.DB, t.refreshToken, grant.clientId, NOW)).toBeNull();
  });

  it("revokeByTokenはそのクライアントのトークンだけ接続ごと消す", async () => {
    const t = await createOAuthConnection(env.DB, grant, NOW);
    await revokeByToken(env.DB, t.accessToken, "dcr_other");
    expect(await authenticateAgent(env.DB, t.accessToken, NOW)).not.toBeNull();
    await revokeByToken(env.DB, t.refreshToken, grant.clientId);
    expect(await authenticateAgent(env.DB, t.accessToken, NOW)).toBeNull();
  });
});

describe("一覧と取り消し", () => {
  it("世帯の接続だけを新しい順に出し、世帯内なら誰でも取り消せる", async () => {
    await setupTestHousehold("other", "other@example.com");
    await issueManualConnection(env.DB, "other", "other@example.com", "よその", NOW);
    const a = await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "古い", NOW);
    await createOAuthConnection(env.DB, { ...grant, clientId: "https://agent.example/client.json" }, NOW + 1);

    const list = await listAgentConnections(env.DB, TEST_HOUSEHOLD_ID, NOW + 1);
    expect(list.map((c) => [c.name, c.origin])).toEqual([
      ["muse", "agent.example"],
      ["古い", "手動発行"],
    ]);
    expect(await revokeAgentConnection(env.DB, "other", a.id)).toBe(false);
    expect(await revokeAgentConnection(env.DB, TEST_HOUSEHOLD_ID, a.id)).toBe(true);
    expect(await authenticateAgent(env.DB, a.token, NOW)).toBeNull();
  });
});
