import { describe, expect, it } from "vitest";
import type { Item } from "@maintenance-reminder/shared";
import { generateIcsFeed } from "./generate.js";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "abc-123",
    name: "ロボット掃除機の清掃",
    category: null,
    intervalDays: 7,
    notifyDaysBefore: 0,
    notifyTime: "07:00",
    lastDoneAt: "2026-06-25",
    nextDueAt: "2026-07-02",
    memo: null,
    isActive: true,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2026-07-01T00:00:00.000Z");

describe("generateIcsFeed", () => {
  it("wraps events in a VCALENDAR envelope", () => {
    const ics = generateIcsFeed([], "example.com", NOW);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toMatch(/END:VCALENDAR$/);
  });

  it("emits one VEVENT per item with a stable UID derived from the item id", () => {
    const ics = generateIcsFeed([makeItem({ id: "item-1" })], "example.com", NOW);

    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:item-1@example.com");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260702");
    expect(ics).toContain("SUMMARY:ロボット掃除機の清掃のお手入れ");
    expect(ics).toContain("END:VEVENT");
  });

  it("produces the same UID across calls for the same item (idempotent for calendar sync)", () => {
    const first = generateIcsFeed([makeItem({ id: "stable-id" })], "example.com", NOW);
    const second = generateIcsFeed([makeItem({ id: "stable-id", name: "名前が変わっても" })], "example.com", NOW);

    const extractUid = (ics: string) => ics.match(/UID:([^\r\n]+)/)?.[1];
    expect(extractUid(first)).toBe(extractUid(second));
  });

  it("includes a DESCRIPTION line only when the item has a memo", () => {
    const withMemo = generateIcsFeed([makeItem({ memo: "フィルターも忘れずに" })], "example.com", NOW);
    const withoutMemo = generateIcsFeed([makeItem({ memo: null })], "example.com", NOW);

    expect(withMemo).toContain("DESCRIPTION:フィルターも忘れずに");
    expect(withoutMemo).not.toContain("DESCRIPTION:");
  });

  it("escapes commas, semicolons, and backslashes in text fields", () => {
    const ics = generateIcsFeed([makeItem({ name: "A;B,C\\D" })], "example.com", NOW);
    expect(ics).toContain("SUMMARY:A\\;B\\,C\\\\Dのお手入れ");
  });
});
