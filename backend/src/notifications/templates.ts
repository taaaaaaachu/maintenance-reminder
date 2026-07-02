import type { Item } from "@maintenance-reminder/shared";
import { daysBetweenDateStrings } from "../lib/date.js";

export interface NotificationMessage {
  title: string;
  body: string;
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

export function buildReminderMessage(item: Item, today: string): NotificationMessage {
  const overdueDays = daysBetweenDateStrings(item.nextDueAt, today);
  const { emoji, label } = urgencyFor(overdueDays);

  return {
    title: `${emoji}【${label}】${item.name}`,
    body: bodyFor(item, overdueDays),
  };
}
