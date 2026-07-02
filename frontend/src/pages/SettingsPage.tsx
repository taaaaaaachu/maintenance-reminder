import { useQuery } from "@tanstack/react-query";
import * as api from "../api/client.js";
import { NotificationChannelCard } from "../components/NotificationChannelCard.js";
import { NotificationTimeCard } from "../components/NotificationTimeCard.js";
import { IcsFeedCard } from "../components/IcsFeedCard.js";

export function SettingsPage() {
  const settingsQuery = useQuery({ queryKey: ["notificationSettings"], queryFn: api.listNotificationSettings });

  if (settingsQuery.isLoading) return <p className="text-slate-500">読み込み中...</p>;
  if (settingsQuery.isError) return <p className="text-red-600">読み込みに失敗しました: {String(settingsQuery.error)}</p>;

  const settings = settingsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">通知設定</h2>

      <NotificationTimeCard />

      <div className="space-y-3">
        {settings.map((setting) => (
          <NotificationChannelCard key={setting.channel} setting={setting} />
        ))}
      </div>

      <IcsFeedCard />
    </div>
  );
}
