import { useState, type FormEvent } from "react";
import type { CreateItemInput, Item, UpdateItemInput } from "@maintenance-reminder/shared";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = String(Math.floor(i / 2)).padStart(2, "0");
  const minute = i % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

interface ItemFormPageProps {
  initialItem?: Item;
  categories?: string[];
  onSubmit: (input: CreateItemInput | UpdateItemInput) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ItemFormPage({ initialItem, categories = [], onSubmit, onCancel, isSubmitting }: ItemFormPageProps) {
  const [name, setName] = useState(initialItem?.name ?? "");
  const [category, setCategory] = useState(initialItem?.category ?? "");
  const [intervalDays, setIntervalDays] = useState(initialItem?.intervalDays ?? 30);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(initialItem?.notifyDaysBefore ?? 0);
  const [notifyTime, setNotifyTime] = useState(initialItem?.notifyTime ?? "07:00");
  const [memo, setMemo] = useState(initialItem?.memo ?? "");
  const [lastDoneAt, setLastDoneAt] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (initialItem) {
      onSubmit({
        name,
        category: category || null,
        intervalDays,
        notifyDaysBefore,
        notifyTime,
        memo: memo || null,
      });
    } else {
      onSubmit({
        name,
        category: category || null,
        intervalDays,
        notifyDaysBefore,
        notifyTime,
        memo: memo || null,
        lastDoneAt: lastDoneAt || undefined,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{initialItem ? "アイテムを編集" : "アイテムを追加"}</h3>

      <div className="mt-3 space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">名前</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="例: ロボット掃除機のダストボックス清掃"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">カテゴリ(任意)</span>
          <input
            type="text"
            list="category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="例: 掃除機"
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">お手入れ間隔(日数)</span>
          <input
            type="number"
            required
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>

        <div>
          <label className="block text-sm">
            <span className="text-slate-600">何日前から通知するか</span>
            <input
              type="number"
              required
              min={0}
              value={notifyDaysBefore}
              onChange={(e) => setNotifyDaysBefore(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <span className="mt-1 block text-xs text-slate-400">0なら予定日当日から通知します</span>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">通知時刻</span>
          <select
            value={notifyTime}
            onChange={(e) => setNotifyTime(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">メモ(任意)</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            rows={2}
          />
        </label>

        {!initialItem && (
          <label className="block text-sm">
            <span className="text-slate-600">前回お手入れ日(任意、未入力なら作成日)</span>
            <input
              type="date"
              value={lastDoneAt}
              onChange={(e) => setLastDoneAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {initialItem ? "更新する" : "追加する"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
