import { describe, expect, it } from "vitest";
import type { Item } from "@maintenance-reminder/shared";
import { buildReminderMessage } from "./templates.js";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "1",
    name: "ロボット掃除機のダストボックス清掃",
    category: null,
    intervalDays: 7,
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
    const message = buildReminderMessage(makeItem());

    expect(message.title).toContain("ロボット掃除機のダストボックス清掃");
    expect(message.body).toContain("ロボット掃除機のダストボックス清掃");
    expect(message.body).toContain("2026-07-02");
  });
});
