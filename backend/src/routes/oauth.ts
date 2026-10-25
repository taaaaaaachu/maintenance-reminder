import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { html } from "hono/html";
import { createOAuthConnection, normalizeAgentName, refreshConnection, revokeByToken, type OAuthTokens } from "../db/agentConnections.js";
import { getHouseholdIdByEmail } from "../db/households.js";
import {
  consumeAuthorizationCode,
  isRegisteredRedirectUri,
  issueAuthorizationCode,
  parseAuthorizeRequest,
  redirectWith,
  registerClient,
  resolveClient,
  validateRegistration,
} from "../lib/oauth.js";
import { resolveUserEmail } from "../middleware/accessAuth.js";
import type { HonoEnv } from "../types.js";

/**
 * OAuth 2.1の認可サーバー(ADR 0001)。
 * - /oauth/authorize は Access の内側にあり、Access JWT の身元で「誰が許可したか」を決める。
 * - /oauth/token・/oauth/register・/oauth/revoke と /.well-known/* は Access をBypassする。
 *   エージェントのサーバーからOriginなしで呼ばれ、Cookieを読まず、認可コード+PKCEかトークンだけで認証する。
 */
export const oauthRouter = new Hono<HonoEnv>();
export const wellKnownRouter = new Hono<HonoEnv>();

const CORS = { "access-control-allow-origin": "*" };
const issuerOf = (c: Context<HonoEnv>) => new URL(c.req.url).origin;
const mcpResourceOf = (c: Context<HonoEnv>) => `${issuerOf(c)}/mcp`;

// --- 同意画面 ---

type Page = { error: string } | { client: { name: string | null; host: string; kind: "cimd" | "dcr"; redirectHost: string } };

function renderPage(page: Page, status: 200 | 400 | 401 = 200): Response {
  const body =
    "error" in page
      ? html`<h1>接続できません</h1>
          <p class="error">${page.error}</p>`
      : html`<h1>AIエージェントの接続</h1>
          <p>
            <strong>${page.client.name ?? page.client.host}</strong>
            が、あなたの世帯のアイテムの閲覧・作成・編集・削除・完了・スヌーズと、通知履歴の閲覧をしようとしています。
          </p>
          <dl>
            <dt>${page.client.kind === "cimd" ? "提供元" : "戻り先(自己申告のクライアントのため、身元はこのドメインでしか確かめられません)"}</dt>
            <dd>${page.client.kind === "cimd" ? page.client.host : page.client.redirectHost}</dd>
          </dl>
          <p>通知設定・カレンダー連携・招待・管理画面の操作はできません。接続は「通知設定」タブからいつでも取り消せます。</p>
          <form method="post">
            <label>接続の名前 <input name="name" maxlength="50" value="${page.client.name ?? page.client.host}" /></label>
            <div class="actions">
              <button name="action" value="deny" type="submit">拒否</button>
              <button name="action" value="allow" type="submit" class="primary">許可</button>
            </div>
          </form>`;
  const doc = html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>エージェントの接続 - お手入れリマインダー</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1f2937; }
          h1 { font-size: 1.25rem; }
          .error { color: #b91c1c; }
          dt { font-size: 0.875rem; color: #6b7280; }
          dd { margin: 0 0 1rem; font-weight: bold; }
          input { display: block; width: 100%; box-sizing: border-box; padding: 0.5rem; margin-top: 0.25rem; }
          .actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
          button { padding: 0.5rem 1.25rem; border-radius: 0.375rem; border: 1px solid #d1d5db; background: #fff; }
          .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;
  return new Response(doc.toString(), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // 同意画面を他サイトに埋め込ませない(クリックジャッキング対策)。
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
      "cache-control": "no-store",
    },
  });
}

/**
 * 認可リクエストを確かめる。戻り先が確かめられないうちの誤りは画面に出し、
 * 確かめた後の誤りはerrorパラメーター付きで戻り先へ返す(OAuth 2.1)。
 */
async function checkAuthorizeRequest(c: Context<HonoEnv>) {
  const params = new URL(c.req.url).searchParams;
  const parsed = parseAuthorizeRequest(params, mcpResourceOf(c));
  if ("fatal" in parsed) return { page: renderPage({ error: parsed.fatal }, 400) };
  const client = await resolveClient(c.env.DB, params.get("client_id") ?? "");
  if (typeof client === "string") return { page: renderPage({ error: client }, 400) };
  const redirectUri = "ok" in parsed ? parsed.ok.redirectUri : parsed.request.redirectUri;
  if (!isRegisteredRedirectUri(client.redirectUris, redirectUri))
    return { page: renderPage({ error: "戻り先(redirect_uri)がクライアントの情報に登録されていません。" }, 400) };
  if ("redirectError" in parsed) {
    const { redirectError, description, request } = parsed;
    const to = redirectWith(request.redirectUri, { error: redirectError, error_description: description, state: request.state }, issuerOf(c));
    return { page: c.redirect(to, 303) };
  }
  // 発行者はAccess JWTで決める。世帯は所属している1つに決まる(CONTEXT.md)。
  const email = await resolveUserEmail(c);
  const householdId = email ? await getHouseholdIdByEmail(c.env.DB, email) : null;
  if (!email || !householdId)
    return { page: renderPage({ error: "この世帯は登録されていません。管理者に問い合わせてください。" }, 401) };
  return { request: parsed.ok, client, email, householdId };
}

const hostOf = (url: string) => new URL(url).host;

oauthRouter.get("/authorize", async (c) => {
  const checked = await checkAuthorizeRequest(c);
  if ("page" in checked) return checked.page;
  const { client, request } = checked;
  return renderPage({
    client: {
      name: client.clientName,
      // DCRのclient_idはドメインを持たないので、身元として出せるのは戻り先のドメインだけ。
      host: client.kind === "cimd" ? hostOf(client.clientId) : hostOf(request.redirectUri),
      kind: client.kind,
      redirectHost: hostOf(request.redirectUri),
    },
  });
});

// Accessのクッキーで動く唯一のフォームなので、他サイトからの送信をOriginで拒む。
oauthRouter.post("/authorize", csrf(), async (c) => {
  const checked = await checkAuthorizeRequest(c);
  if ("page" in checked) return checked.page;
  const { client, request, email, householdId } = checked;
  const form = await c.req.parseBody();
  if (form.action !== "allow")
    return c.redirect(redirectWith(request.redirectUri, { error: "access_denied", state: request.state }, issuerOf(c)), 303);
  const name =
    normalizeAgentName(form.name) ??
    normalizeAgentName(client.clientName) ??
    hostOf(client.kind === "cimd" ? client.clientId : request.redirectUri);
  const code = await issueAuthorizationCode(c.env.DB, {
    clientId: client.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    householdId,
    issuerEmail: email,
    name,
  });
  return c.redirect(redirectWith(request.redirectUri, { code, state: request.state }, issuerOf(c)), 303);
});

// --- トークン・登録・取り消し(AccessをBypass) ---

const TOKEN_HEADERS = { ...CORS, "cache-control": "no-store" };

function oauthError(error: string, description: string): Response {
  return Response.json({ error, error_description: description }, { status: 400, headers: TOKEN_HEADERS });
}

function tokenResponse(t: OAuthTokens): Response {
  return Response.json(
    { access_token: t.accessToken, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refreshToken },
    { headers: TOKEN_HEADERS },
  );
}

async function formOf(c: Context<HonoEnv>): Promise<(key: string) => string | null> {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  return (key) => {
    const v = form[key];
    return typeof v === "string" && v !== "" ? v : null;
  };
}

oauthRouter.post("/token", async (c) => {
  const get = await formOf(c);
  const clientId = get("client_id");
  if (!clientId) return oauthError("invalid_request", "client_idがありません。");
  switch (get("grant_type")) {
    case "authorization_code": {
      const code = get("code");
      const redirectUri = get("redirect_uri");
      const codeVerifier = get("code_verifier");
      if (!code || !redirectUri || !codeVerifier)
        return oauthError("invalid_request", "code・redirect_uri・code_verifierが必要です。");
      const grant = await consumeAuthorizationCode(c.env.DB, code, { clientId, redirectUri, codeVerifier });
      if (!grant) return oauthError("invalid_grant", "認可コードが無効です(期限切れ・使用済み・不一致)。");
      return tokenResponse(await createOAuthConnection(c.env.DB, { ...grant, clientId }));
    }
    case "refresh_token": {
      const refreshToken = get("refresh_token");
      if (!refreshToken) return oauthError("invalid_request", "refresh_tokenがありません。");
      const tokens = await refreshConnection(c.env.DB, refreshToken, clientId);
      return tokens ? tokenResponse(tokens) : oauthError("invalid_grant", "リフレッシュトークンが無効です。接続し直してください。");
    }
    default:
      return oauthError("unsupported_grant_type", "authorization_codeとrefresh_tokenだけに対応しています。");
  }
});

/**
 * Dynamic Client Registration(RFC 7591)。誰でも登録できるが、使えるのは本人が同意画面で
 * 許可した後だけ。DCRにしか対応しないエージェントのために用意する。
 */
oauthRouter.post("/register", async (c) => {
  const input = validateRegistration(await c.req.json().catch(() => null));
  if ("error" in input) return Response.json({ error: input.error, error_description: input.description }, { status: 400, headers: CORS });
  const client = await registerClient(c.env.DB, input);
  return Response.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: TOKEN_HEADERS },
  );
});

/** ブラウザで動くクライアントの事前確認(JSONのPOSTなので必要)。 */
oauthRouter.options(
  "/register",
  () =>
    new Response(null, {
      status: 204,
      headers: { ...CORS, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" },
    }),
);

/** トークンの取り消し(RFC 7009)。接続ごと消す。不明なトークンでも200を返す。 */
oauthRouter.post("/revoke", async (c) => {
  const get = await formOf(c);
  const token = get("token");
  const clientId = get("client_id");
  if (!token || !clientId) return Response.json({ error: "invalid_request", error_description: "tokenとclient_idが必要です。" }, { status: 400, headers: CORS });
  await revokeByToken(c.env.DB, token, clientId);
  return new Response(null, { status: 200, headers: CORS });
});

// --- メタデータ(AccessをBypass) ---

/** 認可サーバーのメタデータ(RFC 8414)。 */
wellKnownRouter.get("/oauth-authorization-server", (c) => {
  const issuer = issuerOf(c);
  return c.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    },
    200,
    CORS,
  );
});

/**
 * 保護リソースのメタデータ(RFC 9728)。本来の在処は /.well-known/oauth-protected-resource/mcp だが、
 * 末尾なしで探すクライアントにも同じものを返す。
 */
const protectedResource = (c: Context<HonoEnv>) =>
  c.json(
    {
      resource: mcpResourceOf(c),
      authorization_servers: [issuerOf(c)],
      bearer_methods_supported: ["header"],
      resource_name: "お手入れリマインダー",
    },
    200,
    CORS,
  );
wellKnownRouter.get("/oauth-protected-resource", protectedResource);
wellKnownRouter.get("/oauth-protected-resource/mcp", protectedResource);
