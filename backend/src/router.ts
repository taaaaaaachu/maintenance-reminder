import { Hono } from "hono";
import type { ApiError } from "@maintenance-reminder/shared";
import { itemsRouter } from "./routes/items.js";
import { settingsRouter } from "./routes/settings.js";
import { HttpError } from "./lib/errors.js";
import type { HonoEnv } from "./types.js";

export const app = new Hono<HonoEnv>();

app.route("/api/items", itemsRouter);
app.route("/api/settings", settingsRouter);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { message: err.message, code: err.code } };
    return c.json(body, err.status as 400 | 404);
  }
  console.error(err);
  const body: ApiError = { error: { message: "Internal Server Error", code: "INTERNAL_ERROR" } };
  return c.json(body, 500);
});
