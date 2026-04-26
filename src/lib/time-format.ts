/**
 * Shared time / number formatting helpers for mission-control components.
 * All functions are pure and have no side-effects.
 */

/**
 * Returns elapsed time since startedAt in human-readable form.
 * e.g. "45s", "2m 34s", "1h 12m"
 */
export function formatDuration(startedAt: string | Date): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Returns elapsed time since startedAt in stopwatch (clock) format.
 * e.g. "02:34", "01:12:34"
 * Used for compact always-visible controls where digit-width stability matters.
 */
export function formatDurationClock(startedAt: string | Date): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
  return `${pad(minutes)}:${pad(seconds % 60)}`;
}

/**
 * Formats a date string or Date as a short month+day label.
 * e.g. "Apr 25"
 */
export function formatDay(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString("en", { month: "short", day: "numeric" });
}

/**
 * Formats a millisecond duration as a compact string.
 * e.g. "234ms", "1.2s"
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Formats a large integer (token count, event count) with K/M suffixes.
 * e.g. 1200 → "1.2K", 3_400_000 → "3.4M"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
