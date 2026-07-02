import { describe, expect, it } from "vitest";
import type { Item } from "@maintenance-reminder/shared";
import { buildReminderMessage } from "./templates.js";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "1",
    name: "ロボット掃除機のダストボックス清掃",
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

describe("buildReminderMessage", () => {
  it("includes the item name in the title and the due date in the body", () => {
    const message = buildReminderMessage(makeItem(), "2026-07-02", "https://reminder.example.com");

    expect(message.title).toContain("ロボット掃除機のダストボックス清掃");
    expect(message.body).toContain("ロボット掃除機のダストボックス清掃");
    expect(message.body).toContain("2026-07-02");
  });

  it("builds a URL that links back to the item using the given base URL", () => {
    const message = buildReminderMessage(makeItem({ id: "abc-123" }), "2026-07-02", "https://reminder.example.com");

    expect(message.url).toBe("https://reminder.example.com/?item=abc-123");
  });

  it("uses a pre-notice tone and emoji when notified before the due date", () => {
    const message = buildReminderMessage(makeItem({ nextDueAt: "2026-07-05" }), "2026-07-02", "https://reminder.example.com");

    expect(message.title).toContain("📅");
    expect(message.title).toContain("あと3日");
    expect(message.body).toContain("近づいています");
  });

  it("uses a 本日 tone and emoji when due today", () => {
    const message = buildReminderMessage(makeItem({ nextDueAt: "2026-07-02" }), "2026-07-02", "https://reminder.example.com");

    expect(message.title).toContain("🔔");
    expect(message.title).toContain("本日");
  });

  it("uses a mild warning tone within 3 days overdue", () => {
    const message = buildReminderMessage(makeItem({ nextDueAt: "2026-06-30" }), "2026-07-02", "https://reminder.example.com");

    expect(message.title).toContain("⚠️");
    expect(message.title).toContain("2日経過");
    expect(message.body).toContain("そろそろ");
  });

  it("uses a strong warning tone when overdue by more than 3 days", () => {
    const message = buildReminderMessage(makeItem({ nextDueAt: "2026-06-20" }), "2026-07-02", "https://reminder.example.com");

    expect(message.title).toContain("🚨");
    expect(message.title).toContain("12日超過");
    expect(message.body).toContain("早めのお手入れをお願いします");
  });
});
