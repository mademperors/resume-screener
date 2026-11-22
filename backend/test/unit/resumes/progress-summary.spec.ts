import { progressSummary } from '@src/resumes/resumes.service.js';

describe('progressSummary', () => {
  it('reads like the requirements example', () => {
    expect(progressSummary(50, 48, 2, true)).toBe(
      'Processed 48 of 50, 2 failed',
    );
    expect(progressSummary(50, 50, 0, true)).toBe('Processed 50 of 50');
    expect(progressSummary(50, 10, 1, false)).toBe('Processing: 11 of 50 done');
    expect(progressSummary(0, 0, 0, true)).toBe('No resumes uploaded yet');
  });
});
