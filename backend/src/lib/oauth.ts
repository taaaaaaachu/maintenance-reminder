import { AGENT_IDLE_TTL_MS, hashToken, randomBase64Url } from "../db/agentConnections.js";

/**
 * 自前のOAuth 2.1認可サーバー(ADR 0001)。クライアントはClient ID Metadata Document(CIMD)か
 * Dynamic Client Registration(DCR)で受け付け、どちらも公開クライアント(PKCE S256、クライアント認証なし)として扱う。
 */

export interface ClientMetadata {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  /** cimd: client_idのURLのドメインが身元。dcr: 自己申告だけで、身元は戻り先のドメインしかない。 */
  kind: "cimd" | "dcr";
}

// --- クライアント(CIMD) ---

/** client_idとして受け付けるURLか。httpsでパスを持ち、資格情報・フラグメント・ドットセグメントを含まない。 */
export function parseClientIdUrl(value: string): URL | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || value.includes("#")) return null;
  if (url.pathname === "/" || /\/\.\.?(\/|$)/.test(value.slice(url.origin.length))) return null;
  return url.href === value ? url : null;
}

/** 取得した文書を検証する。仕様に合わなければ理由を返す。 */
export function validateClientMetadata(clientId: string, doc: unknown): ClientMetadata | string {
  if (typeof doc !== "object" || doc === null) return "クライアントの情報がJSONオブジェクトではありません。";
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return "クライアントの情報のclient_idがURLと一致しません。";
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string" && URL.canParse(u)))
    return "クライアントの情報にredirect_urisがありません。";
  const method = d.token_endpoint_auth_method;
  if (method !== undefined && method !== "none")
    return "公開クライアント(token_endpoint_auth_method: none)だけに対応しています。";
  return { clientId, clientName: clientNameOf(d.client_name), redirectUris: uris as string[], kind: "cimd" };
}

function clientNameOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null;
}

const FETCH_TIMEOUT_MS = 5000;
const FETCH_MAX_BYTES = 10 * 1024;

/**
 * CIMDの文書を取得する。Workersのfetchはプライベートネットワークへ届かず、さらに
 * global_fetch_strictly_publicで自ゾーンへの近道も塞いでいる。そのうえでリダイレクトは追わず、
 * サイズと時間を制限する。
 */
export async function fetchClientMetadataJson(url: URL): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status !== 200 || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > FETCH_MAX_BYTES) {
      await reader.cancel();
      throw new Error("大きすぎます");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("JSONではありません");
  }
}

export type FetchJson = (url: URL) => Promise<unknown>;

/**
 * クライアントの情報を得る。DCRで登録したclient_idならDBから、それ以外はCIMDとして取得して検証する。
 * 失敗なら理由の文字列。CIMDはキャッシュしない(使うのは同意画面だけで、回数が少ないため)。
 */
export async function resolveClient(
  db: D1Database,
  clientId: string,
  fetchJson: FetchJson = fetchClientMetadataJson,
): Promise<ClientMetadata | string> {
  if (clientId.startsWith(DCR_PREFIX))
    return (await findRegisteredClient(db, clientId)) ?? "登録されていないクライアントです。登録し直してください。";
  const url = parseClientIdUrl(clientId);
  if (!url) return "client_idはhttpsのURL(パス付き)で指定してください。";
  let json: unknown;
  try {
    json = await fetchJson(url);
  } catch (e) {
    return `クライアントの情報を取得できませんでした(${e instanceof Error ? e.message : "不明なエラー"})。`;
  }
  return validateClientMetadata(clientId, json);
}

/**
 * 戻り先が登録済みのものと一致するか。完全一致だけを認める。ただしループバック(httpの
 * 127.0.0.1・[::1]・localhost)は、ポートだけ違ってよい(RFC 8252)。
 */
export function isRegisteredRedirectUri(registered: string[], redirectUri: string): boolean {
  if (registered.includes(redirectUri)) return true;
  if (!URL.canParse(redirectUri)) return false;
  const target = new URL(redirectUri);
  if (!isLoopback(target)) return false;
  return registered.some((r) => {
    const u = URL.canParse(r) ? new URL(r) : null;
    return (
      u !== null &&
      isLoopback(u) &&
      u.hostname === target.hostname &&
      u.pathname === target.pathname &&
      u.search === target.search
    );
  });
}

function isLoopback(u: URL): boolean {
  return u.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname);
}

// --- クライアント(DCR) ---

const DCR_PREFIX = "dcr_";
const MAX_REDIRECT_URIS = 10;
/** 接続に一度も使われないまま、この期間を過ぎた登録は消す。 */
export const UNUSED_CLIENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 登録リクエスト(RFC 7591)を検証する。戻り先はhttpsか、ループバックのhttpだけ。
 * 認証方式は何を求められてもnone(公開クライアント)で登録する(RFC 7591はサーバーが値を置き換えることを認めている)。
 */
export function validateRegistration(
  body: unknown,
): { clientName: string | null; redirectUris: string[] } | { error: string; description: string } {
  const bad = (error: string, description: string) => ({ error, description });
  if (typeof body !== "object" || body === null) return bad("invalid_client_metadata", "JSONオブジェクトで送ってください。");
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS)
    return bad("invalid_redirect_uri", `redirect_urisは1〜${MAX_REDIRECT_URIS}件で指定してください。`);
  for (const u of uris) {
    if (typeof u !== "string" || u.length > 2048 || !URL.canParse(u) || u.includes("#"))
      return bad("invalid_redirect_uri", "redirect_urisに不正なURLがあります。");
    const url = new URL(u);
    if (url.protocol !== "https:" && !isLoopback(url))
      return bad("invalid_redirect_uri", "redirect_urisはhttpsか、ループバックのhttpだけです。");
  }
  const grants = b.grant_types;
  if (
    grants !== undefined &&
    (!Array.isArray(grants) ||
      !grants.includes("authorization_code") ||
      grants.some((g) => g !== "authorization_code" && g !== "refresh_token"))
  )
    return bad("invalid_client_metadata", "grant_typesはauthorization_codeとrefresh_tokenだけです。");
  const responses = b.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || responses.some((r) => r !== "code")))
    return bad("invalid_client_metadata", "response_typesはcodeだけです。");
  return { clientName: clientNameOf(b.client_name), redirectUris: uris as string[] };
}

export async function registerClient(
  db: D1Database,
  input: { clientName: string | null; redirectUris: string[] },
  now = Date.now(),
): Promise<ClientMetadata> {
  const clientId = DCR_PREFIX + randomBase64Url(16);
  await db
    .prepare("INSERT INTO oauth_clients (id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)")
    .bind(clientId, input.clientName, JSON.stringify(input.redirectUris), now)
    .run();
  return { clientId, clientName: input.clientName, redirectUris: input.redirectUris, kind: "dcr" };
}

async function findRegisteredClient(db: D1Database, clientId: string): Promise<ClientMetadata | null> {
  const row = await db
    .prepare("SELECT id, client_name, redirect_uris FROM oauth_clients WHERE id = ?")
    .bind(clientId)
    .first<{ id: string; client_name: string | null; redirect_uris: string }>();
  return row
    ? { clientId: row.id, clientName: row.client_name, redirectUris: JSON.parse(row.redirect_uris) as string[], kind: "dcr" }
    : null;
}

// --- 認可コード ---

const CODE_TTL_MS = 60 * 1000;

export interface Grant {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  householdId: string;
  issuerEmail: string;
  name: string;
}

export async function issueAuthorizationCode(db: D1Database, grant: Grant, now = Date.now()): Promise<string> {
  const code = randomBase64Url();
  await db
    .prepare(
      `INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, household_id, issuer_email, name, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      await hashToken(code),
      grant.clientId,
      grant.redirectUri,
      grant.codeChallenge,
      grant.householdId,
      grant.issuerEmail,
      grant.name,
      now + CODE_TTL_MS,
    )
    .run();
  return code;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** PKCE S256の検証。 */
export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) return false;
  const encoder = new TextEncoder();
  const expected = encoder.encode(await sha256Base64Url(codeVerifier));
  const actual = encoder.encode(codeChallenge);
  return expected.byteLength === actual.byteLength && crypto.subtle.timingSafeEqual(expected, actual);
}

/**
 * 認可コードを使う。1回きりで、クライアント・戻り先・PKCEが発行時と一致したときだけ許可内容を返す。
 * 失敗しても使ったコードは消す。
 */
export async function consumeAuthorizationCode(
  db: D1Database,
  code: string,
  check: { clientId: string; redirectUri: string; codeVerifier: string },
  now = Date.now(),
): Promise<Grant | null> {
  // DELETE ... RETURNINGで取り出しと削除を1文にし、同じコードの同時使用を防ぐ。
  const row = await db
    .prepare("DELETE FROM oauth_codes WHERE code_hash = ? RETURNING *")
    .bind(await hashToken(code))
    .first<{
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      household_id: string;
      issuer_email: string;
      name: string;
      expires_at: number;
    }>();
  if (!row || row.expires_at <= now) return null;
  if (row.client_id !== check.clientId || row.redirect_uri !== check.redirectUri) return null;
  if (!(await verifyPkce(check.codeVerifier, row.code_challenge))) return null;
  return {
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    householdId: row.household_id,
    issuerEmail: row.issuer_email,
    name: row.name,
  };
}

// --- 認可リクエスト ---

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

/**
 * 認可リクエストのうち、戻り先を確かめる前に分かる誤り(戻り先へ返せない)と、
 * 確かめた後の誤り(errorパラメーター付きで戻り先へ返す)を分けて検証する。
 * resource(RFC 8707)は指定があればMCPエンドポイントと一致しなければならない。
 */
export function parseAuthorizeRequest(
  params: URLSearchParams,
  resource: string,
):
  | { ok: AuthorizeRequest }
  | { fatal: string }
  | { redirectError: string; description: string; request: Pick<AuthorizeRequest, "redirectUri" | "state"> } {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  if (!clientId) return { fatal: "client_idがありません。" };
  if (!redirectUri) return { fatal: "redirect_uriがありません。" };
  const state = params.get("state");
  const fail = (redirectError: string, description: string) => ({ redirectError, description, request: { redirectUri, state } });
  if (params.get("response_type") !== "code") return fail("unsupported_response_type", "response_typeはcodeだけに対応しています。");
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge || !/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge))
    return fail("invalid_request", "code_challenge(PKCE)が必要です。");
  if (params.get("code_challenge_method") !== "S256")
    return fail("invalid_request", "code_challenge_methodはS256だけに対応しています。");
  if (params.getAll("resource").some((r) => r.replace(/\/$/, "") !== resource))
    return fail("invalid_target", `resourceは${resource}だけです。`);
  return { ok: { clientId, redirectUri, codeChallenge, state } };
}

/** 戻り先へのリダイレクトURL(RFC 9207のissを付ける)。 */
export function redirectWith(redirectUri: string, params: Record<string, string | null>, issuer: string): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss: issuer })) if (v !== null) url.searchParams.set(k, v);
  return url.href;
}

/** 期限切れの認可コード・90日使われない接続・使われないDCR登録を消す(Cronから呼ぶ)。 */
export async function purgeExpiredOAuthData(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM agent_connections WHERE last_used_at < ?").bind(now - AGENT_IDLE_TTL_MS),
    db
      .prepare(
        `DELETE FROM oauth_clients WHERE created_at < ?
         AND id NOT IN (SELECT client_id FROM agent_connections WHERE client_id IS NOT NULL)`,
      )
      .bind(now - UNUSED_CLIENT_TTL_MS),
  ]);
}
