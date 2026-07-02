import type { Item } from "@maintenance-reminder/shared";

function formatDateForIcs(dateString: string): string {
  return dateString.replace(/-/g, "");
}

function formatTimestampForIcs(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildEvent(item: Item, domain: string, now: Date): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${item.id}@${domain}`,
    `DTSTAMP:${formatTimestampForIcs(now)}`,
    `DTSTART;VALUE=DATE:${formatDateForIcs(item.nextDueAt)}`,
    `SUMMARY:${escapeIcsText(item.name)}`,
  ];
  if (item.memo) {
    lines.push(`DESCRIPTION:${escapeIcsText(item.memo)}`);
  }
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function generateIcsFeed(items: Item[], domain: string, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//maintenance-reminder//JP",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:お手入れリマインダー",
    ...items.map((item) => buildEvent(item, domain, now)),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
