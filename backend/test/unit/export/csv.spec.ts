import { attachmentDisposition, csvCell, csvLine } from '@src/export/csv.js';

describe('csv', () => {
  it('quotes values with commas, quotes or line breaks', () => {
    expect(csvLine(['a', 'b,c', 'say "hi"', 'two\nlines', 3, null])).toBe(
      'a,"b,c","say ""hi""","two\nlines",3,\r\n',
    );
  });

  it('defuses values a spreadsheet would run as formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(
      `"'=HYPERLINK(""http://evil"")"`,
    );
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // Numbers stay numbers.
    expect(csvCell(-5)).toBe('-5');
  });

  it('builds a download file name safe for every browser', () => {
    expect(attachmentDisposition('Розробник "Senior".csv')).toBe(
      `attachment; filename="Senior.csv"; filename*=UTF-8''${encodeURIComponent('Розробник "Senior".csv')}`,
    );
  });
});
