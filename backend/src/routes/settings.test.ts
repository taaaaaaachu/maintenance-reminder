import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_URL = "https://example.com";

async function clearSettings() {
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM app_config").run();
}

beforeEach(async () => {
  await clearSettings();
});

describe("GET /api/settings/notifications", () => {
  it("returns a disabled default entry for every channel", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications`);
    const settings = (await res.json()) as Array<{ channel: string; isEnabled: boolean }>;

    expect(res.status).toBe(200);
    expect(settings.map((s) => s.channel).sort()).toEqual(["email", "line", "pushover"]);
    expect(settings.every((s) => s.isEnabled === false)).toBe(true);
  });
});

describe("PUT /api/settings/notifications/:channel", () => {
  it("saves a valid config and enables the channel", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: true, config: { userKey: "abc123" } }),
    });
    const json = (await res.json()) as { isEnabled: boolean; config: Record<string, string> };

    expect(res.status).toBe(200);
    expect(json.isEnabled).toBe(true);
    expect(json.config.userKey).toBe("abc123");
  });

  it("rejects an unknown channel with 400", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/unknown`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: false, config: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects enabling a channel with an invalid config (e.g. malformed email)", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: true, config: { toAddress: "not-an-email" } }),
    });
    expect(res.status).toBe(400);
  });

  it("allows saving an incomplete config when the channel is disabled", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: false, config: {} }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/settings/notifications/:channel/test", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("rejects with 400 when the channel is not enabled", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/line/test`, { method: "POST" });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a test notification through the configured channel", async () => {
    await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: true, config: { userKey: "abc123" } }),
    });

    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover/test`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns 400 with the underlying error message when sending fails", async () => {
    await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: true, config: { userKey: "abc123" } }),
    });
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover/test`, {
      method: "POST",
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/settings/ics-feed", () => {
  it("returns a token, creating one if it doesn't exist yet", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/ics-feed`);
    const json = (await res.json()) as { token: string };

    expect(res.status).toBe(200);
    expect(json.token).toBeTruthy();
  });

  it("returns the same token across requests", async () => {
    const first = (await (await exports.default.fetch(`${BASE_URL}/api/settings/ics-feed`)).json()) as {
      token: string;
    };
    const second = (await (await exports.default.fetch(`${BASE_URL}/api/settings/ics-feed`)).json()) as {
      token: string;
    };

    expect(second.token).toBe(first.token);
  });
});

describe("POST /api/settings/ics-feed/regenerate", () => {
  it("returns a new token different from the previous one", async () => {
    const before = (await (await exports.default.fetch(`${BASE_URL}/api/settings/ics-feed`)).json()) as {
      token: string;
    };

    const res = await exports.default.fetch(`${BASE_URL}/api/settings/ics-feed/regenerate`, { method: "POST" });
    const after = (await res.json()) as { token: string };

    expect(res.status).toBe(200);
    expect(after.token).not.toBe(before.token);
  });
});
