import type { Provider } from '@nestjs/common';
import { TextExtractor } from '../stages.js';
import { DOCUMENT_READERS, type DocumentReader } from './document-reader.js';
import { DocumentTextExtractor } from './document-text-extractor.js';
import { DocxReader } from './docx-reader.js';
import { PdfReader } from './pdf-reader.js';

/** Every format resumes can be read from. Add a DocumentReader here. */
const READERS = [PdfReader, DocxReader];

/** Binds TextExtractor to the extractor that dispatches to READERS. */
export const textExtractionProviders: Provider[] = [
  ...READERS,
  {
    provide: DOCUMENT_READERS,
    inject: READERS,
    useFactory: (...readers: DocumentReader[]) => readers,
  },
  { provide: TextExtractor, useClass: DocumentTextExtractor },
];
