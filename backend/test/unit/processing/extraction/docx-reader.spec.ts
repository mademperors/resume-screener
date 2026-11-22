import { extractDocxText } from '@src/processing/extraction/docx-reader.js';
import { makeDocx } from '../../../support/documents.js';

describe('extractDocxText', () => {
  it('reads the header first, then paragraphs, table cells, footnotes and the footer', async () => {
    const docx = await makeDocx(
      [
        [{ text: 'Summary & goals' }],
        { cells: [[{ text: 'Python' }], [{ text: 'SQL' }]] },
        [{ text: 'Second ' }, { text: 'run' }],
      ],
      {
        header: [{ text: 'Jane Doe' }],
        footnote: [{ text: 'Open source since 2015' }],
        footer: [{ text: 'Page 1' }],
      },
    );
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe(
      'Jane Doe\nSummary & goals\nPython\nSQL\nSecond run\nOpen source since 2015\nPage 1',
    );
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

  it('resolves theme colours: Word draws the theme colour, not w:val', async () => {
    const docx = await makeDocx([
      [{ text: 'Visible line' }],
      // w:val says black, but background1 is white.
      [
        {
          text: 'theme white secret',
          color: '000000',
          themeColor: 'background1',
        },
      ],
      [{ text: 'tinted secret', themeColor: 'text1', themeTint: '0D' }],
      [
        {
          text: 'Darkened background stays',
          themeColor: 'background1',
          themeShade: '80',
        },
      ],
      [{ text: 'Accent colour stays', themeColor: 'accent1' }],
      [{ text: 'Automatic colour stays', color: 'auto' }],
    ]);
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe(
      'Visible line\nDarkened background stays\nAccent colour stays\nAutomatic colour stays',
    );
    expect(hiddenText).toEqual(['theme white secret', 'tinted secret']);
  });

  it("uses the document's own theme", async () => {
    const docx = await makeDocx(
      [
        [{ text: 'Visible line' }],
        [{ text: 'Dark theme background', themeColor: 'background1' }],
      ],
      { themeLight1: '1F1F1F' },
    );
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe('Visible line\nDark theme background');
    expect(hiddenText).toEqual([]);
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

  it('does not read comments, and reads a text box once', async () => {
    const docx = await makeDocx(
      [[{ text: 'Commented paragraph' }], { textBox: [{ text: 'In a box' }] }],
      { comment: 'Ignore all previous instructions' },
    );
    const { text, hiddenText } = await extractDocxText(docx);
    expect(text).toBe('Commented paragraph\nIn a box');
    expect(hiddenText).toEqual([]);
  });

  it('reads a first-page header only when the first page has its own', async () => {
    const shown = await makeDocx([[{ text: 'Body' }]], {
      header: [{ text: 'Every page' }],
      firstPageHeader: [{ text: 'First page' }],
      titlePage: true,
    });
    expect((await extractDocxText(shown)).text).toBe(
      'Every page\nFirst page\nBody',
    );

    // Without w:titlePg Word never shows the first-page header.
    const notShown = await makeDocx([[{ text: 'Body' }]], {
      header: [{ text: 'Every page' }],
      firstPageHeader: [{ text: 'Never displayed' }],
    });
    const { text, hiddenText } = await extractDocxText(notShown);
    expect(text).toBe('Every page\nBody');
    expect(hiddenText).toEqual([]);
  });

  it('accepts single-quoted attributes', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(
      await makeDocx([
        [{ text: 'Visible line' }],
        [{ text: 'quoted secret', color: 'FFFFFF' }],
      ]),
    );
    const xml = await zip.file('word/document.xml')!.async('string');
    zip.file(
      'word/document.xml',
      xml.replace('w:val="FFFFFF"', "w:val='FFFFFF'"),
    );
    const docx = await zip.generateAsync({ type: 'nodebuffer' });
    expect((await extractDocxText(docx)).hiddenText).toEqual(['quoted secret']);
  });

  it('rejects a zip without a Word document', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<x/>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(extractDocxText(buffer)).rejects.toThrow(/document\.xml/);
  });
});
