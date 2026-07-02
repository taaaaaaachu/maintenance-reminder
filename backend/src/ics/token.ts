import { getConfigValue, setConfigValue } from "../db/appConfig.js";

const ICS_FEED_TOKEN_KEY = "ics_feed_token";

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreateIcsFeedToken(db: D1Database): Promise<string> {
  const existing = await getConfigValue(db, ICS_FEED_TOKEN_KEY);
  if (existing) return existing;

  const token = generateToken();
  await setConfigValue(db, ICS_FEED_TOKEN_KEY, token);
  return token;
}

export async function regenerateIcsFeedToken(db: D1Database): Promise<string> {
  const token = generateToken();
  await setConfigValue(db, ICS_FEED_TOKEN_KEY, token);
  return token;
}
