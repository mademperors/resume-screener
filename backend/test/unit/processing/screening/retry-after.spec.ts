import { parseRetryAfter } from '@src/processing/screening/retry-after.js';

const NOW = new Date('2026-11-19T12:00:00Z');

describe('parseRetryAfter', () => {
  it('reads seconds', () => {
    expect(parseRetryAfter('120', NOW)).toBe(120_000);
    expect(parseRetryAfter(' 0 ', NOW)).toBe(0);
  });

  it('reads an HTTP date, and a past one means no wait', () => {
    expect(parseRetryAfter('Thu, 19 Nov 2026 12:01:30 GMT', NOW)).toBe(90_000);
    expect(parseRetryAfter('Thu, 19 Nov 2026 11:00:00 GMT', NOW)).toBe(0);
  });

  it('ignores a missing or unreadable header', () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter('', NOW)).toBeNull();
    expect(parseRetryAfter('soon', NOW)).toBeNull();
    expect(parseRetryAfter('-5', NOW)).toBeNull();
  });
});
