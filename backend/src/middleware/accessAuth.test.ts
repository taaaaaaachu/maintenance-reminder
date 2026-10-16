import { Hono } from "hono";
import { env } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveUserEmail, verifyAccessJwt } from "./accessAuth.js";
import type { HonoEnv } from "../types.js";

const TEAM = "team.cloudflareaccess.com";
const AUD = "test-aud";

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: "k1", alg: "RS256" }] });
});

function sign(claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(privateKey);
}

describe("verifyAccessJwt", () => {
  it("returns the email claim for a valid token", async () => {
    const token = await sign({ email: "User@Example.com" });
    expect(await verifyAccessJwt(token, TEAM, AUD, jwks)).toBe("User@Example.com");
  });

  it("rejects a token for another application (aud)", async () => {
    const token = await sign({ email: "a@example.com" }, { aud: "other-aud" });
    expect(await verifyAccessJwt(token, TEAM, AUD, jwks)).toBeNull();
  });

  it("rejects a token from another team (iss)", async () => {
    const token = await sign({ email: "a@example.com" }, { iss: "https://evil.cloudflareaccess.com" });
    expect(await verifyAccessJwt(token, TEAM, AUD, jwks)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await sign({ email: "a@example.com" }, { exp: "-1m" });
    expect(await verifyAccessJwt(token, TEAM, AUD, jwks)).toBeNull();
  });

  it("rejects a token signed by an unknown key", async () => {
    const other = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "a@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    expect(await verifyAccessJwt(token, TEAM, AUD, jwks)).toBeNull();
  });

  it("returns null when the token has no email claim", async () => {
    const token = await sign({});
    expect(await verifyAccessJwt(token, TEAM, AUD, jwks)).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    expect(await verifyAccessJwt("not.a.jwt", TEAM, AUD, jwks)).toBeNull();
  });
});

describe("resolveUserEmail", () => {
  const app = new Hono<HonoEnv>();
  app.get("/", async (c) => c.json({ email: await resolveUserEmail(c) }));

  async function emailFor(headers: Record<string, string>, overrides: Partial<HonoEnv["Bindings"]>) {
    const res = await app.request("/", { headers }, { ...env, ...overrides });
    return ((await res.json()) as { email: string | null }).email;
  }

  it("ignores the plain email header when Access is configured (prevents header spoofing)", async () => {
    const email = await emailFor(
      { "cf-access-authenticated-user-email": "admin@example.com" },
      { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, DEV_HOUSEHOLD_EMAIL: "dev@example.com" },
    );
    expect(email).toBeNull();
  });

  it("rejects an invalid JWT when Access is configured", async () => {
    const email = await emailFor(
      { "cf-access-jwt-assertion": "invalid.jwt.token" },
      { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD },
    );
    expect(email).toBeNull();
  });

  it("uses the email header in local mode when DEV_HOUSEHOLD_EMAIL is set", async () => {
    const email = await emailFor(
      { "cf-access-authenticated-user-email": "Someone@Example.com" },
      { ACCESS_AUD: "", DEV_HOUSEHOLD_EMAIL: "dev@example.com" },
    );
    expect(email).toBe("someone@example.com");
  });

  it("falls back to DEV_HOUSEHOLD_EMAIL in local mode without a header", async () => {
    expect(await emailFor({}, { ACCESS_AUD: "", DEV_HOUSEHOLD_EMAIL: "dev@example.com" })).toBe("dev@example.com");
  });

  it("authenticates nobody when Access is not configured and DEV_HOUSEHOLD_EMAIL is unset", async () => {
    const email = await emailFor(
      { "cf-access-authenticated-user-email": "admin@example.com" },
      { ACCESS_AUD: "", DEV_HOUSEHOLD_EMAIL: "" },
    );
    expect(email).toBeNull();
  });
});
