import { useQuery } from "@tanstack/react-query";
import * as api from "../api/client.js";
import { CHANNEL_LABELS } from "../components/NotificationChannelCard.js";

export function NotificationLogPage() {
  const logQuery = useQuery({ queryKey: ["notificationLog"], queryFn: () => api.listNotificationLog() });

  if (logQuery.isLoading) return <p className="text-slate-500">読み込み中...</p>;
  if (logQuery.isError) return <p className="text-red-600">読み込みに失敗しました: {String(logQuery.error)}</p>;

  const entries = logQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">通知履歴</h2>

      {entries.length === 0 && <p className="text-sm text-slate-500">まだ通知履歴がありません。</p>}

      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-800">{entry.itemName ?? "(削除済みアイテム)"}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  entry.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
              >
                {entry.status === "success" ? "成功" : "失敗"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {CHANNEL_LABELS[entry.channel]} / {entry.recipientLabel ?? entry.recipientIdentifier} / {entry.sentAt}
            </p>
            {entry.errorMessage && <p className="mt-1 text-xs text-red-600">{entry.errorMessage}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
