import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemFormPage } from "./ItemFormPage.js";

describe("ItemFormPage", () => {
  it("defaults notifyDaysBefore to 0 and submits it when creating an item", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemFormPage onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("何日前から通知するか")).toHaveValue(0);

    await user.type(screen.getByLabelText("名前"), "ロボット掃除機");
    await user.click(screen.getByRole("button", { name: "追加する" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notifyDaysBefore: 0 }));
  });

  it("submits an edited notifyDaysBefore value", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const initialItem = {
      id: "1",
      name: "ロボット掃除機",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
      memo: null,
      isActive: true,
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    };
    render(<ItemFormPage initialItem={initialItem} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByLabelText("何日前から通知するか");
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "更新する" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notifyDaysBefore: 3 }));
  });
});
