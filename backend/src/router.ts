import { Hono } from "hono";
import type { ApiError } from "@maintenance-reminder/shared";
import { itemsRouter, type Env } from "./routes/items.js";
import { HttpError } from "./lib/errors.js";

export const app = new Hono<Env>();

app.route("/api/items", itemsRouter);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { message: err.message, code: err.code } };
    return c.json(body, err.status as 400 | 404);
  }
  console.error(err);
  const body: ApiError = { error: { message: "Internal Server Error", code: "INTERNAL_ERROR" } };
  return c.json(body, 500);
});
