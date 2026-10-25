import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { AGENT_IDLE_TTL_MS, createOAuthConnection, issueManualConnection } from "../db/agentConnections.js";
import {
  consumeAuthorizationCode,
  isRegisteredRedirectUri,
  issueAuthorizationCode,
  parseAuthorizeRequest,
  parseClientIdUrl,
  purgeExpiredOAuthData,
  redirectWith,
  registerClient,
  resolveClient,
  UNUSED_CLIENT_TTL_MS,
  validateClientMetadata,
  validateRegistration,
  verifyPkce,
} from "./oauth.js";

const NOW = Date.UTC(2026, 9, 25);
// RFC 7636 付録Bの例
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

beforeEach(async () => {
  for (const t of ["oauth_codes", "oauth_clients", "agent_connections", "household_members", "households"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  await setupTestHousehold();
});

describe("parseClientIdUrl", () => {
  it("httpsでパス付きのURLだけ受け付ける", () => {
    expect(parseClientIdUrl("https://agent.example/client.json")).not.toBeNull();
    for (const bad of [
      "http://agent.example/client.json",
      "https://agent.example/",
      "https://u:p@agent.example/c",
      "https://agent.example/c#x",
      "https://agent.example/a/../c",
      "not a url",
    ])
      expect(parseClientIdUrl(bad)).toBeNull();
  });
});

describe("validateClientMetadata", () => {
  const id = "https://agent.example/client.json";
  it("client_idの一致・redirect_uris・公開クライアントを求める", () => {
    expect(validateClientMetadata(id, { client_id: id, redirect_uris: ["https://agent.example/cb"], client_name: " A " })).toEqual({
      clientId: id,
      clientName: "A",
      redirectUris: ["https://agent.example/cb"],
      kind: "cimd",
    });
    expect(validateClientMetadata(id, { client_id: "https://evil.example/c", redirect_uris: ["https://x/cb"] })).toBeTypeOf("string");
    expect(validateClientMetadata(id, { client_id: id, redirect_uris: [] })).toBeTypeOf("string");
    expect(
      validateClientMetadata(id, { client_id: id, redirect_uris: ["https://x/cb"], token_endpoint_auth_method: "client_secret_basic" }),
    ).toBeTypeOf("string");
  });
});

describe("resolveClient", () => {
  it("CIMDは取得して検証し、取得の失敗は理由を返す", async () => {
    const id = "https://agent.example/client.json";
    const ok = await resolveClient(env.DB, id, async () => ({ client_id: id, redirect_uris: ["https://agent.example/cb"] }));
    expect(ok).toMatchObject({ kind: "cimd" });
    expect(
      await resolveClient(env.DB, id, async () => {
        throw new Error("HTTP 302");
      }),
    ).toContain("HTTP 302");
    expect(await resolveClient(env.DB, "http://agent.example/c", async () => ({}))).toBeTypeOf("string");
  });

  it("DCRで登録したクライアントはDBから引く", async () => {
    const client = await registerClient(env.DB, { clientName: "muse", redirectUris: ["http://127.0.0.1/cb"] }, NOW);
    expect(await resolveClient(env.DB, client.clientId)).toEqual(client);
    expect(await resolveClient(env.DB, "dcr_unknown")).toBeTypeOf("string");
  });
});

describe("isRegisteredRedirectUri", () => {
  it("完全一致か、ループバックのhttpのポート違いだけ認める", () => {
    expect(isRegisteredRedirectUri(["https://a.example/cb"], "https://a.example/cb")).toBe(true);
    expect(isRegisteredRedirectUri(["https://a.example/cb"], "https://a.example/cb2")).toBe(false);
    expect(isRegisteredRedirectUri(["http://127.0.0.1/cb"], "http://127.0.0.1:5555/cb")).toBe(true);
    expect(isRegisteredRedirectUri(["http://127.0.0.1/cb"], "http://127.0.0.1:5555/other")).toBe(false);
    expect(isRegisteredRedirectUri(["https://a.example/cb"], "https://a.example:444/cb")).toBe(false);
  });
});

describe("validateRegistration", () => {
  it("戻り先はhttpsかループバックのhttpだけ", () => {
    expect(validateRegistration({ redirect_uris: ["https://a.example/cb", "http://localhost:3000/cb"] })).toEqual({
      clientName: null,
      redirectUris: ["https://a.example/cb", "http://localhost:3000/cb"],
    });
    expect(validateRegistration({ redirect_uris: ["http://a.example/cb"] })).toHaveProperty("error", "invalid_redirect_uri");
    expect(validateRegistration({ redirect_uris: [] })).toHaveProperty("error");
    expect(validateRegistration({ redirect_uris: ["https://a/cb"], grant_types: ["client_credentials"] })).toHaveProperty("error");
    expect(validateRegistration(null)).toHaveProperty("error");
  });
});

describe("PKCEと認可コード", () => {
  it("RFC 7636の例を検証できる", async () => {
    expect(await verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(await verifyPkce(VERIFIER.replace("d", "e"), CHALLENGE)).toBe(false);
    expect(await verifyPkce("short", CHALLENGE)).toBe(false);
  });

  const grant = {
    clientId: "dcr_x",
    redirectUri: "https://a.example/cb",
    codeChallenge: CHALLENGE,
    householdId: TEST_HOUSEHOLD_ID,
    issuerEmail: TEST_HOUSEHOLD_EMAIL,
    name: "muse",
  };
  const check = { clientId: "dcr_x", redirectUri: "https://a.example/cb", codeVerifier: VERIFIER };

  it("1回だけ使え、2回目は使えない", async () => {
    const code = await issueAuthorizationCode(env.DB, grant, NOW);
    expect(await consumeAuthorizationCode(env.DB, code, check, NOW)).toEqual(grant);
    expect(await consumeAuthorizationCode(env.DB, code, check, NOW)).toBeNull();
  });

  it("期限切れ・不一致は使えず、失敗してもコードは消える", async () => {
    const expired = await issueAuthorizationCode(env.DB, grant, NOW);
    expect(await consumeAuthorizationCode(env.DB, expired, check, NOW + 60_000)).toBeNull();
    const code = await issueAuthorizationCode(env.DB, grant, NOW);
    expect(await consumeAuthorizationCode(env.DB, code, { ...check, redirectUri: "https://a.example/x" }, NOW)).toBeNull();
    expect(await consumeAuthorizationCode(env.DB, code, check, NOW)).toBeNull();
    const pkce = await issueAuthorizationCode(env.DB, grant, NOW);
    expect(await consumeAuthorizationCode(env.DB, pkce, { ...check, codeVerifier: "x".repeat(43) }, NOW)).toBeNull();
  });
});

describe("parseAuthorizeRequest", () => {
  const resource = "https://r.example/mcp";
  const base = {
    client_id: "dcr_x",
    redirect_uri: "https://a.example/cb",
    response_type: "code",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "s",
  };
  const parse = (p: Record<string, string>) => parseAuthorizeRequest(new URLSearchParams(p), resource);

  it("正しいリクエストを読む", () => {
    expect(parse({ ...base, resource: `${resource}/` })).toEqual({
      ok: { clientId: "dcr_x", redirectUri: "https://a.example/cb", codeChallenge: CHALLENGE, state: "s" },
    });
  });
  it("client_id・redirect_uriが無ければ戻り先へ返せない誤り", () => {
    const { client_id: _c, ...noClient } = base;
    expect(parse(noClient)).toHaveProperty("fatal");
  });
  it("PKCEなし・plain・別のresourceは戻り先へ返す誤り", () => {
    expect(parse({ ...base, code_challenge_method: "plain" })).toHaveProperty("redirectError", "invalid_request");
    expect(parse({ ...base, code_challenge: "" })).toHaveProperty("redirectError", "invalid_request");
    expect(parse({ ...base, resource: "https://other/mcp" })).toHaveProperty("redirectError", "invalid_target");
    expect(parse({ ...base, response_type: "token" })).toHaveProperty("redirectError", "unsupported_response_type");
  });
});

describe("redirectWith", () => {
  it("issを付け、nullは付けない", () => {
    expect(redirectWith("https://a.example/cb?x=1", { code: "c", state: null }, "https://r.example")).toBe(
      "https://a.example/cb?x=1&code=c&iss=https%3A%2F%2Fr.example",
    );
  });
});

describe("purgeExpiredOAuthData", () => {
  it("期限切れのコード・90日使われない接続・使われない古いDCR登録を消す", async () => {
    const used = await registerClient(env.DB, { clientName: null, redirectUris: ["https://a/cb"] }, NOW - UNUSED_CLIENT_TTL_MS - 1);
    await registerClient(env.DB, { clientName: null, redirectUris: ["https://a/cb"] }, NOW - UNUSED_CLIENT_TTL_MS - 1);
    await registerClient(env.DB, { clientName: null, redirectUris: ["https://a/cb"] }, NOW);
    await createOAuthConnection(
      env.DB,
      { householdId: TEST_HOUSEHOLD_ID, issuerEmail: TEST_HOUSEHOLD_EMAIL, clientId: used.clientId, name: "a" },
      NOW,
    );
    await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "idle", NOW - AGENT_IDLE_TTL_MS - 1);
    await issueAuthorizationCode(
      env.DB,
      { clientId: "x", redirectUri: "https://a/cb", codeChallenge: CHALLENGE, householdId: TEST_HOUSEHOLD_ID, issuerEmail: "e", name: "n" },
      NOW - 60_000,
    );

    await purgeExpiredOAuthData(env.DB, NOW);

    const count = async (t: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n;
    expect(await count("oauth_clients")).toBe(2);
    expect(await count("agent_connections")).toBe(1);
    expect(await count("oauth_codes")).toBe(0);
  });
});
