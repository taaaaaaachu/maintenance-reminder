import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAccessRedirect } from "./session.js";

function opaqueRedirectResponse(): Response {
  return { type: "opaqueredirect", status: 0, ok: false } as Response;
}

describe("handleAccessRedirect", () => {
  const assignMock = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign: assignMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    assignMock.mockReset();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("通常のレスポンスでは何もしない", () => {
    expect(() => handleAccessRedirect(new Response("ok", { status: 200 }))).not.toThrow();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("エラーレスポンス(404等)でも何もしない", () => {
    expect(() => handleAccessRedirect(new Response("ng", { status: 404 }))).not.toThrow();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("opaqueredirectを検出したら /api/auth/refresh へ遷移してエラーを投げる", () => {
    expect(() => handleAccessRedirect(opaqueRedirectResponse())).toThrow(/再ログイン/);
    expect(assignMock).toHaveBeenCalledWith("/api/auth/refresh");
  });

  it("直近60秒以内にリダイレクト済みなら再遷移しない(無限ループ防止)", () => {
    expect(() => handleAccessRedirect(opaqueRedirectResponse())).toThrow();
    expect(() => handleAccessRedirect(opaqueRedirectResponse())).toThrow();
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it("ガード期間を過ぎていれば再度リダイレクトする", () => {
    vi.useFakeTimers();
    try {
      expect(() => handleAccessRedirect(opaqueRedirectResponse())).toThrow();
      vi.advanceTimersByTime(61_000);
      expect(() => handleAccessRedirect(opaqueRedirectResponse())).toThrow();
      expect(assignMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
