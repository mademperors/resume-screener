import { extractPdfText } from '@src/processing/extraction/pdf-reader.js';
import { makePdf } from '../../../support/documents.js';

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

  it('treats white as white in gray and CMYK too', async () => {
    const pdf = await makePdf([
      { text: 'Visible line' },
      { text: 'gray white secret', color: { gray: 1 } },
      { text: 'near white secret', color: { gray: 0.97 } },
      { text: 'cmyk white secret', color: { cmyk: [0, 0, 0, 0] } },
      { text: 'Gray text stays', color: { gray: 0.4 } },
      { text: 'CMYK black stays', color: { cmyk: [0, 0, 0, 1] } },
    ]);
    const { text, hiddenText } = await extractPdfText(pdf);
    expect(text).toBe('Visible line\nGray text stays\nCMYK black stays');
    expect(hiddenText).toEqual([
      'gray white secret',
      'near white secret',
      'cmyk white secret',
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
