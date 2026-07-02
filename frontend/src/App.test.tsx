import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    // Every page's initial fetch just needs to resolve to something harmless.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/settings/notifications")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ channel: "line", isEnabled: false }]), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the items page by default", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("お手入れアイテム一覧")).toBeInTheDocument();
    });
  });

  it("switches to the settings page when the tab is clicked", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("お手入れアイテム一覧")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "通知設定" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "通知設定" })).toBeInTheDocument();
    });
    expect(screen.queryByText("お手入れアイテム一覧")).not.toBeInTheDocument();
  });

  it("switches to the notification log page when the tab is clicked", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("お手入れアイテム一覧")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "通知履歴" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "通知履歴" })).toBeInTheDocument();
    });
  });
});
