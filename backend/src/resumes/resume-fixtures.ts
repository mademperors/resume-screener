/** Minimal file contents for tests; real enough for type detection only. */
export const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');

export const DOCX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('....[Content_Types].xml....word/document.xml....'),
]);
