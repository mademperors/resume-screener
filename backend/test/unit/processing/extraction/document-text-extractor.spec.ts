import { DocumentReader } from '@src/processing/extraction/document-reader.js';
import { DocumentTextExtractor } from '@src/processing/extraction/document-text-extractor.js';
import { DocxReader } from '@src/processing/extraction/docx-reader.js';
import { PdfReader } from '@src/processing/extraction/pdf-reader.js';
import {
  PermanentProcessingError,
  UnreadableFileError,
} from '@src/processing/processing-errors.js';
import type { ExtractedDocument } from '@src/processing/stages.js';
import { RESUME_MIME_TYPES } from '@src/resumes/file-type.js';
import { makeDocx, makeEmptyPdf, makePdf } from '../../../support/documents.js';

const LONG_LINE =
  'Backend engineer with TypeScript, PostgreSQL and Docker experience since 2018.';

class PlainTextReader extends DocumentReader {
  readonly formatName = 'TXT';
  readonly mimeTypes = ['text/plain'];

  async read(file: Buffer): Promise<ExtractedDocument> {
    return { text: file.toString('utf8'), hiddenText: [] };
  }
}

describe('DocumentTextExtractor', () => {
  const extractor = new DocumentTextExtractor([
    new PdfReader(),
    new DocxReader(),
  ]);

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

  it('reads a new format once its reader is registered', async () => {
    const withText = new DocumentTextExtractor([new PlainTextReader()]);
    const result = await withText.extract(Buffer.from(LONG_LINE), 'text/plain');
    expect(result.text).toBe(LONG_LINE);
  });

  it('fails permanently for a type no reader handles, naming the ones it reads', async () => {
    const error = await extractor
      .extract(Buffer.from(LONG_LINE), 'text/plain')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentProcessingError);
    expect(error).not.toBeInstanceOf(UnreadableFileError);
    expect((error as PermanentProcessingError).userMessage).toBe(
      "Files of this type can't be processed. Upload a PDF or DOCX file.",
    );
  });

  it('refuses two readers for the same type', () => {
    expect(
      () => new DocumentTextExtractor([new PdfReader(), new PdfReader()]),
    ).toThrow(/application\/pdf/);
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
