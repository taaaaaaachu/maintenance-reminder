import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToRecipient } from "./dispatcher.js";

const MESSAGE = { title: "タイトル", body: "本文", url: "https://reminder.example.com/?item=item-1" };

describe("sendToRecipient", () => {
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
    it("posts to the LINE Messaging API with the access token and identifier as the recipient", async () => {
      await sendToRecipient(env, "line", "U123", MESSAGE);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.line.me/v2/bot/message/push");
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` });
      const body = JSON.parse(init.body as string);
      expect(body.to).toBe("U123");
      expect(body.messages[0].text).toContain("タイトル");
      expect(body.messages[0].text).toContain(MESSAGE.url);
    });

    it("throws when the access token secret is not configured", async () => {
      await expect(
        sendToRecipient({ ...env, LINE_CHANNEL_ACCESS_TOKEN: "" }, "line", "U123", MESSAGE),
      ).rejects.toThrow("LINE_CHANNEL_ACCESS_TOKEN");
    });
  });

  describe("email", () => {
    it("posts to the Resend API with from/to/subject/text", async () => {
      await sendToRecipient(env, "email", "me@example.com", MESSAGE);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      const body = JSON.parse(init.body as string);
      expect(body.to).toBe("me@example.com");
      expect(body.from).toBe(env.RESEND_FROM_ADDRESS);
      expect(body.subject).toBe("タイトル");
      expect(body.text).toContain(MESSAGE.url);
    });
  });

  describe("pushover", () => {
    it("posts form-encoded data to the Pushover API", async () => {
      await sendToRecipient(env, "pushover", "user-key", MESSAGE);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.pushover.net/1/messages.json");
      const params = new URLSearchParams(init.body as string);
      expect(params.get("user")).toBe("user-key");
      expect(params.get("token")).toBe(env.PUSHOVER_API_TOKEN);
      expect(params.get("title")).toBe("タイトル");
      expect(params.get("url")).toBe(MESSAGE.url);
      expect(params.get("url_title")).toBeTruthy();
    });
  });

  it("propagates an error when the remote API responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(sendToRecipient(env, "pushover", "user-key", MESSAGE)).rejects.toThrow("400");
  });
});
