import type { Item } from "@maintenance-reminder/shared";

export interface NotificationMessage {
  title: string;
  body: string;
}

export function buildReminderMessage(item: Item): NotificationMessage {
  return {
    title: `【お手入れ時期】${item.name}`,
    body: `${item.name} のお手入れ時期です(予定日: ${item.nextDueAt})。`,
  };
}
