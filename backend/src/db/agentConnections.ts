import type { AgentConnection } from "@maintenance-reminder/shared";

/**
 * エージェント接続(CONTEXT.md / ADR 0001)。1件の接続は発行したメンバーとその世帯1つに結びつく。
 * 使うたびに、発行者が今もその世帯のメンバーかを確かめる。
 */

/** この期間使われなかった接続は失効する。 */
export const AGENT_IDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** OAuthのアクセストークンの寿命。 */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const AGENT_NAME_MAX = 50;

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomBase64Url(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 漏えい時にシークレットスキャンで見つけやすいよう接頭辞を付ける。 */
const newToken = (prefix: "mra_" | "mrr_") => prefix + randomBase64Url();

/** 名前を整える。空・長すぎはnull。 */
export function normalizeAgentName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= AGENT_NAME_MAX ? trimmed : null;
}

const isIdle = (lastUsedAt: number, now: number) => now - lastUsedAt > AGENT_IDLE_TTL_MS;

/** 手動発行。トークンは戻り値でしか分からない。 */
export async function issueManualConnection(
  db: D1Database,
  householdId: string,
  issuerEmail: string,
  name: string,
  now = Date.now(),
): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  const token = newToken("mra_");
  await db
    .prepare(
      `INSERT INTO agent_connections (id, household_id, issuer_email, name, client_id, access_hash, access_expires_at, created_at, last_used_at)
       VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
    )
    .bind(id, householdId, issuerEmail, name, await hashToken(token), now, now)
    .run();
  return { id, token };
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function newOAuthTokens(now: number) {
  const accessToken = newToken("mra_");
  const refreshToken = newToken("mrr_");
  return {
    tokens: { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_MS / 1000 },
    accessHash: await hashToken(accessToken),
    accessExpiresAt: now + ACCESS_TOKEN_TTL_MS,
    refreshHash: await hashToken(refreshToken),
  };
}

/**
 * OAuthの同意から接続を作る。同じクライアント・同じ発行者の既存の接続は置き換える
 * (繋ぎ直すたびに一覧へ溜まらないように)。
 */
export async function createOAuthConnection(
  db: D1Database,
  grant: { householdId: string; issuerEmail: string; clientId: string; name: string },
  now = Date.now(),
): Promise<OAuthTokens> {
  const t = await newOAuthTokens(now);
  await db.batch([
    db
      .prepare("DELETE FROM agent_connections WHERE household_id = ? AND issuer_email = ? AND client_id = ?")
      .bind(grant.householdId, grant.issuerEmail, grant.clientId),
    db
      .prepare(
        `INSERT INTO agent_connections (id, household_id, issuer_email, name, client_id, access_hash, access_expires_at, refresh_hash, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        grant.householdId,
        grant.issuerEmail,
        grant.name,
        grant.clientId,
        t.accessHash,
        t.accessExpiresAt,
        t.refreshHash,
        now,
        now,
      ),
  ]);
  return t.tokens;
}

/**
 * リフレッシュトークンでトークンを入れ替える。1つ前のトークンが再び使われたら
 * 漏えいとみなして接続を消す。無効ならnull。
 */
export async function refreshConnection(
  db: D1Database,
  refreshToken: string,
  clientId: string,
  now = Date.now(),
): Promise<OAuthTokens | null> {
  const hash = await hashToken(refreshToken);
  const row = await db
    .prepare(
      `SELECT c.id, c.client_id, c.refresh_hash, c.last_used_at, m.id AS member_id
       FROM agent_connections c
       LEFT JOIN household_members m ON m.email = c.issuer_email AND m.household_id = c.household_id
       WHERE c.refresh_hash = ? OR c.previous_refresh_hash = ?`,
    )
    .bind(hash, hash)
    .first<{ id: string; client_id: string | null; refresh_hash: string; last_used_at: number; member_id: string | null }>();
  if (!row || row.client_id !== clientId) return null;
  if (row.refresh_hash !== hash || isIdle(row.last_used_at, now) || !row.member_id) {
    await deleteConnection(db, row.id);
    return null;
  }
  const t = await newOAuthTokens(now);
  // 同じリフレッシュトークンでの同時リクエストは、先に更新した方だけを通す。
  const result = await db
    .prepare(
      `UPDATE agent_connections
       SET access_hash = ?, access_expires_at = ?, refresh_hash = ?, previous_refresh_hash = ?, last_used_at = ?
       WHERE id = ? AND refresh_hash = ?`,
    )
    .bind(t.accessHash, t.accessExpiresAt, t.refreshHash, hash, now, row.id, hash)
    .run();
  return result.meta.changes > 0 ? t.tokens : null;
}

export interface AgentContext {
  connectionId: string;
  householdId: string;
  issuerEmail: string;
}

/**
 * Bearerトークン(手動発行・OAuthのアクセストークン)を確かめる。期限切れ・90日未使用・
 * 発行者が世帯から外れた場合はnull。使えたら最終使用日時を更新する。
 */
export async function authenticateAgent(db: D1Database, token: string, now = Date.now()): Promise<AgentContext | null> {
  const row = await db
    .prepare(
      `SELECT c.id, c.household_id, c.issuer_email, c.access_expires_at, c.last_used_at, m.id AS member_id
       FROM agent_connections c
       LEFT JOIN household_members m ON m.email = c.issuer_email AND m.household_id = c.household_id
       WHERE c.access_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<{
      id: string;
      household_id: string;
      issuer_email: string;
      access_expires_at: number | null;
      last_used_at: number;
      member_id: string | null;
    }>();
  if (!row) return null;
  if (isIdle(row.last_used_at, now) || !row.member_id) {
    await deleteConnection(db, row.id);
    return null;
  }
  if (row.access_expires_at !== null && row.access_expires_at <= now) return null;
  await db.prepare("UPDATE agent_connections SET last_used_at = ? WHERE id = ?").bind(now, row.id).run();
  return { connectionId: row.id, householdId: row.household_id, issuerEmail: row.issuer_email };
}

function originOf(clientId: string | null, dcrRedirectUris: string | null): string {
  if (!clientId) return "手動発行";
  const url = (dcrRedirectUris ? (JSON.parse(dcrRedirectUris) as string[])[0] : clientId) ?? "";
  return URL.canParse(url) ? new URL(url).host + (dcrRedirectUris ? "(自己登録)" : "") : clientId;
}

/** 世帯の接続一覧(新しい順)。失効したものは除く(消すのはCronと使用時)。 */
export async function listAgentConnections(
  db: D1Database,
  householdId: string,
  now = Date.now(),
): Promise<AgentConnection[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.issuer_email, c.client_id, o.redirect_uris, c.created_at, c.last_used_at
       FROM agent_connections c
       LEFT JOIN oauth_clients o ON o.id = c.client_id
       WHERE c.household_id = ? AND c.last_used_at >= ?
       ORDER BY c.created_at DESC`,
    )
    .bind(householdId, now - AGENT_IDLE_TTL_MS)
    .all<{
      id: string;
      name: string;
      issuer_email: string;
      client_id: string | null;
      redirect_uris: string | null;
      created_at: number;
      last_used_at: number;
    }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    issuerEmail: r.issuer_email,
    origin: originOf(r.client_id, r.redirect_uris),
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: new Date(r.last_used_at).toISOString(),
  }));
}

/** 世帯の接続を取り消す。見つからなければfalse。 */
export async function revokeAgentConnection(db: D1Database, householdId: string, id: string): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM agent_connections WHERE id = ? AND household_id = ?")
    .bind(id, householdId)
    .run();
  return result.meta.changes > 0;
}

/**
 * OAuthのトークン取り消し(RFC 7009)。アクセス・リフレッシュどちらでも接続ごと消す。
 * 別のクライアントのトークンや不明なトークンは何もしない。
 */
export async function revokeByToken(db: D1Database, token: string, clientId: string): Promise<void> {
  const hash = await hashToken(token);
  await db
    .prepare("DELETE FROM agent_connections WHERE client_id = ? AND (access_hash = ? OR refresh_hash = ?)")
    .bind(clientId, hash, hash)
    .run();
}

async function deleteConnection(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM agent_connections WHERE id = ?").bind(id).run();
}
