import { Hono } from "hono";
import * as notificationsDb from "../db/notifications.js";
import * as invitesDb from "../db/invites.js";
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
  message?: {
    type: string;
    text?: string;
  };
}

interface LineWebhookPayload {
  events: LineWebhookEvent[];
}

const INVITE_PROMPT_TEXT =
  "お手入れリマインダーへようこそ。管理者から受け取った招待コードをこのトーク画面に送信してください。";
const REGISTERED_REPLY_TEXT = "お手入れリマインダーの通知に登録しました。今後、お手入れ時期が近づくとこのアカウントからお知らせします。";
const INVALID_CODE_REPLY_TEXT = "招待コードが正しくないか、期限切れです。管理者に確認してください。";

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

    if (event.type === "follow") {
      if (event.replyToken) {
        await replyLineMessage(c.env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, INVITE_PROMPT_TEXT);
      }
    } else if (event.type === "message" && event.message?.type === "text" && event.message.text) {
      const householdId = await invitesDb.consumeInvite(c.env.DB, event.message.text.trim());
      if (householdId) {
        await notificationsDb.addRecipient(c.env.DB, householdId, "line", userId, null);
        if (event.replyToken) {
          await replyLineMessage(c.env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, REGISTERED_REPLY_TEXT);
        }
      } else if (event.replyToken) {
        await replyLineMessage(c.env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, INVALID_CODE_REPLY_TEXT);
      }
    } else if (event.type === "unfollow") {
      // unfollowイベントにはhousehold情報が含まれないため、household横断でidentifierのみ削除する
      await notificationsDb.removeRecipientByIdentifier(c.env.DB, "line", userId);
    }
  }

  return c.json({ ok: true });
});
