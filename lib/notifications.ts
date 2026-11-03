/**
 * When a notification happened, as a short phrase for the bell's list.
 *
 * Relative time ("12 min ago") is the right unit here because the bell's job is
 * "what is new since I last looked" — an absolute clock time would make the
 * reader do the subtracting.
 *
 * Client-only by design: it reads the wall clock, so it would render a different
 * answer on the server than after hydration. Everything it is used by (the bell,
 * which is mounted after the shell's client boundary) is client-only too.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Returns "now" for the future rather than a negative age, which would read as a bug. */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const elapsed = now - timestamp;

  if (elapsed < MINUTE) {
    return "now";
  }
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} min ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days < 7) {
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  if (days < 365) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}