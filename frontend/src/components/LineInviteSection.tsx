import { useQuery } from "@tanstack/react-query";
import * as api from "../api/client.js";

export function LineInviteSection() {
  const inviteQuery = useQuery({ queryKey: ["lineInvite"], queryFn: api.getLineInviteUrl });

  if (inviteQuery.isLoading) return null;

  const url = inviteQuery.data?.url ?? null;

  return (
    <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
      <p className="text-slate-600">
        下の友だち追加リンク(またはLINE公式アカウントマネージャーで発行されるQRコード)を家族に共有し、友だち追加後、管理者から個別に伝えられた招待コードをトーク画面に送信してもらってください。招待コードが正しければ、自動的に通知の宛先として登録されます。
      </p>

      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-blue-600 underline">
          {url}
        </a>
      )}
    </div>
  );
}
