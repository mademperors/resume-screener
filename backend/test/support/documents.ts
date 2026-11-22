import JSZip from 'jszip';
import {
  cmyk,
  grayscale,
  PDFDocument,
  pushGraphicsState,
  popGraphicsState,
  rgb,
  setTextRenderingMode,
  StandardFonts,
  TextRenderingMode,
  type Color,
} from 'pdf-lib';

/** Real PDF and DOCX files for tests, with visible and hidden text. */

/** 0..1 RGB, or a gray level, or CMYK: PDFs write white in any of them. */
export type PdfColor =
  | [number, number, number]
  | { gray: number }
  | { cmyk: [number, number, number, number] };

export interface PdfLine {
  text: string;
  /** Default black. */
  color?: PdfColor;
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
      color: pdfColor(line.color ?? [0, 0, 0]),
      opacity: line.opacity,
    });
    if (line.invisible) {
      page.pushOperators(popGraphicsState());
    }
  });
  return Buffer.from(await doc.save());
}

function pdfColor(color: PdfColor): Color {
  if (Array.isArray(color)) {
    return rgb(...color);
  }
  return 'gray' in color ? grayscale(color.gray) : cmyk(...color.cmyk);
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
  /** Hex without #, e.g. FFFFFF, or "auto". */
  color?: string;
  /** A theme colour, e.g. background1; Word draws it instead of `color`. */
  themeColor?: string;
  /** Hex byte, e.g. BF: darkens the theme colour. */
  themeShade?: string;
  /** Hex byte, e.g. 33: lightens the theme colour. */
  themeTint?: string;
  /** Half-points. */
  size?: number;
  shading?: string;
}

export type DocxParagraph =
  | DocxRun[]
  | { cells: DocxRun[][]; cellShading?: string }
  /** A modern text box, with the legacy copy Word keeps for old versions. */
  | { textBox: DocxRun[] };

export interface DocxOptions {
  /** Shown on every page. */
  header?: DocxRun[];
  /** Shown on the first page only if `titlePage` is set. */
  firstPageHeader?: DocxRun[];
  titlePage?: boolean;
  footer?: DocxRun[];
  footnote?: DocxRun[];
  /** A reviewer's comment on the first paragraph. */
  comment?: string;
  /** Theme colour for "light 1" (background1); without it, no theme part. */
  themeLight1?: string;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NAMESPACES = [
  `xmlns:w="${W}"`,
  `xmlns:r="${R}"`,
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
].join(' ');
const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export async function makeDocx(
  body: DocxParagraph[],
  options: DocxOptions = {},
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `${XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const relationships: string[] = [];
  const sectionReferences: string[] = [];
  const addPart = (type: string, name: string, xml: string) => {
    const id = `rId${relationships.length + 1}`;
    relationships.push(
      `<Relationship Id="${id}" Type="${R}/${type}" Target="${name}"/>`,
    );
    zip.file(`word/${name}`, `${XML_DECLARATION}${xml}`);
    return id;
  };
  if (options.header) {
    const id = addPart(
      'header',
      'header1.xml',
      `<w:hdr ${NAMESPACES}>${paragraphXml(options.header)}</w:hdr>`,
    );
    sectionReferences.push(
      `<w:headerReference w:type="default" r:id="${id}"/>`,
    );
  }
  if (options.firstPageHeader) {
    const id = addPart(
      'header',
      'header2.xml',
      `<w:hdr ${NAMESPACES}>${paragraphXml(options.firstPageHeader)}</w:hdr>`,
    );
    sectionReferences.push(`<w:headerReference w:type="first" r:id="${id}"/>`);
  }
  if (options.footer) {
    const id = addPart(
      'footer',
      'footer1.xml',
      `<w:ftr ${NAMESPACES}>${paragraphXml(options.footer)}</w:ftr>`,
    );
    sectionReferences.push(
      `<w:footerReference w:type="default" r:id="${id}"/>`,
    );
  }
  if (options.footnote) {
    addPart(
      'footnotes',
      'footnotes.xml',
      `<w:footnotes ${NAMESPACES}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1">${paragraphXml(options.footnote)}</w:footnote></w:footnotes>`,
    );
  }
  if (options.comment) {
    addPart(
      'comments',
      'comments.xml',
      `<w:comments ${NAMESPACES}><w:comment w:id="0" w:author="Reviewer">${paragraphXml([{ text: options.comment }])}</w:comment></w:comments>`,
    );
  }
  if (options.themeLight1) {
    addPart(
      'theme',
      'theme/theme1.xml',
      `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:srgbClr val="${options.themeLight1}"/></a:lt1></a:clrScheme></a:themeElements></a:theme>`,
    );
  }

  const paragraphs = body
    .map((item, index) => {
      if (Array.isArray(item)) {
        return options.comment && index === 0
          ? paragraphXml(item, { commented: true })
          : paragraphXml(item);
      }
      if ('textBox' in item) {
        return textBoxXml(item.textBox);
      }
      return `<w:tbl><w:tr>${item.cells
        .map(
          (cell) =>
            `<w:tc><w:tcPr>${item.cellShading ? `<w:shd w:val="clear" w:color="auto" w:fill="${item.cellShading}"/>` : ''}</w:tcPr>${paragraphXml(cell)}</w:tc>`,
        )
        .join('')}</w:tr></w:tbl>`;
    })
    .join('');
  const section = `<w:sectPr>${sectionReferences.join('')}${options.titlePage ? '<w:titlePg/>' : ''}<w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`;
  zip.file(
    'word/document.xml',
    `${XML_DECLARATION}<w:document ${NAMESPACES}><w:body>${paragraphs}${section}</w:body></w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function paragraphXml(
  runs: DocxRun[],
  options: { commented?: boolean } = {},
): string {
  const content = runs.map(runXml).join('');
  const body = options.commented
    ? `<w:commentRangeStart w:id="0"/>${content}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>`
    : content;
  return `<w:p><w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>${body}</w:p>`;
}

function textBoxXml(runs: DocxRun[]): string {
  const content = `<w:txbxContent>${paragraphXml(runs)}</w:txbxContent>`;
  return `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx>${content}</wps:txbx></wps:wsp></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox>${content}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
}

function runXml(run: DocxRun): string {
  const colorAttributes = [
    run.color ? `w:val="${run.color}"` : '',
    run.themeColor ? `w:themeColor="${run.themeColor}"` : '',
    run.themeShade ? `w:themeShade="${run.themeShade}"` : '',
    run.themeTint ? `w:themeTint="${run.themeTint}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const props = [
    run.vanish ? '<w:vanish/>' : '',
    colorAttributes ? `<w:color ${colorAttributes}/>` : '',
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
