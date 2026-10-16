import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "./api/client.js";
import { ItemListPage } from "./pages/ItemListPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { NotificationLogPage } from "./pages/NotificationLogPage.js";

type Tab = "items" | "settings" | "log";

function tabButtonClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;
}

function highlightItemIdsFromUrl(): string[] {
  const params = new URLSearchParams(window.location.search);
  const items = params.get("items");
  if (items) return items.split(",").map((id) => id.trim()).filter(Boolean);
  const item = params.get("item");
  return item ? [item] : [];
}

export function App() {
  const [highlightItemIds] = useState<string[]>(highlightItemIdsFromUrl);
  const [tab, setTab] = useState<Tab>("items");
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-slate-900">お手入れリマインダー</h1>
          <nav className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setTab("items")} className={tabButtonClass(tab === "items")}>
              アイテム
            </button>
            <button type="button" onClick={() => setTab("settings")} className={tabButtonClass(tab === "settings")}>
              通知設定
            </button>
            <button type="button" onClick={() => setTab("log")} className={tabButtonClass(tab === "log")}>
              通知履歴
            </button>
            {meQuery.data?.isAdmin && (
              <a href="/admin" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                管理画面
              </a>
            )}
            <a href="/cdn-cgi/access/logout" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              ログアウト
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {tab === "items" && <ItemListPage highlightItemIds={highlightItemIds} />}
        {tab === "settings" && <SettingsPage />}
        {tab === "log" && <NotificationLogPage />}
      </main>
    </div>
  );
}
