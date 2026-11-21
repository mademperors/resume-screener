import { contentDisposition, resumeStorageKey } from './file-storage.js';

describe('file storage helpers', () => {
  it('builds keys from ids only', () => {
    expect(resumeStorageKey('c1', 'j1', 'r1')).toBe(
      'companies/c1/jobs/j1/resumes/r1',
    );
  });

  it('keeps non-ASCII file names in the download header', () => {
    const header = contentDisposition('Резюме "Іван".pdf');
    expect(header).toMatch(/^inline; filename="[\x20-\x7e]+";/);
    expect(header).not.toMatch(/filename="[^"]*"[^;]*"/);
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('Резюме "Іван".pdf')}`,
    );
  });
});
