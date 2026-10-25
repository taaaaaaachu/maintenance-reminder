import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.js";

const QUERY_KEY = ["agentConnections"];

/** AIエージェントの接続(MCP)の一覧・手動発行・取り消し。世帯の接続はメンバーの誰でも取り消せる。 */
export function AgentConnectionsCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const connectionsQuery = useQuery({ queryKey: QUERY_KEY, queryFn: api.listAgentConnections });

  const issueMutation = useMutation({
    mutationFn: api.issueAgentToken,
    onSuccess: (issued) => {
      setIssuedToken(issued.token);
      setName("");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: api.revokeAgentConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const mcpUrl = `${window.location.origin}/mcp`;
  const error = connectionsQuery.error ?? issueMutation.error ?? revokeMutation.error;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">AIエージェントの接続(MCP)</h3>
      <p className="mt-2 text-sm text-slate-600">
        AIエージェントに、この世帯のアイテムの閲覧・作成・編集・完了・スヌーズと通知履歴の閲覧を任せられます。
        MCPサーバーのURLは <code className="break-all">{mcpUrl}</code> です。OAuthに対応したエージェントはURLを登録するだけで接続でき、
        対応していないエージェントには下でトークンを発行して渡します。
      </p>

      {error && <p className="mt-2 text-sm text-red-600">エラー: {error.message}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          issueMutation.mutate(name);
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="エージェントの名前"
          maxLength={50}
          aria-label="エージェントの名前"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={issueMutation.isPending || name.trim() === ""}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          トークンを発行
        </button>
      </form>

      {issuedToken && (
        <label className="mt-3 block text-sm">
          <span className="text-slate-600">発行したトークン(この画面を離れると二度と表示されません)</span>
          <input
            type="text"
            readOnly
            value={issuedToken}
            onFocus={(e) => e.target.select()}
            className="mt-1 w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 font-mono text-sm"
          />
        </label>
      )}

      {connectionsQuery.isLoading ? (
        <p className="mt-3 text-sm text-slate-500">読み込み中...</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {(connectionsQuery.data ?? []).length === 0 && <li className="py-2 text-sm text-slate-500">接続はありません</li>}
          {(connectionsQuery.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900">{c.name}</p>
                <p className="break-all text-xs text-slate-500">
                  {c.origin} ・ {c.issuerEmail} ・ 最終使用 {new Date(c.lastUsedAt).toLocaleString("ja-JP")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`「${c.name}」の接続を取り消しますか?`)) revokeMutation.mutate(c.id);
                }}
                disabled={revokeMutation.isPending}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                取り消す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
