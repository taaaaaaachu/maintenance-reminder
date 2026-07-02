import { Hono } from "hono";
import { z } from "zod";
import { NOTIFICATION_CHANNELS } from "@maintenance-reminder/shared";
import type { NotificationChannel } from "@maintenance-reminder/shared";
import * as notificationsDb from "../db/notifications.js";
import { sendToRecipient } from "../notifications/dispatcher.js";
import { getOrCreateIcsFeedToken, regenerateIcsFeedToken } from "../ics/token.js";
import { getConfigValue, setConfigValue } from "../db/appConfig.js";
import { badRequest, notFound } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";

const RECIPIENT_IDENTIFIER_SCHEMAS: Record<NotificationChannel, z.ZodType<string>> = {
  line: z.string().min(1),
  email: z.string().email(),
  pushover: z.string().min(1),
};

const updateSettingSchema = z.object({
  isEnabled: z.boolean(),
});

const addRecipientSchema = z.object({
  identifier: z.string().min(1),
  label: z.string().max(100).nullable().optional(),
});

const lineInviteSchema = z.object({
  url: z.string().url(),
});

const LINE_INVITE_URL_KEY = "line_invite_url";

function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

export const settingsRouter = new Hono<HonoEnv>();

settingsRouter.get("/notifications", async (c) => {
  const settings = await notificationsDb.listNotificationSettings(c.env.DB);
  return c.json(settings);
});

settingsRouter.put("/notifications/:channel", async (c) => {
  const channel = c.req.param("channel");
  if (!isNotificationChannel(channel)) throw badRequest("不明な通知チャネルです");

  const parsed = updateSettingSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);

  const updated = await notificationsDb.setNotificationEnabled(c.env.DB, channel, parsed.data.isEnabled);
  return c.json(updated);
});

settingsRouter.get("/notifications/:channel/recipients", async (c) => {
  const channel = c.req.param("channel");
  if (!isNotificationChannel(channel)) throw badRequest("不明な通知チャネルです");

  const recipients = await notificationsDb.listRecipients(c.env.DB, channel);
  return c.json(recipients);
});

settingsRouter.post("/notifications/:channel/recipients", async (c) => {
  const channel = c.req.param("channel");
  if (!isNotificationChannel(channel)) throw badRequest("不明な通知チャネルです");

  const parsed = addRecipientSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);

  const identifierParsed = RECIPIENT_IDENTIFIER_SCHEMAS[channel].safeParse(parsed.data.identifier);
  if (!identifierParsed.success) throw badRequest(`宛先の形式が不正です: ${identifierParsed.error.message}`);

  const recipient = await notificationsDb.addRecipient(
    c.env.DB,
    channel,
    identifierParsed.data,
    parsed.data.label ?? null,
  );
  return c.json(recipient, 201);
});

settingsRouter.delete("/notifications/:channel/recipients/:id", async (c) => {
  const channel = c.req.param("channel");
  if (!isNotificationChannel(channel)) throw badRequest("不明な通知チャネルです");

  await notificationsDb.removeRecipient(c.env.DB, channel, c.req.param("id"));
  return c.body(null, 204);
});

settingsRouter.post("/notifications/:channel/recipients/:id/test", async (c) => {
  const channel = c.req.param("channel");
  if (!isNotificationChannel(channel)) throw badRequest("不明な通知チャネルです");

  const recipient = await notificationsDb.getRecipient(c.env.DB, channel, c.req.param("id"));
  if (!recipient) throw notFound("宛先が見つかりません");

  try {
    await sendToRecipient(c.env, channel, recipient.identifier, {
      title: "【テスト通知】お手入れリマインダー",
      body: "これはテスト通知です。この通知が届いていれば設定は正しく動作しています。",
      url: c.env.APP_BASE_URL,
    });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "送信に失敗しました");
  }

  return c.json({ ok: true });
});

settingsRouter.get("/ics-feed", async (c) => {
  const token = await getOrCreateIcsFeedToken(c.env.DB);
  return c.json({ token });
});

settingsRouter.post("/ics-feed/regenerate", async (c) => {
  const token = await regenerateIcsFeedToken(c.env.DB);
  return c.json({ token });
});

settingsRouter.get("/line-invite", async (c) => {
  const url = await getConfigValue(c.env.DB, LINE_INVITE_URL_KEY);
  return c.json({ url });
});

settingsRouter.put("/line-invite", async (c) => {
  const parsed = lineInviteSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);

  await setConfigValue(c.env.DB, LINE_INVITE_URL_KEY, parsed.data.url);
  return c.json({ url: parsed.data.url });
});
