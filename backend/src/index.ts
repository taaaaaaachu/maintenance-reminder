import { app } from "./router.js";
import { checkReminders } from "./scheduled/checkReminders.js";
import { sendMonthlySummary } from "./scheduled/sendMonthlySummary.js";
import { currentJstTimeString, isFirstDayOfJstMonth } from "./lib/date.js";
import type { AppBindings } from "./types.js";

const MONTHLY_SUMMARY_TIME = "07:00";

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: AppBindings, ctx: ExecutionContext) {
    ctx.waitUntil(checkReminders(env));
    if (isFirstDayOfJstMonth() && currentJstTimeString() === MONTHLY_SUMMARY_TIME) {
      ctx.waitUntil(sendMonthlySummary(env));
    }
  },
};
