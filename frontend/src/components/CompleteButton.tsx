interface CompleteButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function CompleteButton({ onClick, disabled }: CompleteButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      お手入れ完了
    </button>
  );
}
