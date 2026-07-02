export async function getConfigValue(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM app_config WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setConfigValue(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(key, value)
    .run();
}
