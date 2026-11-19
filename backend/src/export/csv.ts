/** Byte order mark so Excel opens the UTF-8 file with the right encoding. */
export const CSV_BOM = '﻿';

export type CsvValue = string | number | boolean | null | undefined;

/**
 * One CSV line (RFC 4180). Values that a spreadsheet would run as a formula
 * (starting with =, +, -, @, tab or CR) are prefixed with a quote, so a
 * crafted resume can't execute anything when the export is opened.
 */
export function csvLine(values: readonly CsvValue[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A download file name: readable ASCII plus the exact name for modern browsers. */
export function attachmentDisposition(filename: string): string {
  const ascii =
    filename
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\/]/g, '')
      .trim() || 'export.csv';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
