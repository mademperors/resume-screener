import JSZip from 'jszip';
import {
  PDFDocument,
  pushGraphicsState,
  popGraphicsState,
  rgb,
  setTextRenderingMode,
  StandardFonts,
  TextRenderingMode,
} from 'pdf-lib';

/** Real PDF and DOCX files for tests, with visible and hidden text. */

export interface PdfLine {
  text: string;
  /** 0..1 RGB; default black. */
  color?: [number, number, number];
  size?: number;
  opacity?: number;
  /** Draw with the invisible text render mode. */
  invisible?: boolean;
  x?: number;
}

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number];
}

/**
 * One page; lines go top-down 18pt apart from y=760. Boxes are drawn first,
 * so lines can be placed on them (line i sits at y = 760 - 18 * i).
 */
export async function makePdf(
  lines: PdfLine[],
  boxes: PdfBox[] = [],
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  for (const box of boxes) {
    page.drawRectangle({ ...box, color: rgb(...box.color) });
  }
  lines.forEach((line, index) => {
    const y = 760 - 18 * index;
    if (line.invisible) {
      page.pushOperators(
        pushGraphicsState(),
        setTextRenderingMode(TextRenderingMode.Invisible),
      );
    }
    page.drawText(line.text, {
      x: line.x ?? 50,
      y,
      size: line.size ?? 11,
      font,
      color: rgb(...(line.color ?? [0, 0, 0])),
      opacity: line.opacity,
    });
    if (line.invisible) {
      page.pushOperators(popGraphicsState());
    }
  });
  return Buffer.from(await doc.save());
}

/** A PDF with no text at all, like a scan. */
export async function makeEmptyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({
    x: 50,
    y: 50,
    width: 400,
    height: 600,
    color: rgb(0.8, 0.8, 0.8),
  });
  return Buffer.from(await doc.save());
}

export interface DocxRun {
  text: string;
  vanish?: boolean;
  /** Hex without #, e.g. FFFFFF. */
  color?: string;
  /** Half-points. */
  size?: number;
  shading?: string;
}

export type DocxParagraph =
  DocxRun[] | { cells: DocxRun[][]; cellShading?: string };

export async function makeDocx(
  body: DocxParagraph[],
  options: { header?: DocxRun[] } = {},
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const paragraphs = body
    .map((item) =>
      Array.isArray(item)
        ? paragraphXml(item)
        : `<w:tbl><w:tr>${item.cells
            .map(
              (cell) =>
                `<w:tc><w:tcPr>${item.cellShading ? `<w:shd w:val="clear" w:color="auto" w:fill="${item.cellShading}"/>` : ''}</w:tcPr>${paragraphXml(cell)}</w:tc>`,
            )
            .join('')}</w:tr></w:tbl>`,
    )
    .join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${paragraphs}</w:body></w:document>`,
  );
  if (options.header) {
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${ns}>${paragraphXml(options.header)}</w:hdr>`,
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function paragraphXml(runs: DocxRun[]): string {
  return `<w:p><w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>${runs.map(runXml).join('')}</w:p>`;
}

function runXml(run: DocxRun): string {
  const props = [
    run.vanish ? '<w:vanish/>' : '',
    run.color ? `<w:color w:val="${run.color}"/>` : '',
    run.size ? `<w:sz w:val="${run.size}"/>` : '',
    run.shading
      ? `<w:shd w:val="clear" w:color="auto" w:fill="${run.shading}"/>`
      : '',
  ].join('');
  const text = run.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}
