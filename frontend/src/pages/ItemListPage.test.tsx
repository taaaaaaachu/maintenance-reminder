import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Item } from "@maintenance-reminder/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemListPage } from "./ItemListPage.js";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    name: "ロボット掃除機の清掃",
    category: null,
    intervalDays: 7,
    notifyDaysBefore: 0,
    notifyTime: "07:00",
    lastDoneAt: "2026-06-25",
    nextDueAt: "2026-07-02",
    memo: null,
    isActive: true,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

function renderWithClient(highlightItemId?: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ItemListPage highlightItemId={highlightItemId} />
    </QueryClientProvider>,
  );
}

describe("ItemListPage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.setSystemTime(new Date("2026-07-02T03:00:00Z"));
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows an empty-state message when there are no items", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText(/まだアイテムが登録されていません/)).toBeInTheDocument();
    });
  });

  it("shows an error message when the initial fetch fails", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText(/読み込みに失敗しました/)).toBeInTheDocument();
    });
  });

  it("renders a list of fetched items", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([makeItem()]), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });
  });

  it("shows the add form and creates an item on submit", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText(/まだアイテムが登録されていません/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "+ アイテムを追加" }));
    expect(screen.getByText("アイテムを追加")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(makeItem({ id: "new-item" })), { status: 201 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem({ id: "new-item" })]), { status: 200 }));

    await user.type(screen.getByLabelText("名前"), "洗濯機のフィルター掃除");
    await user.click(screen.getByRole("button", { name: "追加する" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
      expect(postCall).toBeDefined();
    });

    // form closes after a successful create
    await waitFor(() => {
      expect(screen.queryByText("アイテムを追加")).not.toBeInTheDocument();
    });
  });

  it("switches an item card into edit mode and submits the update", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem()]), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByText("アイテムを編集")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeItem({ name: "更新後の名前" })), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem({ name: "更新後の名前" })]), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "更新する" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
      expect(patchCall).toBeDefined();
    });
  });

  it("calls the complete endpoint when the complete button is clicked", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem()]), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(makeItem()), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem()]), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "お手入れ完了" }));

    await waitFor(() => {
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("/api/items/item-1/complete");
      expect(init.method).toBe("POST");
    });
  });

  it("calls the snooze endpoint when the snooze button is clicked", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem()]), { status: 200 }));
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(makeItem()), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem()]), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "もうちょっといける" }));

    await waitFor(() => {
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("/api/items/item-1/snooze");
      expect(init.method).toBe("POST");
    });
  });

  it("deletes the item after the confirm dialog is accepted", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeItem()]), { status: 200 }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "DELETE");
      expect(deleteCall).toBeDefined();
    });

    confirmSpy.mockRestore();
  });

  it("does not show a category filter when no item has a category", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([makeItem({ category: null })]), { status: 200 }));

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("ジャンルで絞り込み")).not.toBeInTheDocument();
  });

  it("filters items by category using the filter select", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          makeItem({ id: "item-1", name: "ロボット掃除機の清掃", category: "掃除機" }),
          makeItem({ id: "item-2", name: "洗濯機のフィルター掃除", category: "洗濯機" }),
        ]),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
      expect(screen.getByText("洗濯機のフィルター掃除")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("ジャンルで絞り込み"), "掃除機");

    expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    expect(screen.queryByText("洗濯機のフィルター掃除")).not.toBeInTheDocument();
  });

  it("scrolls to and highlights the item matching highlightItemId", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          makeItem({ id: "item-1", name: "ロボット掃除機の清掃", category: "掃除機" }),
          makeItem({ id: "item-2", name: "洗濯機のフィルター掃除", category: "洗濯機" }),
        ]),
        { status: 200 },
      ),
    );
    const scrollIntoViewMock = vi.fn();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(scrollIntoViewMock);

    renderWithClient("item-2");

    await waitFor(() => {
      expect(screen.getByText("洗濯機のフィルター掃除")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    // highlighted item stays visible even though a category filter would otherwise hide it
    expect(screen.queryByLabelText("ジャンルで絞り込み")).toBeInTheDocument();

    scrollIntoViewMock.mockRestore();
  });

  it("does not delete the item when the confirm dialog is cancelled", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([makeItem()]), { status: 200 }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByText("ロボット掃除機の清掃")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "削除" }));

    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "DELETE");
    expect(deleteCall).toBeUndefined();

    confirmSpy.mockRestore();
  });
});
