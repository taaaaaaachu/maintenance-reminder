import * as notificationsDb from "../db/notifications.js";
import * as historyDb from "../db/history.js";
import { getConfigValue, setConfigValue } from "../db/appConfig.js";
import { sendToRecipient } from "../notifications/dispatcher.js";
import { buildMonthlySummaryMessage } from "../notifications/templates.js";
import { addDaysToDateString, jstDateStringToUtcStartIso, previousJstMonthRange, todayJstDateString } from "../lib/date.js";
import { LAST_MONTHLY_SUMMARY_MONTH_KEY } from "../lib/configKeys.js";
import type { AppBindings } from "../types.js";

export async function sendMonthlySummary(env: AppBindings): Promise<void> {
  const currentMonthKey = todayJstDateString().slice(0, 7);
  const lastSentMonth = await getConfigValue(env.DB, LAST_MONTHLY_SUMMARY_MONTH_KEY);
  if (lastSentMonth === currentMonthKey) return;

  const { start, end, label } = previousJstMonthRange();
  const completions = await historyDb.listCompletionsBetween(env.DB, start, end);
  const startIso = jstDateStringToUtcStartIso(start);
  const endIsoExclusive = jstDateStringToUtcStartIso(addDaysToDateString(end, 1));
  const snoozeCount = await historyDb.countSnoozesBetween(env.DB, startIso, endIsoExclusive);

  const enabledChannels = (await notificationsDb.listNotificationSettings(env.DB))
    .filter((s) => s.isEnabled)
    .map((s) => s.channel);

  const message = buildMonthlySummaryMessage(completions, snoozeCount, label, env.APP_BASE_URL);

  const tasks: Promise<void>[] = [];
  for (const channel of enabledChannels) {
    const recipients = await notificationsDb.listRecipients(env.DB, channel);
    for (const recipient of recipients) {
      tasks.push(
        sendToRecipient(env, channel, recipient.identifier, message).catch((error) => {
          console.error(`sendMonthlySummary: ${channel}/${recipient.identifier}への送信に失敗しました`, error);
        }),
      );
    }
  }
  await Promise.allSettled(tasks);

  await setConfigValue(env.DB, LAST_MONTHLY_SUMMARY_MONTH_KEY, currentMonthKey);
}
