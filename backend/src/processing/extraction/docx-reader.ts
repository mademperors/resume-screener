import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { RESUME_MIME_TYPES } from '../../resumes/file-type.js';
import type { ExtractedDocument } from '../stages.js';
import { DocumentReader } from './document-reader.js';
import {
  isBackgroundColour,
  isWhite,
  readThemeColours,
  resolveColour,
  type ThemeColours,
} from './docx-colours.js';
import { TextCollector } from './text-collector.js';

@Injectable()
export class DocxReader extends DocumentReader {
  readonly formatName = 'DOCX';
  readonly mimeTypes = [RESUME_MIME_TYPES.docx];

  read(file: Buffer): Promise<ExtractedDocument> {
    return extractDocxText(file);
  }
}

/** Guards against zip bombs: limit on the unpacked size of one XML part. */
const MAX_PART_BYTES = 20 * 1024 * 1024;
/** Font sizes are in half-points; below 3pt text can't be read. */
const MIN_READABLE_HALF_POINTS = 6;

const MAIN_PART = 'word/document.xml';
const MAIN_RELATIONSHIPS = 'word/_rels/document.xml.rels';

export class InvalidDocxError extends Error {}

/**
 * Reads the text a DOCX shows: the headers and footers Word displays, the
 * body (with tables and text boxes) and footnotes and endnotes. Text
 * formatted to be invisible is kept apart: hidden runs, tiny font, or white
 * text (also a theme colour that resolves to white) without shading behind
 * it.
 *
 * Not read at all, because they aren't part of the page: comments, tracked
 * deletions, field codes, header parts no section displays, and the legacy
 * copy of text boxes kept for old Word versions (it would repeat the text).
 */
export async function extractDocxText(
  file: Buffer,
): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(file);
  const main = zip.file(MAIN_PART);
  if (!main) {
    throw new InvalidDocxError(`No ${MAIN_PART} in the package`);
  }
  const body = await readXml(main);
  const relationships = await readRelationships(zip);
  const theme = readThemeColours(
    await readOptionalPart(zip, relationships.firstOfType('theme')),
  );
  const settings = await readOptionalPart(
    zip,
    relationships.firstOfType('settings'),
  );
  const { headers, footers } = displayedHeadersAndFooters(
    body,
    relationships,
    isOn(/<w:evenAndOddHeaders\b([^>]*)>/.exec(settings ?? '')?.[1]),
  );
  const notes = [
    relationships.firstOfType('footnotes'),
    relationships.firstOfType('endnotes'),
  ];

  const collector = new TextCollector();
  const read = (xml: string | null) => {
    if (xml) {
      readPart(xml, theme, collector);
      collector.newLine();
    }
  };
  // Contacts are often in the header, so read it first.
  for (const path of headers) {
    read(await readOptionalPart(zip, path));
  }
  read(body);
  for (const path of [...notes, ...footers]) {
    read(await readOptionalPart(zip, path));
  }
  return collector.result();
}

// --- Package parts ---

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

async function readOptionalPart(
  zip: JSZip,
  path: string | null | undefined,
): Promise<string | null> {
  const part = path ? zip.file(path) : null;
  return part ? readXml(part) : null;
}

class Relationships {
  constructor(
    private readonly byId: ReadonlyMap<string, { type: string; path: string }>,
  ) {}

  /** Package path of a relationship's target. */
  path(id: string): string | null {
    return this.byId.get(id)?.path ?? null;
  }

  firstOfType(type: string): string | null {
    for (const relationship of this.byId.values()) {
      if (relationship.type === type) {
        return relationship.path;
      }
    }
    return null;
  }
}

/** The main document's relationships: its headers, theme, notes… */
async function readRelationships(zip: JSZip): Promise<Relationships> {
  const xml = await readOptionalPart(zip, MAIN_RELATIONSHIPS);
  const byId = new Map<string, { type: string; path: string }>();
  for (const [, attributes] of (xml ?? '').matchAll(
    /<Relationship\b([^>]*)>/g,
  )) {
    const id = attribute(attributes, 'Id');
    const type = attribute(attributes, 'Type')?.split('/').pop();
    const target = attribute(attributes, 'Target');
    if (!id || !type || !target || attribute(attributes, 'TargetMode')) {
      continue;
    }
    // Targets are relative to word/, or absolute within the package.
    const path = target.startsWith('/') ? target.slice(1) : `word/${target}`;
    byId.set(id, { type, path });
  }
  return new Relationships(byId);
}

/**
 * The header and footer parts Word shows: those a section refers to, with
 * first-page ones only if that section has a different first page, and
 * even-page ones only if the document has different odd and even pages. A
 * part nothing displays is never seen, so it isn't read.
 */
function displayedHeadersAndFooters(
  body: string,
  relationships: Relationships,
  evenAndOddPages: boolean,
): { headers: string[]; footers: string[] } {
  const headers = new Set<string>();
  const footers = new Set<string>();
  // Sections with a body; a self-closing <w:sectPr/> refers to nothing.
  for (const [section] of body.matchAll(
    /<w:sectPr\b(?:[^>]*[^/>])?>[\s\S]*?<\/w:sectPr>/g,
  )) {
    const titlePage = isOn(/<w:titlePg\b([^>]*)>/.exec(section)?.[1]);
    for (const [, kind, attributes] of section.matchAll(
      /<w:(header|footer)Reference\b([^>]*)>/g,
    )) {
      const type = attribute(attributes, 'w:type') ?? 'default';
      if (
        (type === 'first' && !titlePage) ||
        (type === 'even' && !evenAndOddPages)
      ) {
        continue;
      }
      const id = attribute(attributes, 'r:id');
      const path = id ? relationships.path(id) : null;
      if (path) {
        (kind === 'header' ? headers : footers).add(path);
      }
    }
  }
  return { headers: [...headers], footers: [...footers] };
}

// --- Text and formatting ---

interface RunState {
  vanish: boolean;
  white: boolean;
  tinyFont: boolean;
  shaded: boolean;
}

/** Which properties the elements being read belong to. */
type PropertyOwner = 'run' | 'paragraph' | 'paragraph-mark' | 'cell' | null;

const TOKEN =
  /<(\/?)(w:p|w:r|w:t|w:tab|w:br|w:cr|w:tc|w:rPr|w:pPr|w:tcPr|w:vanish|w:color|w:sz|w:shd|w:highlight|mc:Fallback)\b([^>]*?)(\/?)>|([^<]+)/g;

function readPart(xml: string, theme: ThemeColours, out: TextCollector): void {
  const runs: RunState[] = [];
  // Shading of the enclosing paragraphs and table cells.
  const paragraphShaded: boolean[] = [];
  const cellShaded: boolean[] = [];
  let props: PropertyOwner = null;
  let inText = false;
  // Inside the copy of a text box kept for old Word versions.
  let fallbackDepth = 0;

  for (const match of xml.matchAll(TOKEN)) {
    const [, closing, tag, attributes, selfClosing, text] = match;
    const opening = !closing;
    if (tag === 'mc:Fallback') {
      if (!selfClosing) {
        fallbackDepth += opening ? 1 : -1;
      }
      continue;
    }
    if (fallbackDepth > 0) {
      continue;
    }
    if (text !== undefined) {
      if (inText && runs.length > 0) {
        out.add(
          decodeEntities(text),
          isHidden(runs.at(-1)!, paragraphShaded, cellShaded),
        );
      }
      continue;
    }
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
        // Run properties inside paragraph properties format the paragraph
        // mark, not any text.
        if (opening && !selfClosing) {
          props = props === 'paragraph' ? 'paragraph-mark' : 'run';
        } else {
          props = props === 'paragraph-mark' ? 'paragraph' : null;
        }
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
          applyProperty(tag, attributes, props, theme, {
            runs,
            paragraphShaded,
            cellShaded,
          });
        }
    }
  }
}

function applyProperty(
  tag: string,
  attributes: string,
  props: PropertyOwner,
  theme: ThemeColours,
  state: {
    runs: RunState[];
    paragraphShaded: boolean[];
    cellShaded: boolean[];
  },
): void {
  const { runs, paragraphShaded, cellShaded } = state;
  if (tag === 'w:shd' || tag === 'w:highlight') {
    const shaded =
      tag === 'w:shd'
        ? isBackgroundColour(
            resolveColour(
              {
                value: attribute(attributes, 'w:fill'),
                theme: attribute(attributes, 'w:themeFill'),
                tint: attribute(attributes, 'w:themeFillTint'),
                shade: attribute(attributes, 'w:themeFillShade'),
              },
              theme,
            ),
          )
        : // Highlights are named colours: "yellow", "white", "none"…
          isBackgroundColour(attribute(attributes, 'w:val'));
    if (props === 'run' && runs.length > 0) {
      runs.at(-1)!.shaded ||= shaded;
    } else if (props === 'paragraph' && paragraphShaded.length > 0) {
      paragraphShaded[paragraphShaded.length - 1] ||= shaded;
    } else if (props === 'cell' && cellShaded.length > 0) {
      cellShaded[cellShaded.length - 1] ||= shaded;
    }
    return;
  }
  // Only run properties make text hidden.
  if (props !== 'run' || runs.length === 0) {
    return;
  }
  const run = runs.at(-1)!;
  if (tag === 'w:vanish') {
    run.vanish = isOn(attributes);
  } else if (tag === 'w:color') {
    run.white = isWhite(
      resolveColour(
        {
          value: attribute(attributes, 'w:val'),
          theme: attribute(attributes, 'w:themeColor'),
          tint: attribute(attributes, 'w:themeTint'),
          shade: attribute(attributes, 'w:themeShade'),
        },
        theme,
      ),
    );
  } else if (tag === 'w:sz') {
    const halfPoints = Number(attribute(attributes, 'w:val'));
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

// --- XML helpers ---

const attributePatterns = new Map<string, RegExp>();

/** An attribute's value, in single or double quotes. */
function attribute(attributes: string, name: string): string | undefined {
  let pattern = attributePatterns.get(name);
  if (!pattern) {
    pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    attributePatterns.set(name, pattern);
  }
  const match = pattern.exec(attributes);
  return match ? (match[1] ?? match[2]) : undefined;
}

/**
 * An on/off property (w:vanish, w:titlePg…), given the attributes of its
 * element or undefined when the element is absent: on when present, unless
 * w:val turns it off.
 */
function isOn(attributes: string | undefined): boolean {
  if (attributes === undefined) {
    return false;
  }
  const value = attribute(attributes, 'w:val')?.toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
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
