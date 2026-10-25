import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentConnectionsCard } from "./AgentConnectionsCard.js";

const connection = {
  id: "c1",
  name: "muse",
  issuerEmail: "a@example.com",
  origin: "手動発行",
  createdAt: "2026-10-25T00:00:00.000Z",
  lastUsedAt: "2026-10-25T00:00:00.000Z",
};

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentConnectionsCard />
    </QueryClientProvider>,
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("AgentConnectionsCard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("接続の一覧とMCPのURLを出す", async () => {
    fetchMock.mockResolvedValue(json([connection]));
    renderWithClient();
    expect(await screen.findByText("muse")).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeInTheDocument();
  });

  it("発行したトークンを一度だけ表示する", async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    const user = userEvent.setup();
    renderWithClient();
    await screen.findByText("接続はありません");

    fetchMock.mockResolvedValueOnce(json({ id: "c1", token: "mra_secret" }, 201));
    fetchMock.mockResolvedValueOnce(json([connection]));
    await user.type(screen.getByLabelText("エージェントの名前"), "muse");
    await user.click(screen.getByRole("button", { name: "トークンを発行" }));

    expect(await screen.findByDisplayValue("mra_secret")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(init.body)).toEqual({ name: "muse" });
  });

  it("失敗は画面に出す", async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    const user = userEvent.setup();
    renderWithClient();
    await screen.findByText("接続はありません");

    fetchMock.mockResolvedValueOnce(json({ error: { message: "名前を指定してください", code: "BAD_REQUEST" } }, 400));
    await user.type(screen.getByLabelText("エージェントの名前"), "x");
    await user.click(screen.getByRole("button", { name: "トークンを発行" }));

    expect(await screen.findByText("エラー: 名前を指定してください")).toBeInTheDocument();
  });

  it("確認したら取り消す", async () => {
    fetchMock.mockResolvedValueOnce(json([connection]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderWithClient();
    await screen.findByText("muse");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(json([]));
    await user.click(screen.getByRole("button", { name: "取り消す" }));

    await waitFor(() => expect(screen.getByText("接続はありません")).toBeInTheDocument());
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/agent-connections/c1");
    expect(fetchMock.mock.calls[1]![1].method).toBe("DELETE");
  });
});
