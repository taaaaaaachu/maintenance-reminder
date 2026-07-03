import * as householdsDb from "../db/households.js";
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
  const { start, end, label } = previousJstMonthRange();
  const startIso = jstDateStringToUtcStartIso(start);
  const endIsoExclusive = jstDateStringToUtcStartIso(addDaysToDateString(end, 1));

  const households = await householdsDb.listHouseholds(env.DB);
  const enabledChannelsByHousehold = await notificationsDb.listAllEnabledChannelsByHousehold(env.DB);
  const recipientsByHouseholdChannel = await notificationsDb.listAllRecipients(env.DB);

  const tasks: Promise<void>[] = [];

  for (const household of households) {
    const lastSentMonth = await getConfigValue(env.DB, household.id, LAST_MONTHLY_SUMMARY_MONTH_KEY);
    if (lastSentMonth === currentMonthKey) continue;

    const completions = await historyDb.listCompletionsBetween(env.DB, household.id, start, end);
    const snoozeCount = await historyDb.countSnoozesBetween(env.DB, household.id, startIso, endIsoExclusive);
    const message = buildMonthlySummaryMessage(completions, snoozeCount, label, env.APP_BASE_URL);

    const channels = enabledChannelsByHousehold.get(household.id) ?? [];
    for (const channel of channels) {
      const recipients = recipientsByHouseholdChannel.get(`${household.id}:${channel}`) ?? [];
      for (const recipient of recipients) {
        tasks.push(
          sendToRecipient(env, channel, recipient.identifier, message).catch((error) => {
            console.error(`sendMonthlySummary: ${channel}/${recipient.identifier}への送信に失敗しました`, error);
          }),
        );
      }
    }

    await setConfigValue(env.DB, household.id, LAST_MONTHLY_SUMMARY_MONTH_KEY, currentMonthKey);
  }

  await Promise.allSettled(tasks);
}
