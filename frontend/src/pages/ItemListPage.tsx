import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateItemInput, Item, UpdateItemInput } from "@maintenance-reminder/shared";
import * as api from "../api/client.js";
import { ItemCard } from "../components/ItemCard.js";
import { ItemFormPage } from "./ItemFormPage.js";

export function ItemListPage() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const itemsQuery = useQuery({ queryKey: ["items"], queryFn: () => api.listItems() });

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

  const items = itemsQuery.data ?? [];

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

      {isAdding && (
        <ItemFormPage
          onSubmit={(input) => createMutation.mutate(input as CreateItemInput)}
          onCancel={() => setIsAdding(false)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {items.length === 0 && !isAdding && (
        <p className="text-sm text-slate-500">まだアイテムが登録されていません。「+ アイテムを追加」から登録してください。</p>
      )}

      <div className="space-y-3">
        {items.map((item) =>
          editingItem?.id === item.id ? (
            <ItemFormPage
              key={item.id}
              initialItem={item}
              onSubmit={(input) => updateMutation.mutate({ id: item.id, input: input as UpdateItemInput })}
              onCancel={() => setEditingItem(null)}
              isSubmitting={updateMutation.isPending}
            />
          ) : (
            <ItemCard
              key={item.id}
              item={item}
              onComplete={() => completeMutation.mutate(item.id)}
              onSnooze={(days) => snoozeMutation.mutate({ id: item.id, days })}
              onEdit={() => setEditingItem(item)}
              onDelete={() => {
                if (confirm(`「${item.name}」を削除しますか?`)) deleteMutation.mutate(item.id);
              }}
              isMutating={completeMutation.isPending || snoozeMutation.isPending}
            />
          ),
        )}
      </div>
    </div>
  );
}
