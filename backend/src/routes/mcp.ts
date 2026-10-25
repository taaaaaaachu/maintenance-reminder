import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { authenticateAgent, type AgentContext } from "../db/agentConnections.js";
import { createMcpServer } from "../mcp/server.js";
import type { HonoEnv } from "../types.js";

/**
 * エージェント向けのMCPエンドポイント(ADR 0001)。Access をBypassしたパスなので、Access JWTは見ず、
 * 毎リクエストBearerトークン(手動発行・OAuth)で接続を確かめる。セッションは持たない。
 */
export const mcpRouter = new Hono<HonoEnv>();

const handler = createMcpHandler(({ authInfo }) => {
  const { db, agent } = authInfo?.extra as { db: D1Database; agent: AgentContext };
  return createMcpServer(db, agent);
});

/** 401で認可サーバーの在処を知らせる(RFC 9728)。 */
function unauthorized(origin: string): Response {
  return Response.json(
    { error: "invalid_token", error_description: "エージェント接続のトークンが必要です。" },
    {
      status: 401,
      headers: { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` },
    },
  );
}

mcpRouter.all("/", async (c) => {
  const token = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const agent = token ? await authenticateAgent(c.env.DB, token) : null;
  if (!token || !agent) return unauthorized(new URL(c.req.url).origin);
  return handler.fetch(c.req.raw, {
    authInfo: { token, clientId: agent.connectionId, scopes: [], extra: { db: c.env.DB, agent } },
  });
});
