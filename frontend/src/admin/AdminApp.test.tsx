import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp.js";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminApp />
    </QueryClientProvider>,
  );
}

const emptyHouseholds = JSON.stringify([]);
const oneHousehold = JSON.stringify([
  { id: "h1", name: "実家", createdAt: "2026-07-01T00:00:00.000Z", members: [{ id: "m1", householdId: "h1", email: "father@example.com", displayName: "父", createdAt: "2026-07-01T00:00:00.000Z" }] },
]);

describe("AdminApp", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("lists households and their members", async () => {
    fetchMock.mockResolvedValue(new Response(oneHousehold, { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("実家")).toBeInTheDocument();
    });
    expect(screen.getByText("父 (father@example.com)")).toBeInTheDocument();
  });

  it("shows a logout link pointing to the Cloudflare Access logout endpoint", async () => {
    fetchMock.mockResolvedValue(new Response(emptyHouseholds, { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "ログアウト" })).toHaveAttribute("href", "/cdn-cgi/access/logout");
    });
  });

  it("shows a placeholder when a household has no members yet", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "h1", name: "実家", createdAt: "2026-07-01T00:00:00.000Z", members: [] }]),
        { status: 200 },
      ),
    );

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("メンバーがいません")).toBeInTheDocument();
    });
  });

  it("creates a new household through the form", async () => {
    fetchMock.mockResolvedValueOnce(new Response(emptyHouseholds, { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("例: 実家")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "h1", name: "実家", createdAt: "2026-07-01T00:00:00.000Z", members: [] }), {
        status: 201,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ id: "h1", name: "実家", createdAt: "2026-07-01T00:00:00.000Z", members: [] }]),
        { status: 200 },
      ),
    );

    await user.type(screen.getByPlaceholderText("例: 実家"), "実家");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText("メンバーがいません")).toBeInTheDocument();
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/admin/households");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "実家" });
  });

  it("adds a member to an existing household", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ id: "h1", name: "実家", createdAt: "2026-07-01T00:00:00.000Z", members: [] }]),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("メンバーがいません")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "m1", householdId: "h1", email: "mother@example.com", displayName: "母", createdAt: "2026-07-01T00:00:00.000Z" }),
        { status: 201 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(oneHousehold, { status: 200 }));

    await user.type(screen.getByPlaceholderText("メールアドレス"), "mother@example.com");
    await user.type(screen.getByPlaceholderText("表示名(任意)"), "母");
    await user.click(screen.getByRole("button", { name: "メンバー追加" }));

    await waitFor(() => {
      expect(screen.getByText("父 (father@example.com)")).toBeInTheDocument();
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/admin/households/h1/members");
    expect(JSON.parse(init.body as string)).toEqual({ email: "mother@example.com", displayName: "母" });
  });

  it("issues an invite code and displays it", async () => {
    fetchMock.mockResolvedValueOnce(new Response(oneHousehold, { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("実家")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "ABCD1234" }), { status: 201 }));

    await user.click(screen.getByRole("button", { name: "LINE招待コードを発行" }));

    await waitFor(() => {
      expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/admin/households/h1/invites");
    expect(init.method).toBe("POST");
  });
});
