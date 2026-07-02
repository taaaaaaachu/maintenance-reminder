const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayJstDateString(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysToDateString(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function jstDateStringToUtcStartIso(dateString: string): string {
  return new Date(`${dateString}T00:00:00+09:00`).toISOString();
}

export function daysBetweenDateStrings(fromDateString: string, toDateString: string): number {
  const from = new Date(`${fromDateString}T00:00:00Z`).getTime();
  const to = new Date(`${toDateString}T00:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export function currentJstTimeString(): string {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
