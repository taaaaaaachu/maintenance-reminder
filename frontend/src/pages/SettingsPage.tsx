import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationChannel } from "@maintenance-reminder/shared";
import * as api from "../api/client.js";
import { NotificationChannelCard } from "../components/NotificationChannelCard.js";
import { IcsFeedCard } from "../components/IcsFeedCard.js";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const settingsQuery = useQuery({ queryKey: ["notificationSettings"], queryFn: api.listNotificationSettings });

  const saveMutation = useMutation({
    mutationFn: ({ channel, isEnabled, config }: { channel: NotificationChannel; isEnabled: boolean; config: Record<string, string> }) =>
      api.updateNotificationSetting(channel, { isEnabled, config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationSettings"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (channel: NotificationChannel) => api.testNotificationSetting(channel),
    onSuccess: (_data, channel) => {
      setTestResults((prev) => ({ ...prev, [channel]: { ok: true, message: "送信しました" } }));
    },
    onError: (error, channel) => {
      setTestResults((prev) => ({ ...prev, [channel]: { ok: false, message: String(error) } }));
    },
  });

  if (settingsQuery.isLoading) return <p className="text-slate-500">読み込み中...</p>;
  if (settingsQuery.isError) return <p className="text-red-600">読み込みに失敗しました: {String(settingsQuery.error)}</p>;

  const settings = settingsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">通知設定</h2>
      <div className="space-y-3">
        {settings.map((setting) => (
          <NotificationChannelCard
            key={setting.channel}
            setting={setting}
            onSave={(isEnabled, config) => saveMutation.mutate({ channel: setting.channel, isEnabled, config })}
            onTest={() => testMutation.mutate(setting.channel)}
            isSaving={saveMutation.isPending && saveMutation.variables?.channel === setting.channel}
            isTesting={testMutation.isPending && testMutation.variables === setting.channel}
            testResult={testResults[setting.channel] ?? null}
          />
        ))}
      </div>

      <IcsFeedCard />
    </div>
  );
}
