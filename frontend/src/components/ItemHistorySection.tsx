import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ItemHistoryEntry } from "@maintenance-reminder/shared";
import * as api from "../api/client.js";

function daysBetween(fromDateString: string, toDateString: string): number {
  const from = new Date(`${fromDateString}T00:00:00Z`).getTime();
  const to = new Date(`${toDateString}T00:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeStats(history: ItemHistoryEntry[]) {
  const completions = history.filter(
    (h): h is ItemHistoryEntry & { completedDate: string } => h.eventType === "complete" && h.completedDate !== null,
  );

  const intervals: number[] = [];
  for (let i = 0; i < completions.length - 1; i++) {
    intervals.push(daysBetween(completions[i + 1]!.completedDate, completions[i]!.completedDate));
  }

  const delays = completions.map((c) => daysBetween(c.nextDueAtBefore, c.completedDate));

  return { avgInterval: average(intervals), avgDelay: average(delays) };
}

function eventLabel(entry: ItemHistoryEntry): string {
  if (entry.eventType === "complete") return `${entry.completedDate} お手入れ完了`;
  return `${entry.occurredAt.slice(0, 10)} ${entry.snoozeDays}日スヌーズ`;
}

interface ItemHistorySectionProps {
  itemId: string;
}

export function ItemHistorySection({ itemId }: ItemHistorySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const historyQuery = useQuery({
    queryKey: ["itemHistory", itemId],
    queryFn: () => api.getItemHistory(itemId),
    enabled: expanded,
  });

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        {expanded ? "履歴を閉じる" : "履歴を見る"}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          {historyQuery.isLoading && <p>読み込み中...</p>}
          {historyQuery.isError && <p className="text-red-600">読み込みに失敗しました</p>}
          {historyQuery.data && historyQuery.data.length === 0 && <p>まだ履歴がありません。</p>}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <>
              {(() => {
                const { avgInterval, avgDelay } = computeStats(historyQuery.data);
                return (
                  <p className="mb-2 text-slate-500">
                    {avgInterval !== null && <>実績の平均間隔: 約{avgInterval.toFixed(1)}日 / </>}
                    {avgDelay !== null && (
                      <>
                        平均{avgDelay >= 0 ? "遅延" : "前倒し"}: {Math.abs(avgDelay).toFixed(1)}日
                      </>
                    )}
                  </p>
                );
              })()}
              <ul className="space-y-1">
                {historyQuery.data.map((entry) => (
                  <li key={entry.id}>{eventLabel(entry)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
