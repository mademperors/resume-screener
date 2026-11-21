export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;

export const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type ResumeFileType = keyof typeof RESUME_MIME_TYPES;

const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// File names inside a zip are stored uncompressed, so they can be found directly.
const DOCX_MAIN_PART = Buffer.from('word/document.xml');

/**
 * Detects PDF and DOCX by content, not by name or the browser's MIME type.
 * Old binary .doc files and other zip-based formats return null.
 */
export function detectResumeFileType(file: Buffer): ResumeFileType | null {
  // Some PDF writers put a few bytes of junk before the header.
  if (file.subarray(0, 1024).includes(PDF_MAGIC)) {
    return 'pdf';
  }
  if (
    file.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC) &&
    file.includes(DOCX_MAIN_PART)
  ) {
    return 'docx';
  }
  return null;
}

/** Strips path parts and control characters and keeps names within 255 chars. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) {
    return 'resume';
  }
  if (cleaned.length <= 255) {
    return cleaned;
  }
  const dot = cleaned.lastIndexOf('.');
  const extension =
    dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, 255 - extension.length) + extension;
}
