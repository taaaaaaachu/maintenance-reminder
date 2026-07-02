import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IcsFeedCard } from "./IcsFeedCard.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IcsFeedCard />
    </QueryClientProvider>,
  );
}

describe("IcsFeedCard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the subscribe URL built from the fetched token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: "abc123token" }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByDisplayValue(`${window.location.origin}/feed/abc123token.ics`)).toBeInTheDocument();
    });
    expect(screen.getByText(/webcal版/)).toHaveTextContent("webcal://");
  });

  it("regenerates the token when confirmed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token: "old-token" }), { status: 200 }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByDisplayValue(`${window.location.origin}/feed/old-token.ics`)).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token: "new-token" }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token: "new-token" }), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "URLを再発行" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(`${window.location.origin}/feed/new-token.ics`)).toBeInTheDocument();
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/settings/ics-feed/regenerate");
    expect(init.method).toBe("POST");

    confirmSpy.mockRestore();
  });

  it("does not regenerate when the confirmation is cancelled", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: "old-token" }), { status: 200 }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByDisplayValue(`${window.location.origin}/feed/old-token.ics`)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "URLを再発行" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
