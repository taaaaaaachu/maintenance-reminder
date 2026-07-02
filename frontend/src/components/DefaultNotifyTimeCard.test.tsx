import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultNotifyTimeCard } from "./DefaultNotifyTimeCard.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DefaultNotifyTimeCard />
    </QueryClientProvider>,
  );
}

describe("DefaultNotifyTimeCard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the fetched default notify time", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ time: "20:30" }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByLabelText("通知時刻")).toHaveValue("20:30");
    });
  });

  it("saves the selected time when the save button is clicked", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ time: "07:00" }), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByLabelText("通知時刻")).toHaveValue("07:00");
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ time: "19:30" }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ time: "19:30" }), { status: 200 }));

    await user.selectOptions(screen.getByLabelText("通知時刻"), "19:30");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("/api/settings/default-notify-time");
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({ time: "19:30" });
    });
    await waitFor(() => {
      expect(screen.getByText("保存しました")).toBeInTheDocument();
    });
  });
});
