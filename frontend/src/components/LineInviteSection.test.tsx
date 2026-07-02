import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("shows an input form when no invite URL is configured yet", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: null }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://line.me/R/ti/p/@xxxxx")).toBeInTheDocument();
    });
  });

  it("shows the saved invite URL as a link when configured", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: "https://line.me/R/ti/p/@abc1234" }), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "https://line.me/R/ti/p/@abc1234" })).toBeInTheDocument();
    });
  });

  it("saves a new invite URL through the form", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ url: null }), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://line.me/R/ti/p/@xxxxx")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://line.me/R/ti/p/@abc1234" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://line.me/R/ti/p/@abc1234" }), { status: 200 }),
    );

    await user.type(screen.getByPlaceholderText("https://line.me/R/ti/p/@xxxxx"), "https://line.me/R/ti/p/@abc1234");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://line.me/R/ti/p/@abc1234" });
  });
});
