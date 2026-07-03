import type { NotificationChannel } from "@maintenance-reminder/shared";
import * as itemsDb from "../db/queries.js";
import type { DueItem } from "../db/queries.js";
import * as notificationsDb from "../db/notifications.js";
import { sendToRecipient } from "../notifications/dispatcher.js";
import { buildReminderMessage } from "../notifications/templates.js";
import { currentJstTimeString, jstDateStringToUtcStartIso, todayJstDateString } from "../lib/date.js";
import type { AppBindings } from "../types.js";

function groupByHousehold(items: DueItem[]): Map<string, DueItem[]> {
  const map = new Map<string, DueItem[]>();
  for (const item of items) {
    const list = map.get(item.householdId) ?? [];
    list.push(item);
    map.set(item.householdId, list);
  }
  return map;
}

export async function checkReminders(env: AppBindings): Promise<void> {
  const today = todayJstDateString();
  const currentTime = currentJstTimeString();
  const sinceIso = jstDateStringToUtcStartIso(today);

  const dueItemsByHousehold = groupByHousehold(
    (await itemsDb.listDueItemsAllHouseholds(env.DB, today)).filter((item) => item.notifyTime === currentTime),
  );
  const enabledChannelsByHousehold = await notificationsDb.listAllEnabledChannelsByHousehold(env.DB);
  const recipientsByHouseholdChannel = await notificationsDb.listAllRecipients(env.DB);

  const tasks: Promise<void>[] = [];

  for (const [householdId, dueItems] of dueItemsByHousehold) {
    const channels: NotificationChannel[] = enabledChannelsByHousehold.get(householdId) ?? [];
    for (const channel of channels) {
      const recipients = recipientsByHouseholdChannel.get(`${householdId}:${channel}`) ?? [];
      for (const recipient of recipients) {
        tasks.push(
          (async () => {
            const notifiedItemIds = await notificationsDb.listNotifiedItemIds(
              env.DB,
              householdId,
              dueItems.map((item) => item.id),
              channel,
              recipient.identifier,
              sinceIso,
            );
            const pendingItems = dueItems.filter((item) => !notifiedItemIds.has(item.id));
            if (pendingItems.length === 0) return;

            const message = buildReminderMessage(pendingItems, today, env.APP_BASE_URL);
            const pendingItemIds = pendingItems.map((item) => item.id);
            try {
              await sendToRecipient(env, channel, recipient.identifier, message);
              await notificationsDb.recordNotificationLogBatch(
                env.DB,
                householdId,
                pendingItemIds,
                channel,
                recipient.identifier,
                "success",
              );
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await notificationsDb.recordNotificationLogBatch(
                env.DB,
                householdId,
                pendingItemIds,
                channel,
                recipient.identifier,
                "failed",
                errorMessage,
              );
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
