import type { NotificationChannel } from "@maintenance-reminder/shared";
import type { AppBindings } from "../types.js";
import { sendLineMessage } from "./line.js";
import { sendEmail } from "./resend.js";
import { sendPushoverMessage } from "./pushover.js";
import type { NotificationMessage } from "./templates.js";

export async function sendToRecipient(
  env: AppBindings,
  channel: NotificationChannel,
  identifier: string,
  message: NotificationMessage,
): Promise<void> {
  switch (channel) {
    case "line": {
      if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKENが設定されていません");
      await sendLineMessage(env.LINE_CHANNEL_ACCESS_TOKEN, identifier, `${message.title}\n${message.body}`);
      return;
    }
    case "email": {
      if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEYが設定されていません");
      if (!env.RESEND_FROM_ADDRESS) throw new Error("RESEND_FROM_ADDRESSが設定されていません");
      await sendEmail(env.RESEND_API_KEY, env.RESEND_FROM_ADDRESS, identifier, message.title, message.body);
      return;
    }
    case "pushover": {
      if (!env.PUSHOVER_API_TOKEN) throw new Error("PUSHOVER_API_TOKENが設定されていません");
      await sendPushoverMessage(env.PUSHOVER_API_TOKEN, identifier, message.title, message.body);
      return;
    }
  }
}
