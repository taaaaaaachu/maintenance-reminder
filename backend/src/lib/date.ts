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

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isFirstDayOfJstMonth(): boolean {
  return todayJstDateString().endsWith("-01");
}

export interface JstMonthRange {
  start: string;
  end: string;
  label: string;
}

export function previousJstMonthRange(): JstMonthRange {
  const [yearStr, monthStr] = todayJstDateString().split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const monthPart = String(prevMonth).padStart(2, "0");

  return {
    start: `${prevYear}-${monthPart}-01`,
    end: `${prevYear}-${monthPart}-${String(lastDay).padStart(2, "0")}`,
    label: `${prevYear}年${prevMonth}月`,
  };
}
