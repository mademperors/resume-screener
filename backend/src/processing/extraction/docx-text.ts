import JSZip from 'jszip';
import type { ExtractedDocument } from '../stages.js';
import { TextCollector } from './text-collector.js';

/** Guards against zip bombs: limit on the unpacked size of one XML part. */
const MAX_PART_BYTES = 20 * 1024 * 1024;
/** Font sizes are in half-points; below 3pt text can't be read. */
const MIN_READABLE_HALF_POINTS = 6;

export class InvalidDocxError extends Error {}

/**
 * Reads the text of a DOCX (body, headers and footers, including text boxes
 * and tables) and separates text formatted to be invisible: hidden runs,
 * tiny font, or white text without shading behind it.
 */
export async function extractDocxText(
  file: Buffer,
): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(file);
  const body = zip.file('word/document.xml');
  if (!body) {
    throw new InvalidDocxError('No word/document.xml in the package');
  }
  // Contacts are often in the header, so read it first.
  const headers = zip.file(/^word\/header\d*\.xml$/);
  const footers = zip.file(/^word\/footer\d*\.xml$/);

  const collector = new TextCollector();
  for (const part of [...headers, body, ...footers]) {
    readPart(await readXml(part), collector);
    collector.newLine();
  }
  return collector.result();
}

async function readXml(part: JSZip.JSZipObject): Promise<string> {
  const declared = (
    part as unknown as { _data?: { uncompressedSize?: number } }
  )._data?.uncompressedSize;
  if (declared !== undefined && declared > MAX_PART_BYTES) {
    throw new InvalidDocxError(`${part.name} is too large`);
  }
  const xml = await part.async('string');
  if (xml.length > MAX_PART_BYTES) {
    throw new InvalidDocxError(`${part.name} is too large`);
  }
  return xml;
}

interface RunState {
  vanish: boolean;
  white: boolean;
  tinyFont: boolean;
  shaded: boolean;
}

const TOKEN =
  /<(\/?)(w:p|w:r|w:t|w:tab|w:br|w:cr|w:tc|w:rPr|w:pPr|w:tcPr|w:vanish|w:color|w:sz|w:shd|w:highlight)\b([^>]*?)(\/?)>|([^<]+)/g;

function readPart(xml: string, out: TextCollector): void {
  const runs: RunState[] = [];
  // Shading of the enclosing paragraphs and table cells.
  const paragraphShaded: boolean[] = [];
  const cellShaded: boolean[] = [];
  let props: 'run' | 'paragraph' | 'cell' | null = null;
  let inText = false;

  for (const match of xml.matchAll(TOKEN)) {
    const [, closing, tag, attributes, selfClosing, text] = match;
    if (text !== undefined) {
      if (inText && runs.length > 0) {
        out.add(
          decodeEntities(text),
          isHidden(runs.at(-1)!, paragraphShaded, cellShaded),
        );
      }
      continue;
    }
    const opening = !closing;
    switch (tag) {
      case 'w:p':
        if (opening && !selfClosing) {
          paragraphShaded.push(false);
        } else {
          paragraphShaded.pop();
          out.newLine();
        }
        break;
      case 'w:tc':
        if (opening && !selfClosing) {
          cellShaded.push(false);
        } else {
          cellShaded.pop();
          out.space();
        }
        break;
      case 'w:r':
        if (opening && !selfClosing) {
          runs.push({
            vanish: false,
            white: false,
            tinyFont: false,
            shaded: false,
          });
        } else if (closing) {
          runs.pop();
        }
        break;
      case 'w:rPr':
        props = opening && !selfClosing ? 'run' : null;
        break;
      case 'w:pPr':
        props = opening && !selfClosing ? 'paragraph' : null;
        break;
      case 'w:tcPr':
        props = opening && !selfClosing ? 'cell' : null;
        break;
      case 'w:t':
        inText = opening && !selfClosing;
        break;
      case 'w:tab':
        if (runs.length > 0) {
          out.add('\t', isHidden(runs.at(-1)!, paragraphShaded, cellShaded));
        }
        break;
      case 'w:br':
      case 'w:cr':
        out.newLine();
        break;
      default:
        if (opening) {
          applyProperty(
            tag,
            attributes,
            props,
            runs,
            paragraphShaded,
            cellShaded,
          );
        }
    }
  }
}

function applyProperty(
  tag: string,
  attributes: string,
  props: 'run' | 'paragraph' | 'cell' | null,
  runs: RunState[],
  paragraphShaded: boolean[],
  cellShaded: boolean[],
): void {
  const value = /w:val="([^"]*)"/.exec(attributes)?.[1];
  if (tag === 'w:shd' || tag === 'w:highlight') {
    const fill =
      tag === 'w:shd' ? /w:fill="([^"]*)"/.exec(attributes)?.[1] : value;
    const shaded = isBackgroundColour(fill);
    if (props === 'run' && runs.length > 0) {
      runs.at(-1)!.shaded ||= shaded;
    } else if (props === 'paragraph' && paragraphShaded.length > 0) {
      paragraphShaded[paragraphShaded.length - 1] ||= shaded;
    } else if (props === 'cell' && cellShaded.length > 0) {
      cellShaded[cellShaded.length - 1] ||= shaded;
    }
    return;
  }
  // Only run properties make text hidden; paragraph-mark properties don't.
  if (props !== 'run' || runs.length === 0) {
    return;
  }
  const run = runs.at(-1)!;
  if (tag === 'w:vanish') {
    run.vanish = value !== '0' && value !== 'false';
  } else if (tag === 'w:color') {
    run.white = isWhite(value);
  } else if (tag === 'w:sz') {
    const halfPoints = Number(value);
    run.tinyFont =
      Number.isFinite(halfPoints) && halfPoints < MIN_READABLE_HALF_POINTS;
  }
}

function isHidden(
  run: RunState,
  paragraphShaded: boolean[],
  cellShaded: boolean[],
): boolean {
  if (run.vanish || run.tinyFont) {
    return true;
  }
  if (run.white) {
    const onShading =
      run.shaded || paragraphShaded.some(Boolean) || cellShaded.some(Boolean);
    return !onShading;
  }
  return false;
}

function isWhite(colour: string | undefined): boolean {
  if (!colour || !/^[0-9a-f]{6}$/i.test(colour)) {
    return colour?.toLowerCase() === 'white';
  }
  return [0, 2, 4].every((i) => parseInt(colour.slice(i, i + 2), 16) >= 0xf0);
}

/** A fill that isn't empty, automatic or white. */
function isBackgroundColour(fill: string | undefined): boolean {
  if (!fill) {
    return false;
  }
  const value = fill.toLowerCase();
  if (value === 'auto' || value === 'none' || value === 'clear') {
    return false;
  }
  return !isWhite(value);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      }
      if (code.startsWith('#')) {
        return String.fromCodePoint(parseInt(code.slice(1), 10));
      }
      return ENTITIES[code] ?? entity;
    },
  );
}
