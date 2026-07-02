import { useState } from "react";
import { DEFAULT_SNOOZE_DAYS } from "@maintenance-reminder/shared";

interface SnoozeButtonProps {
  onClick: (days?: number) => void;
  disabled?: boolean;
}

export function SnoozeButton({ onClick, disabled }: SnoozeButtonProps) {
  const [days, setDays] = useState("");

  function handleClick() {
    onClick(days.trim() === "" ? undefined : Number(days));
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        value={days}
        onChange={(e) => setDays(e.target.value)}
        placeholder={String(DEFAULT_SNOOZE_DAYS)}
        disabled={disabled}
        aria-label="延長日数"
        className="w-14 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50"
      >
        もうちょっといける
      </button>
    </div>
  );
}
