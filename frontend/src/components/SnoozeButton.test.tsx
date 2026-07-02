import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SnoozeButton } from "./SnoozeButton.js";

describe("SnoozeButton", () => {
  it("calls onClick with undefined when no days are entered", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<SnoozeButton onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "もうちょっといける" }));

    expect(onClick).toHaveBeenCalledWith(undefined);
  });

  it("calls onClick with the entered number of days", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<SnoozeButton onClick={onClick} />);

    await user.type(screen.getByLabelText("延長日数"), "10");
    await user.click(screen.getByRole("button", { name: "もうちょっといける" }));

    expect(onClick).toHaveBeenCalledWith(10);
  });

  it("disables the input and button when disabled is true", () => {
    render(<SnoozeButton onClick={vi.fn()} disabled />);

    expect(screen.getByLabelText("延長日数")).toBeDisabled();
    expect(screen.getByRole("button", { name: "もうちょっといける" })).toBeDisabled();
  });
});
