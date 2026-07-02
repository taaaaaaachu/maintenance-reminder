import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_URL = "https://example.com";

async function clearSettings() {
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM notification_recipients").run();
  await env.DB.prepare("DELETE FROM notification_settings").run();
  await env.DB.prepare("DELETE FROM app_config").run();
}

beforeEach(async () => {
  await clearSettings();
});

async function addRecipient(channel: string, identifier: string, label: string | null = null) {
  const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/${channel}/recipients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, label }),
  });
  return { res, json: (await res.json()) as { id: string; identifier: string; label: string | null } };
}

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
  it("toggles the channel on and off", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: true }),
    });
    const json = (await res.json()) as { isEnabled: boolean };

    expect(res.status).toBe(200);
    expect(json.isEnabled).toBe(true);
  });

  it("rejects an unknown channel with 400", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/unknown`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: false }),
    });
    expect(res.status).toBe(400);
  });
});

describe("recipients CRUD", () => {
  it("adds and lists a recipient for a channel", async () => {
    const { res, json } = await addRecipient("email", "me@example.com", "自分");
    expect(res.status).toBe(201);
    expect(json).toMatchObject({ identifier: "me@example.com", label: "自分" });

    const listRes = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/email/recipients`);
    const list = (await listRes.json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("rejects an invalid email identifier for the email channel", async () => {
    const { res } = await addRecipient("email", "not-an-email");
    expect(res.status).toBe(400);
  });

  it("rejects an empty identifier", async () => {
    const { res } = await addRecipient("pushover", "");
    expect(res.status).toBe(400);
  });

  it("removes a recipient", async () => {
    const { json } = await addRecipient("pushover", "user-key-1");

    const deleteRes = await exports.default.fetch(
      `${BASE_URL}/api/settings/notifications/pushover/recipients/${json.id}`,
      { method: "DELETE" },
    );
    expect(deleteRes.status).toBe(204);

    const listRes = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/pushover/recipients`);
    expect(await listRes.json()).toEqual([]);
  });
});

describe("POST /api/settings/notifications/:channel/recipients/:id/test", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns 404 when the recipient does not exist", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/notifications/line/recipients/missing/test`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a test notification to the specified recipient", async () => {
    const { json } = await addRecipient("pushover", "user-key-1");

    const res = await exports.default.fetch(
      `${BASE_URL}/api/settings/notifications/pushover/recipients/${json.id}/test`,
      { method: "POST" },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns 400 with the underlying error message when sending fails", async () => {
    const { json } = await addRecipient("pushover", "user-key-1");
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const res = await exports.default.fetch(
      `${BASE_URL}/api/settings/notifications/pushover/recipients/${json.id}/test`,
      { method: "POST" },
    );

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

describe("GET/PUT /api/settings/default-notify-time", () => {
  it("returns 07:00 when not yet configured", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/default-notify-time`);
    expect(await res.json()).toEqual({ time: "07:00" });
  });

  it("saves and returns the configured default", async () => {
    const putRes = await exports.default.fetch(`${BASE_URL}/api/settings/default-notify-time`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: "20:30" }),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ time: "20:30" });

    const getRes = await exports.default.fetch(`${BASE_URL}/api/settings/default-notify-time`);
    expect(await getRes.json()).toEqual({ time: "20:30" });
  });

  it("rejects a time that is not on a 30-minute boundary", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/default-notify-time`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: "07:15" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET/PUT /api/settings/line-invite", () => {
  it("returns null when not yet configured", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/line-invite`);
    expect(await res.json()).toEqual({ url: null });
  });

  it("saves and returns the invite URL", async () => {
    const putRes = await exports.default.fetch(`${BASE_URL}/api/settings/line-invite`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://line.me/R/ti/p/@abc1234" }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await exports.default.fetch(`${BASE_URL}/api/settings/line-invite`);
    expect(await getRes.json()).toEqual({ url: "https://line.me/R/ti/p/@abc1234" });
  });

  it("rejects an invalid URL", async () => {
    const res = await exports.default.fetch(`${BASE_URL}/api/settings/line-invite`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });
});
