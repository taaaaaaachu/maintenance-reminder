import type { NOTIFICATION_CHANNELS } from "./constants.js";

export interface Item {
  id: string;
  name: string;
  category: string | null;
  intervalDays: number;
  notifyDaysBefore: number;
  notifyTime: string;
  lastDoneAt: string | null;
  nextDueAt: string;
  memo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  recentSnoozeCount: number;
}

export interface CreateItemInput {
  name: string;
  category?: string | null;
  intervalDays: number;
  notifyDaysBefore?: number;
  notifyTime?: string;
  memo?: string | null;
  lastDoneAt?: string;
}

export interface UpdateItemInput {
  name?: string;
  category?: string | null;
  intervalDays?: number;
  notifyDaysBefore?: number;
  notifyTime?: string;
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

export interface Me {
  isAdmin: boolean;
}

export interface DefaultNotifyTime {
  time: string;
}

export type HistoryEventType = "complete" | "snooze";

export interface ItemHistoryEntry {
  id: string;
  itemId: string;
  eventType: HistoryEventType;
  occurredAt: string;
  completedDate: string | null;
  snoozeDays: number | null;
  intervalDays: number;
  nextDueAtBefore: string;
  nextDueAtAfter: string;
  actorEmail: string | null;
  actorDisplayName: string | null;
}

export type NotificationStatus = "success" | "failed";

export interface NotificationLogEntry {
  id: number;
  itemId: string;
  itemName: string | null;
  channel: NotificationChannel;
  recipientIdentifier: string;
  recipientLabel: string | null;
  status: NotificationStatus;
  errorMessage: string | null;
  sentAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  members: HouseholdMember[];
}

export interface CreateHouseholdInput {
  name: string;
}

export interface AddHouseholdMemberInput {
  email: string;
  displayName?: string | null;
}

export interface HouseholdInvite {
  code: string;
  householdId: string;
  channel: NotificationChannel;
  createdAt: string;
  usedAt: string | null;
  expiresAt: string | null;
}

/** エージェント接続(CONTEXT.md)。トークンそのものは含まない。 */
export interface AgentConnection {
  id: string;
  name: string;
  issuerEmail: string;
  /** 一覧での見分け方。「手動発行」・CIMDのドメイン・DCRの戻り先のドメイン。 */
  origin: string;
  createdAt: string;
  lastUsedAt: string;
}

/** 手動発行の結果。tokenはこのときしか分からない。 */
export interface IssuedAgentToken {
  id: string;
  token: string;
}
