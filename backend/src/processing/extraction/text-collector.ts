import type { ExtractedDocument } from '../stages.js';

/** Upper bound on collected text; far above any real resume. */
const MAX_CHARS = 200_000;

/**
 * Builds the visible text and the hidden segments of a document as the
 * extractor walks it, keeping line breaks and spacing readable.
 */
export class TextCollector {
  private visible = '';
  private readonly hidden: string[] = [];
  private currentHidden = '';
  private size = 0;

  add(text: string, hidden: boolean): void {
    if (!text || this.size >= MAX_CHARS) {
      return;
    }
    this.size += text.length;
    if (hidden) {
      this.currentHidden += text;
      return;
    }
    if (this.flushHidden() && this.visible && !/\s$/.test(this.visible)) {
      // Keep the visible words around a removed hidden run apart.
      this.visible += ' ';
    }
    this.visible += text;
  }

  space(): void {
    if (this.currentHidden) {
      this.currentHidden += ' ';
    } else if (this.visible && !/\s$/.test(this.visible)) {
      this.visible += ' ';
    }
  }

  newLine(): void {
    this.flushHidden();
    if (this.visible && !this.visible.endsWith('\n')) {
      this.visible += '\n';
    }
  }

  result(): ExtractedDocument {
    this.flushHidden();
    return {
      text: normalizeWhitespace(this.visible),
      hiddenText: this.hidden,
    };
  }

  /** Returns true if a hidden segment was closed. */
  private flushHidden(): boolean {
    const segment = this.currentHidden.replace(/\s+/g, ' ').trim();
    this.currentHidden = '';
    if (segment) {
      this.hidden.push(segment);
      return true;
    }
    return false;
  }
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
