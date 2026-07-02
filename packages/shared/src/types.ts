import type { NOTIFICATION_CHANNELS } from "./constants.js";

export interface Item {
  id: string;
  name: string;
  category: string | null;
  intervalDays: number;
  lastDoneAt: string | null;
  nextDueAt: string;
  memo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  name: string;
  category?: string | null;
  intervalDays: number;
  memo?: string | null;
  lastDoneAt?: string;
}

export interface UpdateItemInput {
  name?: string;
  category?: string | null;
  intervalDays?: number;
  memo?: string | null;
  isActive?: boolean;
}

export interface SnoozeItemInput {
  days?: number;
}

export interface ApiError {
  error: {
    message: string;
    code: string;
  };
}

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationSetting {
  channel: NotificationChannel;
  isEnabled: boolean;
}

export interface UpdateNotificationSettingInput {
  isEnabled: boolean;
}

export interface NotificationRecipient {
  id: string;
  channel: NotificationChannel;
  identifier: string;
  label: string | null;
  createdAt: string;
}

export interface AddNotificationRecipientInput {
  identifier: string;
  label?: string | null;
}

export interface IcsFeedToken {
  token: string;
}

export interface LineInviteUrl {
  url: string | null;
}
