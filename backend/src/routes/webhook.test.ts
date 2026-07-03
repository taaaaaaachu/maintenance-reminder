import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import * as notificationsDb from "../db/notifications.js";
import * as invitesDb from "../db/invites.js";

const BASE_URL = "https://example.com";

async function clearAll() {
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM household_invites").run();
  await env.DB.prepare("DELETE FROM household_members").run();
  await env.DB.prepare("DELETE FROM households").run();
  await setupTestHousehold();
}

beforeEach(async () => {
  await clearAll();
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

    it("does not register the sender on a follow event, but replies with an invite prompt", async () => {
      const body = JSON.stringify({
        events: [{ type: "follow", replyToken: "reply-token-1", source: { type: "user", userId: "U123" } }],
      });

      const res = await postWebhook(body);
      expect(res.status).toBe(200);

      const recipients = await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line");
      expect(recipients).toHaveLength(0);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.line.me/v2/bot/message/reply");
      expect(JSON.parse(init.body as string).replyToken).toBe("reply-token-1");
    });

    it("registers the sender as a recipient when a valid invite code is sent", async () => {
      const code = await invitesDb.createInvite(env.DB, TEST_HOUSEHOLD_ID, null);
      const body = JSON.stringify({
        events: [
          { type: "message", replyToken: "reply-token-2", source: { type: "user", userId: "U456" }, message: { type: "text", text: code } },
        ],
      });

      const res = await postWebhook(body);
      expect(res.status).toBe(200);

      const recipients = await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line");
      expect(recipients.map((r) => r.identifier)).toContain("U456");
    });

    it("does not register the sender when the message is not a valid invite code", async () => {
      const body = JSON.stringify({
        events: [
          { type: "message", replyToken: "t1", source: { type: "user", userId: "U789" }, message: { type: "text", text: "not-a-code" } },
        ],
      });

      await postWebhook(body);

      const recipients = await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line");
      expect(recipients).toHaveLength(0);
    });

    it("does not allow the same invite code to be used twice", async () => {
      const code = await invitesDb.createInvite(env.DB, TEST_HOUSEHOLD_ID, null);
      const firstBody = JSON.stringify({
        events: [{ type: "message", replyToken: "t1", source: { type: "user", userId: "U100" }, message: { type: "text", text: code } }],
      });
      const secondBody = JSON.stringify({
        events: [{ type: "message", replyToken: "t2", source: { type: "user", userId: "U200" }, message: { type: "text", text: code } }],
      });

      await postWebhook(firstBody);
      await postWebhook(secondBody);

      const recipients = await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line");
      expect(recipients.map((r) => r.identifier)).toEqual(["U100"]);
    });

    it("registers the sender under the invite's own household, not the caller's", async () => {
      await setupTestHousehold("other-household", "other@example.com");
      const code = await invitesDb.createInvite(env.DB, "other-household", null);
      const body = JSON.stringify({
        events: [
          { type: "message", replyToken: "t1", source: { type: "user", userId: "U321" }, message: { type: "text", text: code } },
        ],
      });

      await postWebhook(body);

      expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line")).toHaveLength(0);
      const theirRecipients = await notificationsDb.listRecipients(env.DB, "other-household", "line");
      expect(theirRecipients.map((r) => r.identifier)).toContain("U321");
    });

    it("removes the recipient across households on an unfollow event", async () => {
      await notificationsDb.addRecipient(env.DB, TEST_HOUSEHOLD_ID, "line", "U999", null);

      const body = JSON.stringify({
        events: [{ type: "unfollow", source: { type: "user", userId: "U999" } }],
      });
      await postWebhook(body);

      const recipients = await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line");
      expect(recipients.map((r) => r.identifier)).not.toContain("U999");
    });

    it("ignores events without a userId (e.g. group source)", async () => {
      const body = JSON.stringify({
        events: [{ type: "message", replyToken: "t1", source: { type: "group" } }],
      });

      const res = await postWebhook(body);
      expect(res.status).toBe(200);
      expect(await notificationsDb.listRecipients(env.DB, TEST_HOUSEHOLD_ID, "line")).toHaveLength(0);
    });
  });
});
