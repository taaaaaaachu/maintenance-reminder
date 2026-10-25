import { Hono } from "hono";
import type { IssuedAgentToken } from "@maintenance-reminder/shared";
import * as connectionsDb from "../db/agentConnections.js";
import { badRequest, notFound } from "../lib/errors.js";
import { householdMiddleware } from "../middleware/household.js";
import type { HonoEnv } from "../types.js";

/** エージェント接続の一覧・手動発行・取り消し(画面向け)。世帯のメンバーなら誰の接続でも取り消せる。 */
export const agentConnectionsRouter = new Hono<HonoEnv>();

agentConnectionsRouter.use("*", householdMiddleware);

agentConnectionsRouter.get("/", async (c) => c.json(await connectionsDb.listAgentConnections(c.env.DB, c.get("householdId"))));

agentConnectionsRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = connectionsDb.normalizeAgentName((body as { name?: unknown }).name);
  if (!name) throw badRequest(`名前を1〜${connectionsDb.AGENT_NAME_MAX}文字で指定してください`);
  const issued = await connectionsDb.issueManualConnection(c.env.DB, c.get("householdId"), c.get("actorEmail"), name);
  return c.json<IssuedAgentToken>(issued, 201);
});

agentConnectionsRouter.delete("/:id", async (c) => {
  if (!(await connectionsDb.revokeAgentConnection(c.env.DB, c.get("householdId"), c.req.param("id"))))
    throw notFound("接続が見つかりません");
  return c.body(null, 204);
});
