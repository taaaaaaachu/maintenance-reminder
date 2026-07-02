import * as itemsDb from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { sendToChannel } from "../notifications/dispatcher.js";
import { buildReminderMessage } from "../notifications/templates.js";
import { jstDateStringToUtcStartIso, todayJstDateString } from "../lib/date.js";
import type { AppBindings } from "../types.js";

export async function checkReminders(env: AppBindings): Promise<void> {
  const today = todayJstDateString();
  const sinceIso = jstDateStringToUtcStartIso(today);

  const dueItems = await itemsDb.listDueItems(env.DB, today);
  const enabledSettings = (await notificationsDb.listNotificationSettings(env.DB)).filter((s) => s.isEnabled);

  const tasks = dueItems.flatMap((item) =>
    enabledSettings.map(async (setting) => {
      const alreadySent = await notificationsDb.hasSuccessfulNotificationSince(
        env.DB,
        item.id,
        setting.channel,
        sinceIso,
      );
      if (alreadySent) return;

      const message = buildReminderMessage(item);
      try {
        await sendToChannel(env, setting.channel, setting.config, message);
        await notificationsDb.recordNotificationLog(env.DB, {
          itemId: item.id,
          channel: setting.channel,
          status: "success",
        });
      } catch (error) {
        await notificationsDb.recordNotificationLog(env.DB, {
          itemId: item.id,
          channel: setting.channel,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  const results = await Promise.allSettled(tasks);
  const unexpectedFailures = results.filter((r) => r.status === "rejected");
  if (unexpectedFailures.length > 0) {
    console.error(`checkReminders: ${unexpectedFailures.length}件の予期しないエラーが発生しました`, unexpectedFailures);
  }
}
