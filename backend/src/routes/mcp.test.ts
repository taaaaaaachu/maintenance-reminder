import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestHousehold, TEST_HOUSEHOLD_EMAIL, TEST_HOUSEHOLD_ID } from "../../test/helpers.js";
import { issueManualConnection } from "../db/agentConnections.js";
import { todayJstDateString } from "../lib/date.js";

const BASE_URL = "https://example.com";

beforeEach(async () => {
  for (const t of ["agent_connections", "item_history", "items", "household_members", "households"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  await setupTestHousehold();
  await setupTestHousehold("other", "other@example.com");
});

/** 本物のクライアントで、Worker全体(Accessの検証を含むルーター)に繋ぐ。 */
async function connect(householdId = TEST_HOUSEHOLD_ID, email = TEST_HOUSEHOLD_EMAIL) {
  const { token } = await issueManualConnection(env.DB, householdId, email, "test");
  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE_URL}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: (input, init) => exports.default.fetch(new Request(input, init)),
    }),
  );
  return {
    tools: async () => (await client.listTools()).tools,
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as { type: string; text: string }[])[0]!.text;
      return { isError: r.isError === true, text, data: r.isError ? null : JSON.parse(text) };
    },
  };
}

describe("/mcp の認証", () => {
  it("トークンがなければ401とresource_metadataを返す", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it("不明なトークンも401", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: "Bearer mra_x" } });
    expect(res.status).toBe(401);
  });

  it("トークンは/api/*では受け付けない", async () => {
    const { token } = await issueManualConnection(env.DB, TEST_HOUSEHOLD_ID, TEST_HOUSEHOLD_EMAIL, "test");
    const res = await exports.default.fetch(`${BASE_URL}/api/items`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });
});

describe("ツール", () => {
  it("アイテム操作と履歴の閲覧だけを出し、読み取り・削除に印を付ける", async () => {
    const tools = await (await connect()).tools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "complete_item",
      "create_item",
      "delete_item",
      "get_item",
      "get_item_history",
      "list_items",
      "list_notification_log",
      "snooze_item",
      "update_item",
    ]);
    expect(tools.find((t) => t.name === "list_items")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "delete_item")?.annotations?.destructiveHint).toBe(true);
  });

  it("作成・完了・スヌーズ・編集・削除ができ、履歴の操作者は発行者になる", async () => {
    const agent = await connect();
    const created = await agent.call("create_item", { name: "エアコンのフィルター", intervalDays: 14, lastDoneAt: "2026-01-01" });
    expect(created.data).toMatchObject({ name: "エアコンのフィルター", nextDueAt: "2026-01-15", notifyTime: "07:00" });
    const id = created.data.id as string;

    const completed = await agent.call("complete_item", { itemId: id });
    expect(completed.data.lastDoneAt).toBe(todayJstDateString());
    const snoozed = await agent.call("snooze_item", { itemId: id, days: 3 });
    expect(snoozed.data.recentSnoozeCount).toBe(1);

    const history = await agent.call("get_item_history", { itemId: id });
    expect(history.data.map((h: { eventType: string; actorEmail: string }) => [h.eventType, h.actorEmail])).toEqual([
      ["snooze", TEST_HOUSEHOLD_EMAIL],
      ["complete", TEST_HOUSEHOLD_EMAIL],
    ]);

    expect((await agent.call("update_item", { itemId: id, isActive: false })).data.isActive).toBe(false);
    expect((await agent.call("list_items")).data.items).toEqual([]);
    expect((await agent.call("list_items", { includeInactive: true })).data.items).toHaveLength(1);

    expect((await agent.call("delete_item", { itemId: id })).isError).toBe(false);
    expect((await agent.call("get_item", { itemId: id })).isError).toBe(true);
  });

  it("別の世帯のアイテムは見えず、操作もできない", async () => {
    const other = await connect("other", "other@example.com");
    const id = (await other.call("create_item", { name: "よその", intervalDays: 7 })).data.id as string;
    const mine = await connect();
    expect((await mine.call("list_items")).data.items).toEqual([]);
    for (const tool of ["get_item", "get_item_history", "complete_item", "snooze_item", "update_item", "delete_item"])
      expect((await mine.call(tool, { itemId: id })).isError).toBe(true);
    expect((await other.call("get_item", { itemId: id })).isError).toBe(false);
  });

  it("入力が不正ならエラーを返す", async () => {
    const agent = await connect();
    expect((await agent.call("create_item", { name: "x", intervalDays: 0 })).isError).toBe(true);
    expect((await agent.call("create_item", { name: "x", intervalDays: 7, notifyTime: "07:15" })).isError).toBe(true);
  });
});
