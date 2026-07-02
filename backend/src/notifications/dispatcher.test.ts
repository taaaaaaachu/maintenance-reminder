import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToChannel } from "./dispatcher.js";

const MESSAGE = { title: "タイトル", body: "本文" };

describe("sendToChannel", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  describe("line", () => {
    it("posts to the LINE Messaging API with the access token and userId", async () => {
      await sendToChannel(env, "line", { userId: "U123" }, MESSAGE);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.line.me/v2/bot/message/push");
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` });
      const body = JSON.parse(init.body as string);
      expect(body.to).toBe("U123");
      expect(body.messages[0].text).toContain("タイトル");
    });

    it("throws without calling fetch when userId is missing", async () => {
      await expect(sendToChannel(env, "line", {}, MESSAGE)).rejects.toThrow("userId");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws when the access token secret is not configured", async () => {
      await expect(
        sendToChannel({ ...env, LINE_CHANNEL_ACCESS_TOKEN: "" }, "line", { userId: "U123" }, MESSAGE),
      ).rejects.toThrow("LINE_CHANNEL_ACCESS_TOKEN");
    });
  });

  describe("email", () => {
    it("posts to the Resend API with from/to/subject/text", async () => {
      await sendToChannel(env, "email", { toAddress: "me@example.com" }, MESSAGE);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      const body = JSON.parse(init.body as string);
      expect(body.to).toBe("me@example.com");
      expect(body.from).toBe(env.RESEND_FROM_ADDRESS);
      expect(body.subject).toBe("タイトル");
    });

    it("throws without calling fetch when toAddress is missing", async () => {
      await expect(sendToChannel(env, "email", {}, MESSAGE)).rejects.toThrow("メールアドレス");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("pushover", () => {
    it("posts form-encoded data to the Pushover API", async () => {
      await sendToChannel(env, "pushover", { userKey: "user-key" }, MESSAGE);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.pushover.net/1/messages.json");
      const params = new URLSearchParams(init.body as string);
      expect(params.get("user")).toBe("user-key");
      expect(params.get("token")).toBe(env.PUSHOVER_API_TOKEN);
      expect(params.get("title")).toBe("タイトル");
    });

    it("throws without calling fetch when userKey is missing", async () => {
      await expect(sendToChannel(env, "pushover", {}, MESSAGE)).rejects.toThrow("User Key");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("propagates an error when the remote API responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(sendToChannel(env, "pushover", { userKey: "x" }, MESSAGE)).rejects.toThrow("400");
  });
});
