import { Injectable } from '@nestjs/common';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { RESUME_MIME_TYPES } from '../../resumes/file-type.js';
import type { ExtractedDocument } from '../stages.js';
import { DocumentReader } from './document-reader.js';
import { TextCollector } from './text-collector.js';

@Injectable()
export class PdfReader extends DocumentReader {
  readonly formatName = 'PDF';
  readonly mimeTypes = [RESUME_MIME_TYPES.pdf];

  read(file: Buffer): Promise<ExtractedDocument> {
    return extractPdfText(file);
  }
}

/** Resumes are short; this bounds the work on unusual files. */
const MAX_PAGES = 30;
/** Text smaller than this (in points) can't be read on a page. */
const MIN_READABLE_FONT_SIZE = 2;
/** Text this transparent is invisible. */
const MIN_VISIBLE_ALPHA = 0.1;

/*
 * Fill colours. pdfjs turns every colour operator (gray, RGB, CMYK, colour
 * spaces) into setFillRGBColor with a hex string, so those cover white in any
 * colour space. What's left are fills that aren't a plain colour.
 */
/** `scn` without usable components: nothing is painted. */
const NO_FILL = 'none';
/** A pattern or shading: some colour we don't work out; treated as visible. */
const PATTERN_FILL = 'pattern';

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface GraphicsState {
  ctm: Matrix;
  fillColor: string;
  fillAlpha: number;
  renderMode: number;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
}

interface Glyph {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}

const PAINT_FILL_OPS = new Set<number>([
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

const PAINT_IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintSolidColorImageMask,
]);

/**
 * Reads the text of a PDF and separates text a reader can't see: invisible
 * render mode, no fill colour, near-transparent, tiny, off the page, or white
 * (in any colour space) without a dark shape or image drawn beneath it.
 * Throws when the file isn't a readable PDF.
 */
export async function extractPdfText(file: Buffer): Promise<ExtractedDocument> {
  // pdfjs 6 no longer evaluates font code, which closes CVE-2024-4367.
  const loading = getDocument({
    data: new Uint8Array(file),
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  try {
    const pdf = await loading.promise;
    const collector = new TextCollector();
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const [x0, y0, x1, y1] = page.view;
      const operators = await page.getOperatorList();
      readPage(operators.fnArray, operators.argsArray, collector, {
        minX: x0,
        minY: y0,
        maxX: x1,
        maxY: y1,
      });
      collector.newLine();
      page.cleanup();
    }
    return collector.result();
  } finally {
    await loading.destroy();
  }
}

function readPage(
  fnArray: number[],
  argsArray: unknown[],
  out: TextCollector,
  pageBox: Box,
): void {
  let state: GraphicsState = {
    ctm: [...IDENTITY],
    fillColor: '#000000',
    fillAlpha: 1,
    renderMode: 0,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
  };
  const stack: GraphicsState[] = [];
  // Areas painted with a non-light colour or an image; white text on them is visible.
  const backgrounds: Box[] = [];
  let textMatrix: Matrix = [...IDENTITY];
  let lineMatrix: Matrix = [...IDENTITY];
  let lastY: number | null = null;
  let lastEndX: number | null = null;

  const moveText = (tx: number, ty: number) => {
    lineMatrix = multiply([1, 0, 0, 1, tx, ty], lineMatrix);
    textMatrix = [...lineMatrix];
  };

  const showGlyphs = (items: unknown[]) => {
    const device = multiply(textMatrix, state.ctm);
    const scale = Math.sqrt(
      Math.abs(device[0] * device[3] - device[1] * device[2]),
    );
    const size = state.fontSize * scale;
    const [x, y] = [device[4], device[5]];

    if (lastY !== null && Math.abs(y - lastY) > Math.max(size, 1) * 0.5) {
      out.newLine();
      lastEndX = null;
    } else if (lastEndX !== null && x - lastEndX > Math.max(size, 1) * 0.2) {
      out.space();
    }
    const hidden = isHidden(state, size, x, y, pageBox, backgrounds);

    let advance = 0;
    for (const item of items) {
      if (typeof item === 'number') {
        // Kerning in thousandths of an em; a large gap separates words.
        if (item < -250) {
          out.add(' ', hidden);
        }
        advance -= (item / 1000) * state.fontSize * state.hScale;
        continue;
      }
      const glyph = item as Glyph | null;
      if (!glyph) {
        continue;
      }
      out.add(glyph.unicode ?? '', hidden);
      advance +=
        ((glyph.width ?? 0) / 1000) * state.fontSize * state.hScale +
        state.charSpacing +
        (glyph.isSpace ? state.wordSpacing : 0);
    }
    textMatrix = multiply([1, 0, 0, 1, advance, 0], textMatrix);
    lastY = y;
    lastEndX = multiply(textMatrix, state.ctm)[4];
  };

  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ...state, ctm: [...state.ctm] });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state.ctm = multiply(args as Matrix, state.ctm);
        break;
      case OPS.setFillRGBColor:
        state.fillColor = typeof args[0] === 'string' ? args[0] : '#000000';
        break;
      case OPS.setFillTransparent:
        state.fillColor = NO_FILL;
        break;
      case OPS.setFillColorN:
        state.fillColor = PATTERN_FILL;
        break;
      case OPS.setGState:
        for (const [key, value] of (args[0] ?? []) as [string, unknown][]) {
          if (key === 'ca' && typeof value === 'number') {
            state.fillAlpha = value;
          }
        }
        break;
      case OPS.setTextRenderingMode:
        state.renderMode = Number(args[0]);
        break;
      case OPS.setFont:
        state.fontSize = Math.abs(Number(args[1]) || 0);
        break;
      case OPS.setCharSpacing:
        state.charSpacing = Number(args[0]) || 0;
        break;
      case OPS.setWordSpacing:
        state.wordSpacing = Number(args[0]) || 0;
        break;
      case OPS.setHScale:
        state.hScale = (Number(args[0]) || 100) / 100;
        break;
      case OPS.setLeading:
        state.leading = Number(args[0]) || 0;
        break;
      case OPS.beginText:
        textMatrix = [...IDENTITY];
        lineMatrix = [...IDENTITY];
        break;
      case OPS.setTextMatrix:
        textMatrix = [...((args[0] ?? args) as Matrix)];
        lineMatrix = [...textMatrix];
        break;
      case OPS.moveText:
        moveText(Number(args[0]), Number(args[1]));
        break;
      case OPS.setLeadingMoveText:
        state.leading = -Number(args[1]);
        moveText(Number(args[0]), Number(args[1]));
        break;
      case OPS.nextLine:
        moveText(0, -state.leading);
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        showGlyphs((args[0] ?? []) as unknown[]);
        break;
      case OPS.nextLineShowText:
        moveText(0, -state.leading);
        showGlyphs((args[0] ?? []) as unknown[]);
        break;
      case OPS.nextLineSetSpacingShowText:
        state.wordSpacing = Number(args[0]) || 0;
        state.charSpacing = Number(args[1]) || 0;
        moveText(0, -state.leading);
        showGlyphs((args[2] ?? []) as unknown[]);
        break;
      case OPS.constructPath: {
        const [paintOp, , minMax] = args as [number, unknown, number[] | null];
        if (
          PAINT_FILL_OPS.has(paintOp) &&
          minMax &&
          state.fillColor !== NO_FILL &&
          !isLight(state.fillColor) &&
          state.fillAlpha >= MIN_VISIBLE_ALPHA
        ) {
          backgrounds.push(transformBox(minMax, state.ctm));
        }
        break;
      }
      default:
        if (PAINT_IMAGE_OPS.has(fn)) {
          // Images are drawn into the unit square of the current transform.
          backgrounds.push(transformBox([0, 0, 1, 1], state.ctm));
        }
    }
  }
}

function isHidden(
  state: GraphicsState,
  size: number,
  x: number,
  y: number,
  page: Box,
  backgrounds: Box[],
): boolean {
  // 3 = invisible, 7 = clip only.
  if (state.renderMode === 3 || state.renderMode === 7) {
    return true;
  }
  if (state.fillAlpha < MIN_VISIBLE_ALPHA || state.fillColor === NO_FILL) {
    return true;
  }
  if (size > 0 && size < MIN_READABLE_FONT_SIZE) {
    return true;
  }
  const margin = 2;
  if (
    x < page.minX - margin ||
    x > page.maxX + margin ||
    y < page.minY - margin ||
    y > page.maxY + margin
  ) {
    return true;
  }
  if (isLight(state.fillColor)) {
    const probeY = y + size * 0.3;
    return !backgrounds.some(
      (box) =>
        x >= box.minX - margin &&
        x <= box.maxX + margin &&
        probeY >= box.minY - margin &&
        probeY <= box.maxY + margin,
    );
  }
  return false;
}

/** White or almost white; false for fills that aren't a plain colour. */
function isLight(hex: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    return false;
  }
  return match.slice(1).every((part) => parseInt(part, 16) >= 0xf0);
}

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function transformBox(minMax: number[], m: Matrix): Box {
  const [minX, minY, maxX, maxY] = minMax;
  const corners = [
    [minX, minY],
    [minX, maxY],
    [maxX, minY],
    [maxX, maxY],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
