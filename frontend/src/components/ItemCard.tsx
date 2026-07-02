import type { Item } from "@maintenance-reminder/shared";
import { CompleteButton } from "./CompleteButton.js";
import { SnoozeButton } from "./SnoozeButton.js";
import { daysUntil, dueBadgeClass, dueLabel } from "./dueStatus.js";

interface ItemCardProps {
  item: Item;
  onComplete: () => void;
  onSnooze: (days?: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  isMutating?: boolean;
}

export function ItemCard({ item, onComplete, onSnooze, onEdit, onDelete, isMutating }: ItemCardProps) {
  const days = daysUntil(item.nextDueAt);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
          {item.category && <p className="text-sm text-slate-500">{item.category}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${dueBadgeClass(days)}`}>
          {dueLabel(days)}({item.nextDueAt})
        </span>
      </div>

      {item.memo && <p className="mt-2 text-sm text-slate-600">{item.memo}</p>}

      <p className="mt-2 text-xs text-slate-400">
        お手入れ間隔: {item.intervalDays}日 / 前回: {item.lastDoneAt ?? "記録なし"} / 通知: {item.notifyTime}
        {item.notifyDaysBefore > 0 && `(${item.notifyDaysBefore}日前から)`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CompleteButton onClick={onComplete} disabled={isMutating} />
        <SnoozeButton onClick={onSnooze} disabled={isMutating} />
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          編集
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          削除
        </button>
      </div>
    </div>
  );
}
