import type { Item } from "@maintenance-reminder/shared";
import type { MonthlyCompletion } from "../db/history.js";
import { daysBetweenDateStrings } from "../lib/date.js";

export interface NotificationMessage {
  title: string;
  body: string;
  url: string;
}

function urgencyFor(overdueDays: number): { emoji: string; label: string } {
  if (overdueDays < 0) return { emoji: "📅", label: `あと${Math.abs(overdueDays)}日` };
  if (overdueDays === 0) return { emoji: "🔔", label: "本日" };
  if (overdueDays <= 3) return { emoji: "⚠️", label: `${overdueDays}日経過` };
  return { emoji: "🚨", label: `${overdueDays}日超過` };
}

function bodyFor(item: Item, overdueDays: number): string {
  if (overdueDays < 0) {
    return `${item.name} のお手入れ時期が近づいています(予定日: ${item.nextDueAt})。`;
  }
  if (overdueDays === 0) {
    return `${item.name} のお手入れ日です(予定日: ${item.nextDueAt})。`;
  }
  if (overdueDays <= 3) {
    return `${item.name} のお手入れ予定日を${overdueDays}日過ぎています(予定日: ${item.nextDueAt})。そろそろお手入れをお願いします。`;
  }
  return `${item.name} のお手入れ予定日を${overdueDays}日も過ぎています(予定日: ${item.nextDueAt})。早めのお手入れをお願いします。`;
}

function buildItemsUrl(baseUrl: string, items: Item[]): string {
  return `${baseUrl}/?items=${items.map((item) => item.id).join(",")}`;
}

export function buildReminderMessage(items: Item[], today: string, baseUrl: string): NotificationMessage {
  if (items.length === 1) {
    const item = items[0]!;
    const overdueDays = daysBetweenDateStrings(item.nextDueAt, today);
    const { emoji, label } = urgencyFor(overdueDays);

    return {
      title: `${emoji}【${label}】${item.name}`,
      body: bodyFor(item, overdueDays),
      url: buildItemsUrl(baseUrl, items),
    };
  }

  const lines = items.map((item) => {
    const overdueDays = daysBetweenDateStrings(item.nextDueAt, today);
    const { label } = urgencyFor(overdueDays);
    return `・${item.name}(${label})`;
  });

  return {
    title: `🔔【${items.length}件】お手入れリマインダー`,
    body: `以下のお手入れが必要です。\n\n${lines.join("\n")}`,
    url: buildItemsUrl(baseUrl, items),
  };
}

export function buildMonthlySummaryMessage(
  completions: MonthlyCompletion[],
  snoozeCount: number,
  monthLabel: string,
  baseUrl: string,
): NotificationMessage {
  const lines =
    completions.length > 0
      ? completions.map((c) => `・${c.completedDate} ${c.itemName}`)
      : ["完了したお手入れはありませんでした。"];

  const body = [
    `${monthLabel}のお手入れ実績です。`,
    "",
    `完了件数: ${completions.length}件`,
    `スヌーズ回数: ${snoozeCount}回`,
    "",
    ...lines,
  ].join("\n");

  return {
    title: `📊【${monthLabel}】お手入れ実績サマリー`,
    body,
    url: `${baseUrl}/`,
  };
}
