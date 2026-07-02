import { app } from "./router.js";
import { checkReminders } from "./scheduled/checkReminders.js";
import type { AppBindings } from "./types.js";

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: AppBindings, ctx: ExecutionContext) {
    ctx.waitUntil(checkReminders(env));
  },
};
