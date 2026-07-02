import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as notificationsDb from "../db/notifications.js";

const BASE_URL = "https://example.com";

async function clearRecipients() {
  await env.DB.prepare("DELETE FROM notification_recipients").run();
}

beforeEach(async () => {
  await clearRecipients();
});

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

async function postWebhook(body: string, signature?: string) {
  return exports.default.fetch(`${BASE_URL}/webhook/line`, {
    method: "POST",
    headers: { "x-line-signature": signature ?? (await sign(body)) },
    body,
  });
}

describe("POST /webhook/line", () => {
  it("rejects requests without a signature header", async () => {
    const body = JSON.stringify({ events: [] });
    const res = await exports.default.fetch(`${BASE_URL}/webhook/line`, { method: "POST", body });
    expect(res.status).toBe(400);
  });

  it("rejects requests with an invalid signature", async () => {
    const res = await postWebhook(JSON.stringify({ events: [] }), "wrong-signature");
    expect(res.status).toBe(400);
  });

  describe("with a valid signature", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      fetchMock.mockReset();
      vi.unstubAllGlobals();
    });

    it("registers the sender as a recipient on a follow event and replies", async () => {
      const body = JSON.stringify({
        events: [{ type: "follow", replyToken: "reply-token-1", source: { type: "user", userId: "U123" } }],
      });

      const res = await postWebhook(body);
      expect(res.status).toBe(200);

      const recipients = await notificationsDb.listRecipients(env.DB, "line");
      expect(recipients.map((r) => r.identifier)).toContain("U123");

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.line.me/v2/bot/message/reply");
      expect(JSON.parse(init.body as string).replyToken).toBe("reply-token-1");
    });

    it("registers the sender as a recipient on a message event", async () => {
      const body = JSON.stringify({
        events: [
          { type: "message", replyToken: "reply-token-2", source: { type: "user", userId: "U456" }, message: { type: "text", text: "こんにちは" } },
        ],
      });

      await postWebhook(body);

      const recipients = await notificationsDb.listRecipients(env.DB, "line");
      expect(recipients.map((r) => r.identifier)).toContain("U456");
    });

    it("does not create duplicate recipients for repeated messages from the same user", async () => {
      const body = JSON.stringify({
        events: [{ type: "message", replyToken: "t1", source: { type: "user", userId: "U789" } }],
      });

      await postWebhook(body);
      await postWebhook(body);

      const recipients = await notificationsDb.listRecipients(env.DB, "line");
      expect(recipients.filter((r) => r.identifier === "U789")).toHaveLength(1);
    });

    it("removes the recipient on an unfollow event", async () => {
      await notificationsDb.addRecipient(env.DB, "line", "U999", null);

      const body = JSON.stringify({
        events: [{ type: "unfollow", source: { type: "user", userId: "U999" } }],
      });
      await postWebhook(body);

      const recipients = await notificationsDb.listRecipients(env.DB, "line");
      expect(recipients.map((r) => r.identifier)).not.toContain("U999");
    });

    it("ignores events without a userId (e.g. group source)", async () => {
      const body = JSON.stringify({
        events: [{ type: "message", replyToken: "t1", source: { type: "group" } }],
      });

      const res = await postWebhook(body);
      expect(res.status).toBe(200);
      expect(await notificationsDb.listRecipients(env.DB, "line")).toHaveLength(0);
    });
  });
});
