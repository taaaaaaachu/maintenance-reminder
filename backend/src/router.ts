import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiError } from "@maintenance-reminder/shared";
import { itemsRouter } from "./routes/items.js";
import { settingsRouter } from "./routes/settings.js";
import { feedRouter } from "./routes/feed.js";
import { webhookRouter } from "./routes/webhook.js";
import { notificationLogRouter } from "./routes/notificationLog.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { agentConnectionsRouter } from "./routes/agentConnections.js";
import { mcpRouter } from "./routes/mcp.js";
import { oauthRouter, wellKnownRouter } from "./routes/oauth.js";
import { HttpError } from "./lib/errors.js";
import type { HonoEnv } from "./types.js";

export const app = new Hono<HonoEnv>();

app.route("/api/items", itemsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/notification-log", notificationLogRouter);
app.route("/api/admin", adminRouter);
app.route("/api/auth", authRouter);
app.route("/feed", feedRouter);
app.route("/webhook", webhookRouter);
app.route("/api/agent-connections", agentConnectionsRouter);
// /mcp・/oauth/{token,register,revoke}・/.well-known/* はAccessをBypassする(README参照)。
// これらはAccess JWTを見ずにトークンだけで認証する。/oauth/authorize はAccessの内側に残す。
app.route("/mcp", mcpRouter);
app.route("/oauth", oauthRouter);
app.route("/.well-known", wellKnownRouter);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { message: err.message, code: err.code } };
    return c.json(body, err.status as 400 | 401 | 404);
  }
  // hono/csrf などHono組み込みのミドルウェアが投げるもの
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  const body: ApiError = { error: { message: "Internal Server Error", code: "INTERNAL_ERROR" } };
  return c.json(body, 500);
});
