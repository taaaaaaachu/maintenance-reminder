import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replyLineMessage, verifyLineSignature } from "./line.js";

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

describe("verifyLineSignature", () => {
  it("returns true for a correctly signed body", async () => {
    const body = JSON.stringify({ events: [] });
    const signature = await sign("secret", body);
    expect(await verifyLineSignature("secret", body, signature)).toBe(true);
  });

  it("returns false when the body has been tampered with", async () => {
    const body = JSON.stringify({ events: [] });
    const signature = await sign("secret", body);
    expect(await verifyLineSignature("secret", body + "tampered", signature)).toBe(false);
  });

  it("returns false when the secret does not match", async () => {
    const body = JSON.stringify({ events: [] });
    const signature = await sign("secret", body);
    expect(await verifyLineSignature("different-secret", body, signature)).toBe(false);
  });
});

describe("replyLineMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("posts to the LINE reply API with the reply token and text", async () => {
    await replyLineMessage("token", "reply-token-1", "登録しました");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/reply");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
    const body = JSON.parse(init.body as string);
    expect(body.replyToken).toBe("reply-token-1");
    expect(body.messages[0].text).toBe("登録しました");
  });

  it("throws when the API responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(replyLineMessage("token", "reply-token-1", "text")).rejects.toThrow("400");
  });
});
