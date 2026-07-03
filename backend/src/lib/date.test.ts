import { describe, expect, it, vi } from "vitest";
import {
  addDaysToDateString,
  currentJstTimeString,
  daysAgoIso,
  daysBetweenDateStrings,
  isFirstDayOfJstMonth,
  jstDateStringToUtcStartIso,
  previousJstMonthRange,
  todayJstDateString,
} from "./date.js";

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

describe("jstDateStringToUtcStartIso", () => {
  it("converts JST midnight to the equivalent UTC instant (9 hours earlier)", () => {
    expect(jstDateStringToUtcStartIso("2026-07-02")).toBe("2026-07-01T15:00:00.000Z");
  });
});

describe("daysBetweenDateStrings", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetweenDateStrings("2026-07-02", "2026-07-02")).toBe(0);
  });

  it("returns a positive number when the second date is later", () => {
    expect(daysBetweenDateStrings("2026-07-02", "2026-07-10")).toBe(8);
  });

  it("returns a negative number when the second date is earlier", () => {
    expect(daysBetweenDateStrings("2026-07-10", "2026-07-02")).toBe(-8);
  });
});

describe("currentJstTimeString", () => {
  it("formats the current JST time as HH:MM", () => {
    // 2026-07-01T22:15:00Z is 2026-07-02 07:15 in JST
    vi.setSystemTime(new Date("2026-07-01T22:15:00Z"));
    expect(currentJstTimeString()).toBe("07:15");
    vi.useRealTimers();
  });

  it("pads single-digit hours and minutes", () => {
    // 2026-07-01T20:05:00Z is 2026-07-02 05:05 in JST
    vi.setSystemTime(new Date("2026-07-01T20:05:00Z"));
    expect(currentJstTimeString()).toBe("05:05");
    vi.useRealTimers();
  });
});

describe("daysAgoIso", () => {
  it("returns an ISO string N days before now", () => {
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    expect(daysAgoIso(30)).toBe("2026-06-10T00:00:00.000Z");
    vi.useRealTimers();
  });
});

describe("isFirstDayOfJstMonth", () => {
  it("returns true when today's JST date is the 1st", () => {
    // 2026-07-31T15:00:00Z is 2026-08-01 00:00 in JST
    vi.setSystemTime(new Date("2026-07-31T15:00:00Z"));
    expect(isFirstDayOfJstMonth()).toBe(true);
    vi.useRealTimers();
  });

  it("returns false on other days", () => {
    vi.setSystemTime(new Date("2026-07-02T03:00:00Z"));
    expect(isFirstDayOfJstMonth()).toBe(false);
    vi.useRealTimers();
  });
});

describe("previousJstMonthRange", () => {
  it("returns the previous month's date range and a Japanese label", () => {
    // 2026-07-31T15:00:00Z is 2026-08-01 00:00 in JST
    vi.setSystemTime(new Date("2026-07-31T15:00:00Z"));
    expect(previousJstMonthRange()).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
      label: "2026年7月",
    });
    vi.useRealTimers();
  });

  it("rolls over the year when the previous month is December", () => {
    // 2027-01-01T00:00:00+09:00 is 2026-12-31T15:00:00Z
    vi.setSystemTime(new Date("2026-12-31T15:00:00Z"));
    expect(previousJstMonthRange()).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
      label: "2026年12月",
    });
    vi.useRealTimers();
  });
});
