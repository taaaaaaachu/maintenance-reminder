import type { Household, HouseholdMember } from "@maintenance-reminder/shared";

interface HouseholdMemberRow {
  id: string;
  household_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

function rowToMember(row: HouseholdMemberRow): HouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export async function getHouseholdIdByEmail(db: D1Database, email: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT household_id FROM household_members WHERE email = ?")
    .bind(email)
    .first<{ household_id: string }>();
  return row?.household_id ?? null;
}

export async function createHousehold(db: D1Database, id: string, name: string): Promise<void> {
  await db.prepare("INSERT INTO households (id, name) VALUES (?, ?)").bind(id, name).run();
}

export async function addHouseholdMember(
  db: D1Database,
  householdId: string,
  email: string,
  displayName: string | null,
): Promise<HouseholdMember> {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO household_members (id, household_id, email, display_name) VALUES (?, ?, ?, ?)")
    .bind(id, householdId, email, displayName)
    .run();
  const row = await db.prepare("SELECT * FROM household_members WHERE id = ?").bind(id).first<HouseholdMemberRow>();
  if (!row) throw new Error("Failed to add household member");
  return rowToMember(row);
}

export async function getHousehold(db: D1Database, id: string): Promise<Household | null> {
  const householdRow = await db.prepare("SELECT * FROM households WHERE id = ?").bind(id).first<{
    id: string;
    name: string;
    created_at: string;
  }>();
  if (!householdRow) return null;

  const { results } = await db
    .prepare("SELECT * FROM household_members WHERE household_id = ? ORDER BY created_at ASC")
    .bind(id)
    .all<HouseholdMemberRow>();

  return {
    id: householdRow.id,
    name: householdRow.name,
    createdAt: householdRow.created_at,
    members: results.map(rowToMember),
  };
}

export async function listHouseholds(db: D1Database): Promise<Household[]> {
  const { results: householdRows } = await db
    .prepare("SELECT * FROM households ORDER BY created_at ASC")
    .all<{ id: string; name: string; created_at: string }>();

  const { results: memberRows } = await db
    .prepare("SELECT * FROM household_members ORDER BY created_at ASC")
    .all<HouseholdMemberRow>();

  return householdRows.map((h) => ({
    id: h.id,
    name: h.name,
    createdAt: h.created_at,
    members: memberRows.filter((m) => m.household_id === h.id).map(rowToMember),
  }));
}
