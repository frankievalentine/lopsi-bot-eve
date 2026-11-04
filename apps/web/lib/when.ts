const DAY = 24 * 60 * 60 * 1000;

/**
 * A short label for when something last happened, as a chat list shows it:
 * the time today, the weekday within the last week, else the date.
 */
export function formatWhen(
  iso: string,
  now = new Date(),
  locale?: string
): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  if (at.getTime() >= startOfToday) {
    return at.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (at.getTime() >= startOfToday - 6 * DAY) {
    return at.toLocaleDateString(locale, { weekday: "short" });
  }
  if (at.getFullYear() === now.getFullYear()) {
    return at.toLocaleDateString(locale, { day: "numeric", month: "short" });
  }
  return at.toLocaleDateString(locale, { dateStyle: "short" });
}
