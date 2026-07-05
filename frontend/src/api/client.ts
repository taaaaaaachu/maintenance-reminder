import type {
  AddNotificationRecipientInput,
  ApiError,
  CreateItemInput,
  DefaultNotifyTime,
  IcsFeedToken,
  Item,
  ItemHistoryEntry,
  LineInviteUrl,
  NotificationChannel,
  NotificationLogEntry,
  NotificationRecipient,
  NotificationSetting,
  SnoozeItemInput,
  UpdateItemInput,
  UpdateNotificationSettingInput,
} from "@maintenance-reminder/shared";
import { handleAccessRedirect } from "./session.js";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  handleAccessRedirect(res);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listItems(includeInactive = false): Promise<Item[]> {
  return request(`/items${includeInactive ? "?includeInactive=true" : ""}`);
}

export function createItem(input: CreateItemInput): Promise<Item> {
  return request("/items", { method: "POST", body: JSON.stringify(input) });
}

export function updateItem(id: string, input: UpdateItemInput): Promise<Item> {
  return request(`/items/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteItem(id: string): Promise<void> {
  return request(`/items/${id}`, { method: "DELETE" });
}

export function completeItem(id: string): Promise<Item> {
  return request(`/items/${id}/complete`, { method: "POST" });
}

export function snoozeItem(id: string, input: SnoozeItemInput = {}): Promise<Item> {
  return request(`/items/${id}/snooze`, { method: "POST", body: JSON.stringify(input) });
}

export function getItemHistory(id: string): Promise<ItemHistoryEntry[]> {
  return request(`/items/${id}/history`);
}

export function listNotificationSettings(): Promise<NotificationSetting[]> {
  return request("/settings/notifications");
}

export function updateNotificationSetting(
  channel: NotificationChannel,
  input: UpdateNotificationSettingInput,
): Promise<NotificationSetting> {
  return request(`/settings/notifications/${channel}`, { method: "PUT", body: JSON.stringify(input) });
}

export function listNotificationRecipients(channel: NotificationChannel): Promise<NotificationRecipient[]> {
  return request(`/settings/notifications/${channel}/recipients`);
}

export function addNotificationRecipient(
  channel: NotificationChannel,
  input: AddNotificationRecipientInput,
): Promise<NotificationRecipient> {
  return request(`/settings/notifications/${channel}/recipients`, { method: "POST", body: JSON.stringify(input) });
}

export function removeNotificationRecipient(channel: NotificationChannel, id: string): Promise<void> {
  return request(`/settings/notifications/${channel}/recipients/${id}`, { method: "DELETE" });
}

export function testNotificationRecipient(channel: NotificationChannel, id: string): Promise<{ ok: boolean }> {
  return request(`/settings/notifications/${channel}/recipients/${id}/test`, { method: "POST" });
}

export function getIcsFeedToken(): Promise<IcsFeedToken> {
  return request("/settings/ics-feed");
}

export function regenerateIcsFeedToken(): Promise<IcsFeedToken> {
  return request("/settings/ics-feed/regenerate", { method: "POST" });
}

export function getLineInviteUrl(): Promise<LineInviteUrl> {
  return request("/settings/line-invite");
}

export function listNotificationLog(limit = 50): Promise<NotificationLogEntry[]> {
  return request(`/notification-log?limit=${limit}`);
}

export function getDefaultNotifyTime(): Promise<DefaultNotifyTime> {
  return request("/settings/default-notify-time");
}

export function updateDefaultNotifyTime(time: string): Promise<DefaultNotifyTime> {
  return request("/settings/default-notify-time", { method: "PUT", body: JSON.stringify({ time }) });
}
