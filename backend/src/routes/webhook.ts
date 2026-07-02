import { Hono } from "hono";
import * as notificationsDb from "../db/notifications.js";
import { replyLineMessage, verifyLineSignature } from "../notifications/line.js";
import { badRequest } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source: {
    type: string;
    userId?: string;
  };
}

interface LineWebhookPayload {
  events: LineWebhookEvent[];
}

const REGISTERED_REPLY_TEXT = "お手入れリマインダーの通知に登録しました。今後、お手入れ時期が近づくとこのアカウントからお知らせします。";

export const webhookRouter = new Hono<HonoEnv>();

webhookRouter.post("/line", async (c) => {
  const signature = c.req.header("x-line-signature");
  const rawBody = await c.req.text();

  if (!signature || !(await verifyLineSignature(c.env.LINE_CHANNEL_SECRET, rawBody, signature))) {
    throw badRequest("invalid signature");
  }

  const payload = JSON.parse(rawBody) as LineWebhookPayload;

  for (const event of payload.events) {
    const userId = event.source.userId;
    if (!userId) continue;

    if (event.type === "follow" || event.type === "message") {
      await notificationsDb.addRecipient(c.env.DB, "line", userId, null);
      if (event.replyToken) {
        await replyLineMessage(c.env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, REGISTERED_REPLY_TEXT);
      }
    } else if (event.type === "unfollow") {
      const existing = await notificationsDb.listRecipients(c.env.DB, "line");
      const match = existing.find((r) => r.identifier === userId);
      if (match) await notificationsDb.removeRecipient(c.env.DB, "line", match.id);
    }
  }

  return c.json({ ok: true });
});
