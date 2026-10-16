import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Context } from "hono";
import type { HonoEnv } from "../types.js";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const DEV_EMAIL_HEADER = "cf-access-authenticated-user-email";

const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/** Cloudflare AccessのJWTを署名・iss・aud・有効期限まで検証し、emailクレームを返す。不正ならnull。 */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
  jwks: JWTVerifyGetKey = remoteJwks(teamDomain),
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${teamDomain}`, audience: aud });
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * リクエストのユーザーのメールアドレス(小文字)を返す。認証できなければnull。
 *
 * 本番(ACCESS_TEAM_DOMAIN/ACCESS_AUD設定時)はAccessのJWTを検証する。ヘッダーの
 * メールアドレスをそのまま信用すると、Accessを経由しない経路から偽装できるため。
 * Access未設定のローカル開発・テストでは、DEV_HOUSEHOLD_EMAILが設定されている場合に限り
 * cf-access-authenticated-user-emailヘッダー(なければDEV_HOUSEHOLD_EMAIL)を使う。
 * 本番でAUDを設定し忘れても、DEV_HOUSEHOLD_EMAILが無ければ誰も認証されない。
 */
export async function resolveUserEmail(c: Context<HonoEnv>): Promise<string | null> {
  const { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: aud, DEV_HOUSEHOLD_EMAIL: devEmail } = c.env;
  let email: string | null | undefined = null;
  if (teamDomain && aud) {
    const token = c.req.header(ACCESS_JWT_HEADER);
    email = token ? await verifyAccessJwt(token, teamDomain, aud) : null;
  } else if (devEmail) {
    email = c.req.header(DEV_EMAIL_HEADER) ?? devEmail;
  }
  return email?.trim().toLowerCase() || null;
}
