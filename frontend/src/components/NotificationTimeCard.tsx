import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.js";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = String(Math.floor(i / 2)).padStart(2, "0");
  const minute = i % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

export function NotificationTimeCard() {
  const queryClient = useQueryClient();
  const timeQuery = useQuery({ queryKey: ["notificationTime"], queryFn: api.getNotificationTime });

  const saveMutation = useMutation({
    mutationFn: (time: string) => api.updateNotificationTime(time),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationTime"] });
    },
  });

  if (timeQuery.isLoading) return null;
  if (timeQuery.isError) return <p className="text-red-600">読み込みに失敗しました: {String(timeQuery.error)}</p>;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">通知時刻</h3>
      <p className="mt-2 text-sm text-slate-600">
        毎日この時刻に、期限が近い・過ぎているお手入れの通知をまとめて送信します(30分単位で指定できます)。
      </p>
      <div className="mt-3 flex items-center gap-2">
        <label className="text-sm">
          <span className="sr-only">通知時刻</span>
          <select
            value={timeQuery.data?.time}
            onChange={(e) => saveMutation.mutate(e.target.value)}
            disabled={saveMutation.isPending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        {saveMutation.isPending && <span className="text-xs text-slate-400">保存中...</span>}
      </div>
    </div>
  );
}
