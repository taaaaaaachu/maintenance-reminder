import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysUntil, dueBadgeClass, dueLabel } from "./dueStatus.js";

describe("daysUntil", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-07-02T03:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for today", () => {
    expect(daysUntil("2026-07-02")).toBe(0);
  });

  it("returns a positive number of days for a future date", () => {
    expect(daysUntil("2026-07-05")).toBe(3);
  });

  it("returns a negative number of days for a past date", () => {
    expect(daysUntil("2026-06-29")).toBe(-3);
  });
});

describe("dueBadgeClass", () => {
  it("marks overdue (negative days) as red", () => {
    expect(dueBadgeClass(-1)).toContain("red");
  });

  it("marks due within 3 days as amber", () => {
    expect(dueBadgeClass(0)).toContain("amber");
    expect(dueBadgeClass(3)).toContain("amber");
  });

  it("marks due further out as neutral slate", () => {
    expect(dueBadgeClass(4)).toContain("slate");
  });
});

describe("dueLabel", () => {
  it("shows overdue days as absolute value", () => {
    expect(dueLabel(-3)).toBe("3日超過");
  });

  it("shows 本日 for today", () => {
    expect(dueLabel(0)).toBe("本日");
  });

  it("shows remaining days for the future", () => {
    expect(dueLabel(5)).toBe("あと5日");
  });
});
