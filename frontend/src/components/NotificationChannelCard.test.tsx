import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationSetting } from "@maintenance-reminder/shared";
import { describe, expect, it, vi } from "vitest";
import { NotificationChannelCard } from "./NotificationChannelCard.js";

describe("NotificationChannelCard", () => {
  it("shows the channel-specific field for line", () => {
    const setting: NotificationSetting = { channel: "line", isEnabled: false, config: {} };
    render(<NotificationChannelCard setting={setting} onSave={vi.fn()} onTest={vi.fn()} />);

    expect(screen.getByText("LINE")).toBeInTheDocument();
    expect(screen.getByText("LINE User ID")).toBeInTheDocument();
  });

  it("shows the channel-specific field for email", () => {
    const setting: NotificationSetting = { channel: "email", isEnabled: false, config: {} };
    render(<NotificationChannelCard setting={setting} onSave={vi.fn()} onTest={vi.fn()} />);

    expect(screen.getByText("送信先メールアドレス")).toBeInTheDocument();
  });

  it("calls onSave with the toggled state and edited config", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const setting: NotificationSetting = { channel: "pushover", isEnabled: false, config: {} };
    render(<NotificationChannelCard setting={setting} onSave={onSave} onTest={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "有効化" }));
    await user.type(screen.getByLabelText("Pushover User Key"), "abc123");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith(true, { userKey: "abc123" });
  });

  it("disables the test button when the persisted setting is not enabled, even if the checkbox was just toggled", async () => {
    const user = userEvent.setup();
    const setting: NotificationSetting = { channel: "pushover", isEnabled: false, config: {} };
    render(<NotificationChannelCard setting={setting} onSave={vi.fn()} onTest={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "有効化" }));

    expect(screen.getByRole("button", { name: "テスト送信" })).toBeDisabled();
  });

  it("enables the test button and calls onTest when the persisted setting is enabled", async () => {
    const onTest = vi.fn();
    const user = userEvent.setup();
    const setting: NotificationSetting = { channel: "pushover", isEnabled: true, config: { userKey: "abc123" } };
    render(<NotificationChannelCard setting={setting} onSave={vi.fn()} onTest={onTest} />);

    const testButton = screen.getByRole("button", { name: "テスト送信" });
    expect(testButton).toBeEnabled();

    await user.click(testButton);
    expect(onTest).toHaveBeenCalledOnce();
  });

  it("shows the test result message", () => {
    const setting: NotificationSetting = { channel: "pushover", isEnabled: true, config: { userKey: "abc123" } };
    render(
      <NotificationChannelCard
        setting={setting}
        onSave={vi.fn()}
        onTest={vi.fn()}
        testResult={{ ok: false, message: "送信に失敗しました" }}
      />,
    );

    expect(screen.getByText("送信に失敗しました")).toBeInTheDocument();
  });
});
