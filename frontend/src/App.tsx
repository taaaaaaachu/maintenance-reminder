import { useState } from "react";
import { ItemListPage } from "./pages/ItemListPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

type Tab = "items" | "settings";

function tabButtonClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;
}

export function App() {
  const [tab, setTab] = useState<Tab>("items");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">お手入れリマインダー</h1>
          <nav className="flex gap-2">
            <button type="button" onClick={() => setTab("items")} className={tabButtonClass(tab === "items")}>
              アイテム
            </button>
            <button type="button" onClick={() => setTab("settings")} className={tabButtonClass(tab === "settings")}>
              通知設定
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{tab === "items" ? <ItemListPage /> : <SettingsPage />}</main>
    </div>
  );
}
