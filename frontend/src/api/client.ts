import type { ApiError, CreateItemInput, Item, SnoozeItemInput, UpdateItemInput } from "@maintenance-reminder/shared";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listItems(includeInactive = false): Promise<Item[]> {
  return request(`/items${includeInactive ? "?includeInactive=true" : ""}`);
}

export function createItem(input: CreateItemInput): Promise<Item> {
  return request("/items", { method: "POST", body: JSON.stringify(input) });
}

export function updateItem(id: string, input: UpdateItemInput): Promise<Item> {
  return request(`/items/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteItem(id: string): Promise<void> {
  return request(`/items/${id}`, { method: "DELETE" });
}

export function completeItem(id: string): Promise<Item> {
  return request(`/items/${id}/complete`, { method: "POST" });
}

export function snoozeItem(id: string, input: SnoozeItemInput = {}): Promise<Item> {
  return request(`/items/${id}/snooze`, { method: "POST", body: JSON.stringify(input) });
}
