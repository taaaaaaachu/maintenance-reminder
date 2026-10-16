import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const BASE_URL = "https://example.com";

describe("GET /api/auth/refresh", () => {
  it("認証ヘッダーなしでも / への302を返す(Accessログイン復帰用のため認証チェックしない)", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/auth/refresh`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });
});

describe("GET /api/auth/me", () => {
  it("管理者のメールアドレスならisAdmin: trueを返す(大文字小文字は区別しない)", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/auth/me`, {
      headers: { "cf-access-authenticated-user-email": env.ADMIN_EMAIL.toUpperCase() },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isAdmin: true });
  });

  it("管理者以外のメールアドレスならisAdmin: falseを返す", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/auth/me`, {
      headers: { "cf-access-authenticated-user-email": "someone@example.com" },
    });
    expect(await res.json()).toEqual({ isAdmin: false });
  });
});
