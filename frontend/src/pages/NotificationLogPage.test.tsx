import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationLogPage } from "./NotificationLogPage.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationLogPage />
    </QueryClientProvider>,
  );
}

describe("NotificationLogPage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows an empty state when there is no history yet", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("まだ通知履歴がありません。")).toBeInTheDocument();
    });
  });

  it("renders log entries with item name, channel, recipient, and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            itemId: "item-1",
            itemName: "ロボット掃除機の清掃",
            channel: "pushover",
            recipientIdentifier: "user-key-1",
            recipientLabel: "父",
            status: "success",
            errorMessage: null,
            sentAt: "2026-07-02T07:00:00.000Z",
          },
          {
            id: 2,
            itemId: "item-2",
            itemName: "洗濯機の掃除",
            channel: "email",
            recipientIdentifier: "me@example.com",
            recipientLabel: null,
            status: "failed",
            errorMessage: "timeout",
            sentAt: "2026-07-02T07:00:00.000Z",
          },
        ]),
        { status: 200 },
      ),
    );

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });
    expect(screen.getByText("成功")).toBeInTheDocument();
    expect(screen.getByText("失敗")).toBeInTheDocument();
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText(/父/)).toBeInTheDocument();
    expect(screen.getByText(/me@example\.com/)).toBeInTheDocument();
  });
});
