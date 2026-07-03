import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemHistorySection } from "./ItemHistorySection.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ItemHistorySection itemId="item-1" />
    </QueryClientProvider>,
  );
}

describe("ItemHistorySection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not fetch history until expanded", () => {
    renderWithClient();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows completion and snooze entries once expanded", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "h2",
            itemId: "item-1",
            eventType: "complete",
            occurredAt: "2026-07-02T00:00:00.000Z",
            completedDate: "2026-07-02",
            snoozeDays: null,
            intervalDays: 7,
            nextDueAtBefore: "2026-07-02",
            nextDueAtAfter: "2026-07-09",
          },
          {
            id: "h1",
            itemId: "item-1",
            eventType: "snooze",
            occurredAt: "2026-06-28T00:00:00.000Z",
            completedDate: null,
            snoozeDays: 3,
            intervalDays: 7,
            nextDueAtBefore: "2026-06-25",
            nextDueAtAfter: "2026-06-28",
          },
        ]),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();

    renderWithClient();
    await user.click(screen.getByRole("button", { name: "履歴を見る" }));

    await waitFor(() => {
      expect(screen.getByText("2026-07-02 お手入れ完了")).toBeInTheDocument();
    });
    expect(screen.getByText("2026-06-28 3日スヌーズ")).toBeInTheDocument();
  });

  it("shows an empty-state message when there is no history", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await user.click(screen.getByRole("button", { name: "履歴を見る" }));

    await waitFor(() => {
      expect(screen.getByText("まだ履歴がありません。")).toBeInTheDocument();
    });
  });

  it("computes the average interval and delay from completions", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "h2",
            itemId: "item-1",
            eventType: "complete",
            occurredAt: "2026-07-12T00:00:00.000Z",
            completedDate: "2026-07-12",
            snoozeDays: null,
            intervalDays: 7,
            nextDueAtBefore: "2026-07-09",
            nextDueAtAfter: "2026-07-19",
          },
          {
            id: "h1",
            itemId: "item-1",
            eventType: "complete",
            occurredAt: "2026-07-02T00:00:00.000Z",
            completedDate: "2026-07-02",
            snoozeDays: null,
            intervalDays: 7,
            nextDueAtBefore: "2026-07-02",
            nextDueAtAfter: "2026-07-09",
          },
        ]),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();

    renderWithClient();
    await user.click(screen.getByRole("button", { name: "履歴を見る" }));

    await waitFor(() => {
      expect(screen.getByText(/実績の平均間隔: 約10.0日/)).toBeInTheDocument();
    });
    expect(screen.getByText(/平均遅延: 1.5日/)).toBeInTheDocument();
  });
});
