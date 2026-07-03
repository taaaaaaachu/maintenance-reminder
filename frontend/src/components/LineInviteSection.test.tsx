import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineInviteSection } from "./LineInviteSection.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LineInviteSection />
    </QueryClientProvider>,
  );
}

describe("LineInviteSection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders nothing extra when no invite URL is configured", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: null }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the configured invite URL as a link", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: "https://line.me/R/ti/p/@abc1234" }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "https://line.me/R/ti/p/@abc1234" })).toBeInTheDocument();
    });
  });
});
