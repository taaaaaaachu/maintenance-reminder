import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotificationSetting } from "@maintenance-reminder/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationChannelCard } from "./NotificationChannelCard.js";

function renderCard(setting: NotificationSetting) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationChannelCard setting={setting} />
    </QueryClientProvider>,
  );
}

describe("NotificationChannelCard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the channel label and an empty state when there are no recipients (email)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    renderCard({ channel: "email", isEnabled: false });

    expect(screen.getByText("メール")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("まだ宛先が登録されていません。")).toBeInTheDocument();
    });
  });

  it("shows registered recipients for email with an add form", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ id: "r1", channel: "email", identifier: "me@example.com", label: "自分" }]), {
        status: 200,
      }),
    );

    renderCard({ channel: "email", isEnabled: true });

    await waitFor(() => {
      expect(screen.getByText("自分")).toBeInTheDocument();
    });
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByText("メールアドレス")).toBeInTheDocument();
  });

  it("shows the LINE invite section instead of a manual add form for the line channel", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("line-invite")) return Promise.resolve(new Response(JSON.stringify({ url: null }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    renderCard({ channel: "line", isEnabled: false });

    await waitFor(() => {
      expect(screen.getByText(/友だち追加/)).toBeInTheDocument();
    });
    expect(screen.queryByText("LINE User ID")).not.toBeInTheDocument();
  });

  it("adds a recipient via the form for email", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ id: "r2", channel: "email", identifier: "new@example.com", label: null }), {
            status: 201,
          }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    const user = userEvent.setup();

    renderCard({ channel: "email", isEnabled: true });

    await waitFor(() => {
      expect(screen.getByText("まだ宛先が登録されていません。")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("メールアドレス"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
      expect(postCall).toBeDefined();
    });
  });

  it("toggles isEnabled when the checkbox is clicked", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const user = userEvent.setup();

    renderCard({ channel: "pushover", isEnabled: false });

    await waitFor(() => {
      expect(screen.getByText("まだ宛先が登録されていません。")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("checkbox", { name: "有効化" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
      expect(putCall).toBeDefined();
    });
  });
});
