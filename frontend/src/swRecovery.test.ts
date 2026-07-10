import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSwallowedAccessCallback, recoverFromSwallowedCallback } from "./swRecovery.js";

describe("isSwallowedAccessCallback", () => {
  it("/cdn-cgi/ 配下のパスを検出する", () => {
    expect(isSwallowedAccessCallback("/cdn-cgi/access/authorized")).toBe(true);
    expect(isSwallowedAccessCallback("/cdn-cgi/access/login")).toBe(true);
  });

  it("通常のパスでは検出しない", () => {
    expect(isSwallowedAccessCallback("/")).toBe(false);
    expect(isSwallowedAccessCallback("/admin")).toBe(false);
    expect(isSwallowedAccessCallback("/api/items")).toBe(false);
  });
});

describe("recoverFromSwallowedCallback", () => {
  const replaceMock = vi.fn();
  const originalLocation = window.location;
  const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, replace: replaceMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    replaceMock.mockReset();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    if (originalServiceWorkerDescriptor) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
    } else {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    }
  });

  function mockServiceWorker(registrations: Array<{ unregister: () => Promise<boolean> }>): void {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistrations: () => Promise.resolve(registrations) },
      writable: true,
      configurable: true,
    });
  }

  it("登録済みSWをすべて解除してから /api/auth/refresh へ遷移する", async () => {
    const unregister1 = vi.fn().mockResolvedValue(true);
    const unregister2 = vi.fn().mockResolvedValue(true);
    mockServiceWorker([{ unregister: unregister1 }, { unregister: unregister2 }]);

    await recoverFromSwallowedCallback();

    expect(unregister1).toHaveBeenCalledTimes(1);
    expect(unregister2).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/api/auth/refresh");
  });

  it("SW未サポート環境でも /api/auth/refresh へ遷移する", async () => {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;

    await recoverFromSwallowedCallback();

    expect(replaceMock).toHaveBeenCalledWith("/api/auth/refresh");
  });

  it("SW解除に失敗しても /api/auth/refresh へ遷移する", async () => {
    mockServiceWorker([{ unregister: vi.fn().mockRejectedValue(new Error("boom")) }]);

    await recoverFromSwallowedCallback();

    expect(replaceMock).toHaveBeenCalledWith("/api/auth/refresh");
  });
});
