import { getConfigValue, setConfigValue } from "../db/appConfig.js";

const NOTIFICATION_TIME_KEY = "notification_time";
export const DEFAULT_NOTIFICATION_TIME = "07:00";

export async function getNotificationTime(db: D1Database): Promise<string> {
  return (await getConfigValue(db, NOTIFICATION_TIME_KEY)) ?? DEFAULT_NOTIFICATION_TIME;
}

export async function setNotificationTime(db: D1Database, time: string): Promise<void> {
  await setConfigValue(db, NOTIFICATION_TIME_KEY, time);
}
