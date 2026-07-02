export function daysUntil(dateString: string): number {
  const today = new Date();
  const due = new Date(`${dateString}T00:00:00`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((due.getTime() - new Date(today.toDateString()).getTime()) / msPerDay);
}

export function dueBadgeClass(days: number): string {
  if (days < 0) return "bg-red-100 text-red-800";
  if (days <= 3) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}日超過`;
  if (days === 0) return "本日";
  return `あと${days}日`;
}
