import { Hono } from "hono";
import * as notificationsDb from "../db/notifications.js";
import type { HonoEnv } from "../types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const notificationLogRouter = new Hono<HonoEnv>();

notificationLogRouter.get("/", async (c) => {
  const limitParam = Number(c.req.query("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const entries = await notificationsDb.listNotificationLog(c.env.DB, limit);
  return c.json(entries);
});
