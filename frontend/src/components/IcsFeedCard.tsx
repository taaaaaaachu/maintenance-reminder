import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.js";

export function IcsFeedCard() {
  const queryClient = useQueryClient();
  const tokenQuery = useQuery({ queryKey: ["icsFeedToken"], queryFn: api.getIcsFeedToken });

  const regenerateMutation = useMutation({
    mutationFn: api.regenerateIcsFeedToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icsFeedToken"] });
    },
  });

  if (tokenQuery.isLoading) return <p className="text-slate-500">読み込み中...</p>;
  if (tokenQuery.isError) return <p className="text-red-600">読み込みに失敗しました: {String(tokenQuery.error)}</p>;

  const token = tokenQuery.data?.token ?? "";
  const httpsUrl = `${window.location.origin}/feed/${token}.ics`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">カレンダー連携(ICS購読)</h3>
      <p className="mt-2 text-sm text-slate-600">
        以下のURLをGoogleカレンダー/Appleカレンダーの「URLで外部カレンダーを購読」機能に登録すると、
        お手入れ予定が自動的に反映されます。
      </p>

      <div className="mt-3 space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">購読URL</span>
          <input
            type="text"
            readOnly
            value={httpsUrl}
            onFocus={(e) => e.target.select()}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <p className="break-all text-xs text-slate-400">webcal版: {webcalUrl}</p>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            if (confirm("購読URLを再発行しますか?既存のカレンダー購読は無効になります。")) {
              regenerateMutation.mutate();
            }
          }}
          disabled={regenerateMutation.isPending}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          URLを再発行
        </button>
      </div>
    </div>
  );
}
