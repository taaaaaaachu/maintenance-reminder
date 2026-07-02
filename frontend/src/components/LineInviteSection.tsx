import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.js";

export function LineInviteSection() {
  const queryClient = useQueryClient();
  const inviteQuery = useQuery({ queryKey: ["lineInvite"], queryFn: api.getLineInviteUrl });
  const [isEditing, setIsEditing] = useState(false);
  const [editingUrl, setEditingUrl] = useState("");

  const saveMutation = useMutation({
    mutationFn: (url: string) => api.updateLineInviteUrl(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineInvite"] });
      setIsEditing(false);
    },
  });

  if (inviteQuery.isLoading) return null;

  const url = inviteQuery.data?.url ?? null;

  return (
    <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
      <p className="text-slate-600">
        下の友だち追加リンク(またはLINE公式アカウントマネージャーで発行されるQRコード)を家族に共有してください。友だち追加後に何かメッセージを送ると、自動的に通知の宛先として登録されます。
      </p>

      {url && !isEditing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline">
            {url}
          </a>
          <button
            type="button"
            onClick={() => {
              setEditingUrl(url);
              setIsEditing(true);
            }}
            className="text-xs text-slate-500 underline"
          >
            編集
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate(editingUrl);
          }}
          className="mt-2 flex flex-wrap gap-2"
        >
          <input
            type="url"
            required
            placeholder="https://line.me/R/ti/p/@xxxxx"
            value={editingUrl}
            onChange={(e) => setEditingUrl(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            保存
          </button>
        </form>
      )}
    </div>
  );
}
