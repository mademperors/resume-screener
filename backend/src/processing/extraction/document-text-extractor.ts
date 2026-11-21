import { Injectable } from '@nestjs/common';
import { RESUME_MIME_TYPES } from '../../resumes/file-type.js';
import { UnreadableFileError } from '../processing-errors.js';
import { TextExtractor, type ExtractedDocument } from '../stages.js';
import { extractDocxText } from './docx-text.js';
import { extractPdfText } from './pdf-text.js';

/** Fewer readable characters than this means a scan or an empty file. */
export const MIN_TEXT_CHARS = 50;

@Injectable()
export class DocumentTextExtractor extends TextExtractor {
  async extract(file: Buffer, mimeType: string): Promise<ExtractedDocument> {
    let document: ExtractedDocument;
    try {
      if (mimeType === RESUME_MIME_TYPES.pdf) {
        document = await extractPdfText(file);
      } else if (mimeType === RESUME_MIME_TYPES.docx) {
        document = await extractDocxText(file);
      } else {
        throw new Error(`Unsupported type ${mimeType}`);
      }
    } catch (error) {
      // Damaged, encrypted or not really a PDF/DOCX.
      throw new UnreadableFileError({
        cause: error,
        detail: `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const readable = document.text.replace(/\s/g, '').length;
    if (readable < MIN_TEXT_CHARS) {
      throw new UnreadableFileError({
        detail: `Only ${readable} readable characters; probably a scan`,
      });
    }
    return document;
  }
}
