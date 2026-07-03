import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as adminApi from "../api/adminClient.js";

export function AdminApp() {
  const queryClient = useQueryClient();
  const householdsQuery = useQuery({ queryKey: ["admin", "households"], queryFn: adminApi.listHouseholds });

  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [memberInputs, setMemberInputs] = useState<Record<string, { email: string; displayName: string }>>({});
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "households"] });
  }

  const createHouseholdMutation = useMutation({
    mutationFn: (name: string) => adminApi.createHousehold({ name }),
    onSuccess: () => {
      setNewHouseholdName("");
      invalidate();
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ householdId, email, displayName }: { householdId: string; email: string; displayName: string }) =>
      adminApi.addHouseholdMember(householdId, { email, displayName: displayName || null }),
    onSuccess: (_data, { householdId }) => {
      setMemberInputs((prev) => ({ ...prev, [householdId]: { email: "", displayName: "" } }));
      invalidate();
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: (householdId: string) => adminApi.createInvite(householdId),
    onSuccess: (data, householdId) => {
      setIssuedCodes((prev) => ({ ...prev, [householdId]: data.code }));
    },
  });

  if (householdsQuery.isLoading) return <p className="p-4 text-slate-500">読み込み中...</p>;
  if (householdsQuery.isError) {
    return <p className="p-4 text-red-600">読み込みに失敗しました: {String(householdsQuery.error)}</p>;
  }

  const households = householdsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-slate-900">世帯管理</h1>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newHouseholdName.trim()) createHouseholdMutation.mutate(newHouseholdName.trim());
          }}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">世帯を追加</h2>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              required
              value={newHouseholdName}
              onChange={(e) => setNewHouseholdName(e.target.value)}
              placeholder="例: 実家"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={createHouseholdMutation.isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {households.map((household) => {
            const memberInput = memberInputs[household.id] ?? { email: "", displayName: "" };
            const issuedCode = issuedCodes[household.id];
            return (
              <div key={household.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">{household.name}</h3>

                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {household.members.map((member) => (
                    <li key={member.id}>
                      {member.displayName ? `${member.displayName} (${member.email})` : member.email}
                    </li>
                  ))}
                  {household.members.length === 0 && <li className="text-slate-400">メンバーがいません</li>}
                </ul>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (memberInput.email.trim()) {
                      addMemberMutation.mutate({
                        householdId: household.id,
                        email: memberInput.email.trim(),
                        displayName: memberInput.displayName.trim(),
                      });
                    }
                  }}
                  className="mt-3 flex flex-wrap gap-2"
                >
                  <input
                    type="email"
                    required
                    placeholder="メールアドレス"
                    value={memberInput.email}
                    onChange={(e) =>
                      setMemberInputs((prev) => ({
                        ...prev,
                        [household.id]: { ...memberInput, email: e.target.value },
                      }))
                    }
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="表示名(任意)"
                    value={memberInput.displayName}
                    onChange={(e) =>
                      setMemberInputs((prev) => ({
                        ...prev,
                        [household.id]: { ...memberInput, displayName: e.target.value },
                      }))
                    }
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={addMemberMutation.isPending}
                    className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    メンバー追加
                  </button>
                </form>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => createInviteMutation.mutate(household.id)}
                    disabled={createInviteMutation.isPending}
                    className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    LINE招待コードを発行
                  </button>
                  {issuedCode && (
                    <span className="rounded bg-amber-100 px-2 py-1 font-mono text-sm text-amber-800">
                      {issuedCode}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
