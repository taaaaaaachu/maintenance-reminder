import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateItemInput, Item, UpdateItemInput } from "@maintenance-reminder/shared";
import * as api from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { daysUntil } from "../components/dueStatus.js";
import { ItemFormPage } from "./ItemFormPage.js";

interface ItemListPageProps {
  highlightItemIds?: string[];
}

export function ItemListPage({ highlightItemIds = [] }: ItemListPageProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const itemsQuery = useQuery({ queryKey: ["items"], queryFn: () => api.listItems() });
  const defaultNotifyTimeQuery = useQuery({
    queryKey: ["defaultNotifyTime"],
    queryFn: api.getDefaultNotifyTime,
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter((c): c is string => !!c))).sort(),
    [items],
  );

  useEffect(() => {
    if (highlightItemIds.length > 0) {
      setCategoryFilter("");
      setOverdueOnly(false);
    }
  }, [highlightItemIds]);

  useEffect(() => {
    if (highlightItemIds.length === 0 || items.length === 0) return;
    document.getElementById(`item-${highlightItemIds[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightItemIds, items.length]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["items"] });
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateItemInput) => api.createItem(input),
    onSuccess: () => {
      invalidate();
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateItemInput }) => api.updateItem(id, input),
    onSuccess: () => {
      invalidate();
      setEditingItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: invalidate,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.completeItem(id),
    onSuccess: invalidate,
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days?: number }) => api.snoozeItem(id, { days }),
    onSuccess: invalidate,
  });

  if (itemsQuery.isLoading) return <p className="text-slate-500">読み込み中...</p>;
  if (itemsQuery.isError) return <p className="text-red-600">読み込みに失敗しました: {String(itemsQuery.error)}</p>;

  const filteredItems = items
    .filter((item) => !categoryFilter || item.category === categoryFilter)
    .filter((item) => !overdueOnly || daysUntil(item.nextDueAt) < 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">お手入れアイテム一覧</h2>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            + アイテムを追加
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="category-filter" className="text-sm text-slate-600">
                ジャンルで絞り込み
              </label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">すべて</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            期限切れのみ表示
          </label>
        </div>
      )}

      {isAdding && (
        <ItemFormPage
          categories={categories}
          defaultNotifyTime={defaultNotifyTimeQuery.data?.time}
          onSubmit={(input) => createMutation.mutate(input as CreateItemInput)}
          onCancel={() => setIsAdding(false)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {items.length === 0 && !isAdding && (
        <p className="text-sm text-slate-500">まだアイテムが登録されていません。「+ アイテムを追加」から登録してください。</p>
      )}

      {items.length > 0 && filteredItems.length === 0 && (
        <p className="text-sm text-slate-500">該当するアイテムがありません。</p>
      )}

      <div className="space-y-3">
        {filteredItems.map((item) => (
          <div key={item.id} id={`item-${item.id}`}>
            {editingItem?.id === item.id ? (
              <ItemFormPage
                initialItem={item}
                categories={categories}
                onSubmit={(input) => updateMutation.mutate({ id: item.id, input: input as UpdateItemInput })}
                onCancel={() => setEditingItem(null)}
                isSubmitting={updateMutation.isPending}
              />
            ) : (
              <ItemCard
                item={item}
                onComplete={() => completeMutation.mutate(item.id)}
                onSnooze={(days) => snoozeMutation.mutate({ id: item.id, days })}
                onEdit={() => setEditingItem(item)}
                onDelete={() => {
                  if (confirm(`「${item.name}」を削除しますか?`)) deleteMutation.mutate(item.id);
                }}
                isMutating={completeMutation.isPending || snoozeMutation.isPending}
                isHighlighted={highlightItemIds.includes(item.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
