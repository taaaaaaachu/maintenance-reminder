import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@maintenance-reminder/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemCard } from "./ItemCard.js";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "1",
    name: "ロボット掃除機のダストボックス清掃",
    category: "掃除機",
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

describe("ItemCard", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-07-02T03:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the item name and category", () => {
    render(<ItemCard item={makeItem()} onComplete={vi.fn()} onSnooze={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("ロボット掃除機のダストボックス清掃")).toBeInTheDocument();
    expect(screen.getByText("掃除機")).toBeInTheDocument();
  });

  it("shows 本日 badge when the item is due today", () => {
    render(<ItemCard item={makeItem()} onComplete={vi.fn()} onSnooze={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/本日/)).toBeInTheDocument();
  });

  it("shows an overdue badge when the due date has passed", () => {
    render(
      <ItemCard
        item={makeItem({ nextDueAt: "2026-06-28" })}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/4日超過/)).toBeInTheDocument();
  });

  it("calls onComplete when the complete button is clicked", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <ItemCard item={makeItem()} onComplete={onComplete} onSnooze={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "お手入れ完了" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("calls onEdit and onDelete when their buttons are clicked", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <ItemCard item={makeItem()} onComplete={vi.fn()} onSnooze={vi.fn()} onEdit={onEdit} onDelete={onDelete} />,
    );

    await user.click(screen.getByRole("button", { name: "編集" }));
    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
