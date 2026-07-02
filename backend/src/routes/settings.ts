import { Hono } from "hono";
import { z } from "zod";
import { NOTIFICATION_CHANNELS } from "@maintenance-reminder/shared";
import type { NotificationChannel } from "@maintenance-reminder/shared";
import * as notificationsDb from "../db/notifications.js";
import { sendToChannel } from "../notifications/dispatcher.js";
import { badRequest } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";

const CHANNEL_CONFIG_SCHEMAS: Record<NotificationChannel, z.ZodType> = {
  line: z.object({ userId: z.string().min(1) }),
  email: z.object({ toAddress: z.string().email() }),
  pushover: z.object({ userKey: z.string().min(1) }),
};

const updateSettingSchema = z.object({
  isEnabled: z.boolean(),
  config: z.record(z.string(), z.string()),
});

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

  if (parsed.data.isEnabled) {
    const configParsed = CHANNEL_CONFIG_SCHEMAS[channel].safeParse(parsed.data.config);
    if (!configParsed.success) throw badRequest(`「${channel}」の設定値が不正です: ${configParsed.error.message}`);
  }

  const updated = await notificationsDb.upsertNotificationSetting(
    c.env.DB,
    channel,
    parsed.data.isEnabled,
    parsed.data.config,
  );
  return c.json(updated);
});

settingsRouter.post("/notifications/:channel/test", async (c) => {
  const channel = c.req.param("channel");
  if (!isNotificationChannel(channel)) throw badRequest("不明な通知チャネルです");

  const setting = await notificationsDb.getNotificationSetting(c.env.DB, channel);
  if (!setting.isEnabled) throw badRequest("この通知チャネルは有効化されていません");

  try {
    await sendToChannel(c.env, channel, setting.config, {
      title: "【テスト通知】お手入れリマインダー",
      body: "これはテスト通知です。この通知が届いていれば設定は正しく動作しています。",
    });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "送信に失敗しました");
  }

  return c.json({ ok: true });
});
