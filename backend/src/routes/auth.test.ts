import { exports } from "cloudflare:workers";
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
