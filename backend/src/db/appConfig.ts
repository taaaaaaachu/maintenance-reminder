export async function getConfigValue(db: D1Database, householdId: string, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM app_config WHERE household_id = ? AND key = ?")
    .bind(householdId, key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setConfigValue(
  db: D1Database,
  householdId: string,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_config (household_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(household_id, key) DO UPDATE SET value = excluded.value`,
    )
    .bind(householdId, key, value)
    .run();
}

/**
 * ICSフィードのURLはCloudflare Accessヘッダーが付かない外部クローラーから直接叩かれるため、
 * household未確定の状態から始まる唯一の例外パターン。トークンの値からhousehold_idを逆引きする。
 */
export async function getHouseholdIdByIcsToken(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT household_id FROM app_config WHERE key = 'ics_feed_token' AND value = ?")
    .bind(token)
    .first<{ household_id: string }>();
  return row?.household_id ?? null;
}
