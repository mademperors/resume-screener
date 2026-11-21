import { cleanFilename, detectResumeFileType } from './file-type.js';
import { DOCX_BYTES, PDF_BYTES } from './resume-fixtures.js';

describe('detectResumeFileType', () => {
  it('detects PDF by its header, even after leading junk', () => {
    expect(detectResumeFileType(PDF_BYTES)).toBe('pdf');
    expect(
      detectResumeFileType(Buffer.concat([Buffer.from('\r\n'), PDF_BYTES])),
    ).toBe('pdf');
  });

  it('detects DOCX as a zip with a Word document part', () => {
    expect(detectResumeFileType(DOCX_BYTES)).toBe('docx');
  });

  it('rejects other zip files, old .doc files and text', () => {
    const xlsx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('xl/workbook.xml'),
    ]);
    const doc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(detectResumeFileType(xlsx)).toBeNull();
    expect(detectResumeFileType(doc)).toBeNull();
    expect(detectResumeFileType(Buffer.from('plain text'))).toBeNull();
  });

  it('ignores the declared extension', () => {
    // Content decides: a PDF named .docx is still a PDF.
    expect(detectResumeFileType(PDF_BYTES)).toBe('pdf');
  });
});

describe('cleanFilename', () => {
  it('drops path parts and control characters', () => {
    expect(cleanFilename('C:\\Users\\x\\Іван\u0007 CV.pdf')).toBe(
      'Іван CV.pdf',
    );
    expect(cleanFilename('../../etc/passwd')).toBe('passwd');
  });

  it('falls back to a default name', () => {
    expect(cleanFilename('  ')).toBe('resume');
  });

  it('shortens long names but keeps the extension', () => {
    const name = cleanFilename(`${'a'.repeat(300)}.docx`);
    expect(name).toHaveLength(255);
    expect(name.endsWith('.docx')).toBe(true);
  });
});
