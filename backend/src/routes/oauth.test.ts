import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders, setupTestHousehold, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { listAgentConnections } from "../db/agentConnections.js";

const BASE_URL = "https://example.com";
const REDIRECT_URI = "http://127.0.0.1:33418/callback";
// RFC 7636 付録Bの例
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

beforeEach(async () => {
  for (const t of ["oauth_codes", "oauth_clients", "agent_connections", "household_members", "households"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  await setupTestHousehold();
});

const fetchApp = (path: string, init?: RequestInit) => exports.default.fetch(`${BASE_URL}${path}`, init);

async function register(): Promise<string> {
  const res = await fetchApp("/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "muse", redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: "client_secret_basic" }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { client_id: string; token_endpoint_auth_method: string };
  expect(body.token_endpoint_auth_method).toBe("none");
  return body.client_id;
}

const authorizePath = (clientId: string, extra: Record<string, string> = {}) =>
  "/oauth/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${BASE_URL}/mcp`,
    ...extra,
  });

async function allow(clientId: string): Promise<URL> {
  const res = await fetchApp(authorizePath(clientId), {
    method: "POST",
    headers: { ...authHeaders(), origin: BASE_URL, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action: "allow", name: "うちのmuse" }),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  return new URL(res.headers.get("location")!);
}

function token(params: Record<string, string>) {
  return fetchApp("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

const callMcp = (accessToken: string) =>
  fetchApp("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    }),
  });

describe("OAuthの一連の流れ(DCR)", () => {
  it("登録→同意→トークン→MCP→リフレッシュ→取り消し", async () => {
    const clientId = await register();

    const page = await fetchApp(authorizePath(clientId), { headers: authHeaders() });
    expect(page.status).toBe(200);
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    const htmlText = await page.text();
    expect(htmlText).toContain("muse");
    expect(htmlText).toContain("127.0.0.1:33418");

    const back = await allow(clientId);
    expect(back.origin + back.pathname).toBe(REDIRECT_URI);
    expect(back.searchParams.get("state")).toBe("xyz");
    expect(back.searchParams.get("iss")).toBe(BASE_URL);
    const code = back.searchParams.get("code")!;

    const exchange = { grant_type: "authorization_code", client_id: clientId, redirect_uri: REDIRECT_URI, code };
    expect((await token({ ...exchange, code_verifier: "x".repeat(43) })).status).toBe(400);
    // 失敗しても使ったコードは消えるので、もう一度認可からやり直す
    const code2 = (await allow(clientId)).searchParams.get("code")!;
    const res = await token({ ...exchange, code: code2, code_verifier: VERIFIER });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const tokens = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    expect(tokens.expires_in).toBe(3600);

    expect((await callMcp(tokens.access_token)).status).toBe(200);
    const [connection] = await listAgentConnections(env.DB, TEST_HOUSEHOLD_ID);
    expect(connection).toMatchObject({ name: "うちのmuse", origin: "127.0.0.1:33418(自己登録)" });

    const refreshed = await token({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { access_token: string };
    expect((await callMcp(tokens.access_token)).status).toBe(401);
    expect((await callMcp(next.access_token)).status).toBe(200);

    const revoke = await fetchApp("/oauth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: next.access_token, client_id: clientId }),
    });
    expect(revoke.status).toBe(200);
    expect((await callMcp(next.access_token)).status).toBe(401);
  });
});

describe("同意画面", () => {
  it("拒否すると access_denied で戻る", async () => {
    const clientId = await register();
    const res = await fetchApp(authorizePath(clientId), {
      method: "POST",
      headers: { ...authHeaders(), origin: BASE_URL, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "deny" }),
      redirect: "manual",
    });
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
  });

  it("他サイトからの送信は拒む", async () => {
    const clientId = await register();
    const res = await fetchApp(authorizePath(clientId), {
      method: "POST",
      headers: { ...authHeaders(), origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "allow" }),
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM oauth_codes").first("n")).toBe(0);
  });

  it("世帯に所属していない人は許可できない", async () => {
    const clientId = await register();
    const res = await fetchApp(authorizePath(clientId), { headers: authHeaders("stranger@example.com") });
    expect(res.status).toBe(401);
  });

  it("登録されていない戻り先は画面にエラーを出し、リダイレクトしない", async () => {
    const clientId = await register();
    const res = await fetchApp(authorizePath(clientId, { redirect_uri: "https://evil.example/cb" }), {
      headers: authHeaders(),
      redirect: "manual",
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  it("戻り先を確かめた後の誤りは戻り先へ返す", async () => {
    const clientId = await register();
    const res = await fetchApp(authorizePath(clientId, { code_challenge_method: "plain" }), {
      headers: authHeaders(),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
  });
});

describe("メタデータ", () => {
  it("認可サーバーと保護リソースのメタデータを返す", async () => {
    const as = (await (await fetchApp("/.well-known/oauth-authorization-server")).json()) as Record<string, unknown>;
    expect(as).toMatchObject({
      issuer: BASE_URL,
      token_endpoint: `${BASE_URL}/oauth/token`,
      registration_endpoint: `${BASE_URL}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    });
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const pr = (await (await fetchApp(path)).json()) as Record<string, unknown>;
      expect(pr).toMatchObject({ resource: `${BASE_URL}/mcp`, authorization_servers: [BASE_URL] });
    }
  });
});
