import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationChannel, NotificationSetting } from "@maintenance-reminder/shared";
import * as api from "../api/client.js";
import { LineInviteSection } from "./LineInviteSection.js";

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  line: "LINE",
  email: "メール",
  pushover: "Pushover",
};

const RECIPIENT_FIELD_LABEL: Record<NotificationChannel, string> = {
  line: "LINE User ID",
  email: "メールアドレス",
  pushover: "Pushover User Key",
};

interface NotificationChannelCardProps {
  setting: NotificationSetting;
}

export function NotificationChannelCard({ setting }: NotificationChannelCardProps) {
  const queryClient = useQueryClient();
  const [newIdentifier, setNewIdentifier] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const recipientsQuery = useQuery({
    queryKey: ["notificationRecipients", setting.channel],
    queryFn: () => api.listNotificationRecipients(setting.channel),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: (isEnabled: boolean) => api.updateNotificationSetting(setting.channel, { isEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notificationSettings"] }),
  });

  const addRecipientMutation = useMutation({
    mutationFn: () =>
      api.addNotificationRecipient(setting.channel, { identifier: newIdentifier, label: newLabel || null }),
    onSuccess: () => {
      setNewIdentifier("");
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: ["notificationRecipients", setting.channel] });
    },
  });

  const removeRecipientMutation = useMutation({
    mutationFn: (id: string) => api.removeNotificationRecipient(setting.channel, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notificationRecipients", setting.channel] }),
  });

  const testRecipientMutation = useMutation({
    mutationFn: (id: string) => api.testNotificationRecipient(setting.channel, id),
    onSuccess: (_data, id) => setTestResults((prev) => ({ ...prev, [id]: { ok: true, message: "送信しました" } })),
    onError: (error, id) => setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: String(error) } })),
  });

  const recipients = recipientsQuery.data ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{CHANNEL_LABELS[setting.channel]}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={setting.isEnabled}
            onChange={(e) => toggleEnabledMutation.mutate(e.target.checked)}
          />
          有効化
        </label>
      </div>

      {setting.channel === "line" ? (
        <LineInviteSection />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addRecipientMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="block text-sm">
            <span className="text-slate-600">{RECIPIENT_FIELD_LABEL[setting.channel]}</span>
            <input
              type={setting.channel === "email" ? "email" : "text"}
              required
              value={newIdentifier}
              onChange={(e) => setNewIdentifier(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">表示名(任意)</span>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={addRecipientMutation.isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            追加
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2">
        {recipients.length === 0 && <p className="text-sm text-slate-500">まだ宛先が登録されていません。</p>}
        {recipients.map((recipient) => {
          const testResult = testResults[recipient.id];
          return (
            <div
              key={recipient.id}
              className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-700">{recipient.label || recipient.identifier}</span>
              {recipient.label && <span className="text-xs text-slate-400">{recipient.identifier}</span>}
              <button
                type="button"
                onClick={() => testRecipientMutation.mutate(recipient.id)}
                disabled={testRecipientMutation.isPending}
                className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                テスト送信
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`「${recipient.label || recipient.identifier}」を削除しますか?`)) {
                    removeRecipientMutation.mutate(recipient.id);
                  }
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                削除
              </button>
              {testResult && (
                <span className={`text-xs ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {testResult.message}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
