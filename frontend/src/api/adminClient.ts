import type { AddHouseholdMemberInput, ApiError, CreateHouseholdInput, Household, HouseholdMember } from "@maintenance-reminder/shared";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
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

export function listHouseholds(): Promise<Household[]> {
  return request("/households");
}

export function createHousehold(input: CreateHouseholdInput): Promise<Household> {
  return request("/households", { method: "POST", body: JSON.stringify(input) });
}

export function addHouseholdMember(householdId: string, input: AddHouseholdMemberInput): Promise<HouseholdMember> {
  return request(`/households/${householdId}/members`, { method: "POST", body: JSON.stringify(input) });
}

export function createInvite(householdId: string): Promise<{ code: string }> {
  return request(`/households/${householdId}/invites`, { method: "POST" });
}

export function deleteHousehold(householdId: string): Promise<void> {
  return request(`/households/${householdId}`, { method: "DELETE" });
}
