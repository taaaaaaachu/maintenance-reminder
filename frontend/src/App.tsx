import { ItemListPage } from "./pages/ItemListPage.js";

export function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-slate-900">お手入れリマインダー</h1>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <ItemListPage />
      </main>
    </div>
  );
}
