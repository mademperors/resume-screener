import type { ExtractedDocument } from '../stages.js';

/**
 * Reads the text of one document format. DocumentTextExtractor picks the
 * reader by the file's MIME type; to support a format, implement this and
 * add the class to READERS in text-extraction.providers.ts (and let uploads
 * accept it: src/resumes/file-type.ts).
 */
export abstract class DocumentReader {
  /** Shown to recruiters, e.g. "PDF". */
  abstract readonly formatName: string;
  /** MIME types this reader handles. */
  abstract readonly mimeTypes: readonly string[];

  /**
   * Visible text, with text a reader can't see kept apart. Throws when the
   * file isn't a readable document of this format.
   */
  abstract read(file: Buffer): Promise<ExtractedDocument>;
}

/** Injection token for the list of all readers. */
export const DOCUMENT_READERS = Symbol('DOCUMENT_READERS');
