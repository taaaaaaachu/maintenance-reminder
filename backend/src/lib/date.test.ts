import { describe, expect, it, vi } from "vitest";
import { addDaysToDateString, todayJstDateString } from "./date.js";

describe("addDaysToDateString", () => {
  it("adds days within the same month", () => {
    expect(addDaysToDateString("2026-07-02", 5)).toBe("2026-07-07");
  });

  it("rolls over to the next month", () => {
    expect(addDaysToDateString("2026-07-30", 5)).toBe("2026-08-04");
  });

  it("rolls over to the next year", () => {
    expect(addDaysToDateString("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("handles negative days (moving the date backward)", () => {
    expect(addDaysToDateString("2026-07-02", -5)).toBe("2026-06-27");
  });

  it("handles zero days", () => {
    expect(addDaysToDateString("2026-07-02", 0)).toBe("2026-07-02");
  });
});

describe("todayJstDateString", () => {
  it("returns the JST calendar date even when UTC date has already rolled over backward", () => {
    // 2026-07-02T23:30:00Z is 2026-07-03 08:30 in JST
    vi.setSystemTime(new Date("2026-07-02T23:30:00Z"));
    expect(todayJstDateString()).toBe("2026-07-03");
    vi.useRealTimers();
  });

  it("returns the JST calendar date just before JST midnight", () => {
    // 2026-07-02T14:59:00Z is 2026-07-02 23:59 in JST
    vi.setSystemTime(new Date("2026-07-02T14:59:00Z"));
    expect(todayJstDateString()).toBe("2026-07-02");
    vi.useRealTimers();
  });
});
