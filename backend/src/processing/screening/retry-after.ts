/**
 * Reads an HTTP `Retry-After` header: a number of seconds or an HTTP date.
 * Returns the wait in milliseconds (0 for a date in the past), or null when
 * the header is missing or can't be read.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: Date,
): number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  // An HTTP date names the day and month ("Thu, 19 Nov 2026 12:00:00 GMT");
  // without letters it's a malformed number, which Date.parse would accept.
  const date = /[a-z]/i.test(trimmed) ? Date.parse(trimmed) : NaN;
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, date - now.getTime());
}
