import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_TIME, getNotificationTime, setNotificationTime } from "./scheduleConfig.js";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM app_config").run();
});

describe("getNotificationTime", () => {
  it("returns the default time when nothing is configured", async () => {
    expect(await getNotificationTime(env.DB)).toBe(DEFAULT_NOTIFICATION_TIME);
  });
});

describe("setNotificationTime", () => {
  it("persists a new value that getNotificationTime then returns", async () => {
    await setNotificationTime(env.DB, "20:30");
    expect(await getNotificationTime(env.DB)).toBe("20:30");
  });

  it("overwrites a previously saved value", async () => {
    await setNotificationTime(env.DB, "20:30");
    await setNotificationTime(env.DB, "06:00");
    expect(await getNotificationTime(env.DB)).toBe("06:00");
  });
});
