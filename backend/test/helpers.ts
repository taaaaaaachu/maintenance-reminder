import { env } from "cloudflare:workers";

export const TEST_HOUSEHOLD_ID = "test-household";
export const TEST_HOUSEHOLD_EMAIL = "test@example.com";

export async function setupTestHousehold(
  householdId = TEST_HOUSEHOLD_ID,
  email = TEST_HOUSEHOLD_EMAIL,
): Promise<void> {
  await env.DB.prepare("INSERT INTO households (id, name) VALUES (?, ?)").bind(householdId, householdId).run();
  await env.DB.prepare("INSERT INTO household_members (id, household_id, email) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), householdId, email)
    .run();
}

export function authHeaders(email: string = TEST_HOUSEHOLD_EMAIL): Record<string, string> {
  return { "cf-access-authenticated-user-email": email };
}
