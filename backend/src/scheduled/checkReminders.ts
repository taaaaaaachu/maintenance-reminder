import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { sendToRecipient } from "../notifications/dispatcher.js";
import { buildReminderMessage } from "../notifications/templates.js";
import { getNotificationTime } from "../notifications/scheduleConfig.js";
import { currentJstTimeString, jstDateStringToUtcStartIso, todayJstDateString } from "../lib/date.js";
import type { AppBindings } from "../types.js";

export async function checkReminders(env: AppBindings): Promise<void> {
  const configuredTime = await getNotificationTime(env.DB);
  if (currentJstTimeString() !== configuredTime) return;

  const today = todayJstDateString();
  const sinceIso = jstDateStringToUtcStartIso(today);

  const dueItems = await itemsDb.listDueItems(env.DB, today);
  const enabledChannels = (await notificationsDb.listNotificationSettings(env.DB))
    .filter((s) => s.isEnabled)
    .map((s) => s.channel);

  const tasks: Promise<void>[] = [];

  for (const item of dueItems) {
    for (const channel of enabledChannels) {
      const recipients = await notificationsDb.listRecipients(env.DB, channel);
      for (const recipient of recipients) {
        tasks.push(
          (async () => {
            const alreadySent = await notificationsDb.hasSuccessfulNotificationSince(
              env.DB,
              item.id,
              channel,
              recipient.identifier,
              sinceIso,
            );
            if (alreadySent) return;

            const message = buildReminderMessage(item, today);
            try {
              await sendToRecipient(env, channel, recipient.identifier, message);
              await notificationsDb.recordNotificationLog(env.DB, {
                itemId: item.id,
                channel,
                recipientIdentifier: recipient.identifier,
                status: "success",
              });
            } catch (error) {
              await notificationsDb.recordNotificationLog(env.DB, {
                itemId: item.id,
                channel,
                recipientIdentifier: recipient.identifier,
                status: "failed",
                errorMessage: error instanceof Error ? error.message : String(error),
              });
            }
          })(),
        );
      }
    }
  }

  const results = await Promise.allSettled(tasks);
  const unexpectedFailures = results.filter((r) => r.status === "rejected");
  if (unexpectedFailures.length > 0) {
    console.error(`checkReminders: ${unexpectedFailures.length}件の予期しないエラーが発生しました`, unexpectedFailures);
  }
}
