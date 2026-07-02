import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationTimeCard } from "./NotificationTimeCard.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationTimeCard />
    </QueryClientProvider>,
  );
}

describe("NotificationTimeCard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the currently configured time as the selected option", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ time: "07:00" }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("07:00");
    });
  });

  it("saves a newly selected time", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ time: "07:00" }), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("07:00");
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ time: "20:30" }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ time: "20:30" }), { status: 200 }));

    await user.selectOptions(screen.getByRole("combobox"), "20:30");

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/settings/notification-time");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ time: "20:30" });
  });
});
