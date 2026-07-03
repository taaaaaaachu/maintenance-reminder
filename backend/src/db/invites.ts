const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい 0/O, 1/I/L を除外
const INVITE_CODE_LENGTH = 8;

function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (b) => INVITE_CODE_CHARS[b % INVITE_CODE_CHARS.length]).join("");
}

export async function createInvite(
  db: D1Database,
  householdId: string,
  expiresAt: string | null,
): Promise<string> {
  const code = generateInviteCode();
  await db
    .prepare("INSERT INTO household_invites (code, household_id, channel, expires_at) VALUES (?, ?, 'line', ?)")
    .bind(code, householdId, expiresAt)
    .run();
  return code;
}

export async function consumeInvite(db: D1Database, code: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT household_id, expires_at FROM household_invites WHERE code = ? AND used_at IS NULL")
    .bind(code)
    .first<{ household_id: string; expires_at: string | null }>();
  if (!row) return null;
  if (row.expires_at && row.expires_at < new Date().toISOString()) return null;

  await db
    .prepare("UPDATE household_invites SET used_at = ? WHERE code = ? AND used_at IS NULL")
    .bind(new Date().toISOString(), code)
    .run();
  return row.household_id;
}
