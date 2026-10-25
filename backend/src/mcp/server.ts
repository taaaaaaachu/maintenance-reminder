import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { DEFAULT_SNOOZE_DAYS } from "@maintenance-reminder/shared";
import { z } from "zod";
import * as historyDb from "../db/history.js";
import * as itemsDb from "../db/queries.js";
import { listNotificationLog } from "../db/notifications.js";
import type { AgentContext } from "../db/agentConnections.js";
import { todayJstDateString } from "../lib/date.js";
import { createHouseholdItem, createItemSchema, snoozeSchema, updateItemSchema } from "../routes/items.js";

/**
 * エージェント向けのMCPサーバー(ADR 0001)。1リクエストごとに、認証済みの接続の世帯で作る。
 * 操作できるのはアイテムと、その履歴・通知履歴の閲覧だけ。通知設定・ICS・招待・管理は出さない。
 */

const INSTRUCTIONS = `お手入れリマインダーは、家電・家事などの定期的なお手入れ(アイテム)の次回予定日を管理し、通知するアプリです。
この接続で操作できるのは1つの世帯のアイテムだけです。
- アイテムは「何日ごとに行うか(intervalDays)」と「次回予定日(nextDueAt)」を持ちます。
- 実施したら complete_item を呼びます。今日(Asia/Tokyo)を実施日として、次回予定日が今日+intervalDays になります。
- 先送りしたいときは snooze_item を呼びます。次回予定日が指定日数だけ後ろにずれます。
- 日付は YYYY-MM-DD(Asia/Tokyo)です。`;

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const NO_ITEM = "アイテムが見つかりません。";
const itemId = z.string().min(1);

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}
const okOrMissing = (data: unknown) => (data ? ok(data) : fail(NO_ITEM));

export function createMcpServer(db: D1Database, ctx: AgentContext): McpServer {
  const { householdId, issuerEmail } = ctx;
  const server = new McpServer({ name: "maintenance-reminder", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_items",
    {
      title: "アイテム一覧",
      description: "アイテムを次回予定日が近い順に返す。既定では有効なものだけ。",
      inputSchema: z.object({ includeInactive: z.boolean().optional() }),
      annotations: READ,
    },
    async ({ includeInactive }) =>
      ok({ today: todayJstDateString(), items: await itemsDb.listItems(db, householdId, includeInactive ?? false) }),
  );

  server.registerTool(
    "get_item",
    { title: "アイテムの詳細", inputSchema: z.object({ itemId }), annotations: READ },
    async ({ itemId }) => okOrMissing(await itemsDb.getItem(db, householdId, itemId)),
  );

  server.registerTool(
    "get_item_history",
    {
      title: "完了・スヌーズの履歴",
      description: "アイテムの完了・スヌーズの記録を新しい順に返す。",
      inputSchema: z.object({ itemId }),
      annotations: READ,
    },
    async ({ itemId }) => {
      if (!(await itemsDb.getItem(db, householdId, itemId))) return fail(NO_ITEM);
      return ok(await historyDb.listHistory(db, householdId, itemId));
    },
  );

  server.registerTool(
    "list_notification_log",
    {
      title: "通知履歴",
      description: "送った通知の記録を新しい順に返す。",
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
      annotations: READ,
    },
    async ({ limit }) => ok(await listNotificationLog(db, householdId, limit ?? 50)),
  );

  server.registerTool(
    "create_item",
    {
      title: "アイテムを作る",
      description:
        "lastDoneAt(前回実施日)を省略すると今日。次回予定日は lastDoneAt+intervalDays。notifyTime は HH:00 か HH:30 で、省略すると世帯の既定値。",
      inputSchema: createItemSchema,
      annotations: WRITE,
    },
    async (input) => ok(await createHouseholdItem(db, householdId, input)),
  );

  server.registerTool(
    "update_item",
    {
      title: "アイテムを編集する",
      description: "指定した項目だけ変える。isActive を false にすると通知が止まる。",
      inputSchema: updateItemSchema.extend({ itemId }),
      annotations: WRITE,
    },
    async ({ itemId, ...input }) => okOrMissing(await itemsDb.updateItem(db, householdId, itemId, input)),
  );

  server.registerTool(
    "delete_item",
    {
      title: "アイテムを削除する",
      description: "アイテムと、その履歴・通知履歴を消す。元に戻せない。",
      inputSchema: z.object({ itemId }),
      annotations: DESTRUCTIVE,
    },
    async ({ itemId }) => {
      if (!(await itemsDb.getItem(db, householdId, itemId))) return fail(NO_ITEM);
      await itemsDb.deleteItem(db, householdId, itemId);
      return ok({ deleted: itemId });
    },
  );

  server.registerTool(
    "complete_item",
    {
      title: "実施した",
      description: "今日実施したことを記録し、次回予定日を今日+intervalDays にする。",
      inputSchema: z.object({ itemId }),
      annotations: WRITE,
    },
    async ({ itemId }) =>
      okOrMissing(await itemsDb.completeItem(db, householdId, itemId, todayJstDateString(), issuerEmail)),
  );

  server.registerTool(
    "snooze_item",
    {
      title: "先送りする",
      description: `次回予定日を days 日後ろにずらす。省略すると${DEFAULT_SNOOZE_DAYS}日。`,
      inputSchema: snoozeSchema.extend({ itemId }),
      annotations: WRITE,
    },
    async ({ itemId, days }) =>
      okOrMissing(await itemsDb.snoozeItem(db, householdId, itemId, days ?? DEFAULT_SNOOZE_DAYS, issuerEmail)),
  );

  return server;
}
