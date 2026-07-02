import type { Item, NotificationChannel } from "@maintenance-reminder/shared";
import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { sendToRecipient } from "../notifications/dispatcher.js";
import { buildReminderMessage } from "../notifications/templates.js";
import { currentJstTimeString, jstDateStringToUtcStartIso, todayJstDateString } from "../lib/date.js";
import type { AppBindings } from "../types.js";

async function collectPendingItems(
  env: AppBindings,
  dueItems: Item[],
  channel: NotificationChannel,
  recipientIdentifier: string,
  sinceIso: string,
): Promise<Item[]> {
  const pending: Item[] = [];
  for (const item of dueItems) {
    const alreadySent = await notificationsDb.hasSuccessfulNotificationSince(
      env.DB,
      item.id,
      channel,
      recipientIdentifier,
      sinceIso,
    );
    if (!alreadySent) pending.push(item);
  }
  return pending;
}

async function recordLogForItems(
  env: AppBindings,
  items: Item[],
  channel: NotificationChannel,
  recipientIdentifier: string,
  status: "success" | "failed",
  errorMessage?: string,
): Promise<void> {
  for (const item of items) {
    await notificationsDb.recordNotificationLog(env.DB, {
      itemId: item.id,
      channel,
      recipientIdentifier,
      status,
      errorMessage,
    });
  }
}

export async function checkReminders(env: AppBindings): Promise<void> {
  const today = todayJstDateString();
  const currentTime = currentJstTimeString();
  const sinceIso = jstDateStringToUtcStartIso(today);

  const dueItems = (await itemsDb.listDueItems(env.DB, today)).filter((item) => item.notifyTime === currentTime);
  const enabledChannels = (await notificationsDb.listNotificationSettings(env.DB))
    .filter((s) => s.isEnabled)
    .map((s) => s.channel);

  const tasks: Promise<void>[] = [];

  for (const channel of enabledChannels) {
    const recipients = await notificationsDb.listRecipients(env.DB, channel);
    for (const recipient of recipients) {
      tasks.push(
        (async () => {
          const pendingItems = await collectPendingItems(env, dueItems, channel, recipient.identifier, sinceIso);
          if (pendingItems.length === 0) return;

          const message = buildReminderMessage(pendingItems, today, env.APP_BASE_URL);
          try {
            await sendToRecipient(env, channel, recipient.identifier, message);
            await recordLogForItems(env, pendingItems, channel, recipient.identifier, "success");
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await recordLogForItems(env, pendingItems, channel, recipient.identifier, "failed", errorMessage);
          }
        })(),
      );
    }
  }

  const results = await Promise.allSettled(tasks);
  const unexpectedFailures = results.filter((r) => r.status === "rejected");
  if (unexpectedFailures.length > 0) {
    console.error(`checkReminders: ${unexpectedFailures.length}件の予期しないエラーが発生しました`, unexpectedFailures);
  }
}
