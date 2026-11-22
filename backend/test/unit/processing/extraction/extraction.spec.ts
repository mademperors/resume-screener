import { DocumentTextExtractor } from '@src/processing/extraction/document-text-extractor.js';
import { extractDocxText } from '@src/processing/extraction/docx-text.js';
import { extractPdfText } from '@src/processing/extraction/pdf-text.js';
import { UnreadableFileError } from '@src/processing/processing-errors.js';
import { RESUME_MIME_TYPES } from '@src/resumes/file-type.js';
import { makeDocx, makeEmptyPdf, makePdf } from '../../../support/documents.js';

const LONG_LINE =
  'Backend engineer with TypeScript, PostgreSQL and Docker experience since 2018.';

describe('extractPdfText', () => {
  it('reads visible text line by line', async () => {
    const pdf = await makePdf([{ text: 'Jane Doe' }, { text: LONG_LINE }]);
    const { text, hiddenText } = await extractPdfText(pdf);
    expect(text).toBe(`Jane Doe\n${LONG_LINE}`);
    expect(hiddenText).toEqual([]);
  });

  it('separates white, tiny, transparent, invisible and off-page text', async () => {
    const pdf = await makePdf([
      { text: 'Visible line' },
      { text: 'white secret', color: [1, 1, 1] },
      { text: 'tiny secret', size: 1 },
      { text: 'transparent secret', opacity: 0 },
      { text: 'invisible secret', invisible: true },
      { text: 'offpage secret', x: -2000 },
    ]);
    const { text, hiddenText } = await extractPdfText(pdf);
    expect(text).toBe('Visible line');
    expect(hiddenText).toEqual([
      'white secret',
      'tiny secret',
      'transparent secret',
      'invisible secret',
      'offpage secret',
    ]);
  });

  it('keeps white text drawn on a dark box visible', async () => {
    // Line 1 sits at y = 742; the box covers it like a coloured sidebar.
    const pdf = await makePdf(
      [{ text: 'Header' }, { text: 'Skills: Kotlin', color: [1, 1, 1] }],
      [{ x: 40, y: 730, width: 300, height: 30, color: [0.1, 0.2, 0.5] }],
    );
    const { text, hiddenText } = await extractPdfText(pdf);
    expect(text).toBe('Header\nSkills: Kotlin');
    expect(hiddenText).toEqual([]);
  });

  it('rejects data that is not a PDF', async () => {
    await expect(
      extractPdfText(Buffer.from('%PDF-1.7 garbage')),
    ).rejects.toThrow();
  });
});

describe('extractDocxText', () => {
  it('reads the header first, then paragraphs and table cells', async () => {
    const docx = await makeDocx(
      [
        [{ text: 'Summary & goals' }],
        { cells: [[{ text: 'Python' }], [{ text: 'SQL' }]] },
        [{ text: 'Second ' }, { text: 'run' }],
      ],
      { header: [{ text: 'Jane Doe' }] },
    );
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe('Jane Doe\nSummary & goals\nPython\nSQL\nSecond run');
    expect(hiddenText).toEqual([]);
  });

  it('separates hidden, white and tiny runs', async () => {
    const docx = await makeDocx([
      [
        { text: 'Visible ' },
        { text: 'vanished secret', vanish: true },
        { text: ' text' },
      ],
      [{ text: 'white secret', color: 'FFFFFF' }],
      [{ text: 'tiny secret', size: 2 }],
    ]);
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe('Visible text');
    expect(hiddenText).toEqual([
      'vanished secret',
      'white secret',
      'tiny secret',
    ]);
  });

  it('keeps white text on shading visible', async () => {
    const docx = await makeDocx([
      [{ text: 'White on navy', color: 'FFFFFF', shading: '1F3864' }],
      {
        cells: [[{ text: 'In a dark cell', color: 'FFFFFF' }]],
        cellShading: '000000',
      },
    ]);
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe('White on navy\nIn a dark cell');
    expect(hiddenText).toEqual([]);
  });

  it('rejects a zip without a Word document', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<x/>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(extractDocxText(buffer)).rejects.toThrow(/document\.xml/);
  });
});

describe('DocumentTextExtractor', () => {
  const extractor = new DocumentTextExtractor();

  it('extracts PDF and DOCX by MIME type', async () => {
    const pdf = await makePdf([{ text: LONG_LINE }]);
    const docx = await makeDocx([[{ text: LONG_LINE }]]);
    expect((await extractor.extract(pdf, RESUME_MIME_TYPES.pdf)).text).toBe(
      LONG_LINE,
    );
    expect((await extractor.extract(docx, RESUME_MIME_TYPES.docx)).text).toBe(
      LONG_LINE,
    );
  });

  it('reports scans and damaged files as unreadable', async () => {
    await expect(
      extractor.extract(await makeEmptyPdf(), RESUME_MIME_TYPES.pdf),
    ).rejects.toBeInstanceOf(UnreadableFileError);
    await expect(
      extractor.extract(
        Buffer.from('PK\u0003\u0004 broken'),
        RESUME_MIME_TYPES.docx,
      ),
    ).rejects.toBeInstanceOf(UnreadableFileError);
  });
});
