import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.js";
import { TIME_OPTIONS } from "../lib/timeOptions.js";

export function DefaultNotifyTimeCard() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["defaultNotifyTime"], queryFn: api.getDefaultNotifyTime });
  const [time, setTime] = useState("07:00");

  useEffect(() => {
    if (query.data) setTime(query.data.time);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (value: string) => api.updateDefaultNotifyTime(value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["defaultNotifyTime"] }),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">アイテム追加時の通知時刻の初期値</h3>
      <p className="mt-2 text-sm text-slate-600">
        新しくアイテムを追加するときに、通知時刻の初期値として使われます。アイテムごとに個別に変更することもできます。
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="text-slate-600">通知時刻</span>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => mutation.mutate(time)}
          disabled={mutation.isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          保存
        </button>
        {mutation.isSuccess && <span className="text-xs text-emerald-600">保存しました</span>}
      </div>
    </div>
  );
}
