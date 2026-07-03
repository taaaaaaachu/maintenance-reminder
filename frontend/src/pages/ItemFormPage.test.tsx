import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemFormPage } from "./ItemFormPage.js";

describe("ItemFormPage", () => {
  it("defaults notifyDaysBefore to 0 and notifyTime to 07:00 when creating an item", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemFormPage onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("何日前から通知するか")).toHaveValue(0);
    expect(screen.getByLabelText("通知時刻")).toHaveValue("07:00");

    await user.type(screen.getByLabelText("名前"), "ロボット掃除機");
    await user.click(screen.getByRole("button", { name: "追加する" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notifyDaysBefore: 0, notifyTime: "07:00" }));
  });

  it("uses the given defaultNotifyTime as the initial value when creating an item", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemFormPage defaultNotifyTime="20:30" onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("通知時刻")).toHaveValue("20:30");

    await user.type(screen.getByLabelText("名前"), "ロボット掃除機");
    await user.click(screen.getByRole("button", { name: "追加する" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notifyTime: "20:30" }));
  });

  it("ignores defaultNotifyTime and uses the item's own notifyTime when editing", () => {
    const initialItem = {
      id: "1",
      name: "ロボット掃除機",
      category: null,
      intervalDays: 7,
      notifyDaysBefore: 0,
      notifyTime: "12:00",
      lastDoneAt: "2026-06-25",
      nextDueAt: "2026-07-02",
      memo: null,
      isActive: true,
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      recentSnoozeCount: 0,
    };
    render(
      <ItemFormPage initialItem={initialItem} defaultNotifyTime="20:30" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByLabelText("通知時刻")).toHaveValue("12:00");
  });

  it("offers existing categories as datalist suggestions", () => {
    render(
      <ItemFormPage categories={["掃除機", "洗濯機"]} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    const input = screen.getByLabelText("カテゴリ(任意)");
    expect(input).toHaveAttribute("list", "category-options");

    const datalist = document.getElementById("category-options") as HTMLDataListElement;
    const options = Array.from(datalist.options).map((o) => o.value);
    expect(options).toEqual(["掃除機", "洗濯機"]);
  });

  it("submits an edited notifyDaysBefore and notifyTime value", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const initialItem = {
      id: "1",
      name: "ロボット掃除機",
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
      recentSnoozeCount: 0,
    };
    render(<ItemFormPage initialItem={initialItem} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByLabelText("何日前から通知するか");
    await user.clear(input);
    await user.type(input, "3");
    await user.selectOptions(screen.getByLabelText("通知時刻"), "20:30");
    await user.click(screen.getByRole("button", { name: "更新する" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notifyDaysBefore: 3, notifyTime: "20:30" }));
  });
});
