import { Inject, Injectable } from '@nestjs/common';
import {
  PermanentProcessingError,
  UnreadableFileError,
} from '../processing-errors.js';
import { TextExtractor, type ExtractedDocument } from '../stages.js';
import { DOCUMENT_READERS, DocumentReader } from './document-reader.js';

/** Fewer readable characters than this means a scan or an empty file. */
export const MIN_TEXT_CHARS = 50;

/**
 * Extracts text with the DocumentReader registered for the file's MIME type
 * and rejects files with too little text to evaluate.
 */
@Injectable()
export class DocumentTextExtractor extends TextExtractor {
  private readonly readers = new Map<string, DocumentReader>();
  private readonly formatNames: string[];

  constructor(@Inject(DOCUMENT_READERS) readers: readonly DocumentReader[]) {
    super();
    for (const reader of readers) {
      for (const mimeType of reader.mimeTypes) {
        const taken = this.readers.get(mimeType);
        if (taken) {
          throw new Error(
            `${mimeType} is handled by both ${taken.constructor.name} and ${reader.constructor.name}`,
          );
        }
        this.readers.set(mimeType, reader);
      }
    }
    this.formatNames = readers.map((reader) => reader.formatName);
  }

  async extract(file: Buffer, mimeType: string): Promise<ExtractedDocument> {
    const reader = this.readers.get(mimeType);
    if (!reader) {
      // Uploads accept only types we can read, so this is a setup mistake.
      throw new PermanentProcessingError(
        `Files of this type can't be processed. Upload a ${this.formatNames.join(' or ')} file.`,
        { detail: `No document reader for ${mimeType}` },
      );
    }

    let document: ExtractedDocument;
    try {
      document = await reader.read(file);
    } catch (error) {
      // Damaged, encrypted or not really of this format.
      throw new UnreadableFileError({
        cause: error,
        detail: `${reader.formatName} text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
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
