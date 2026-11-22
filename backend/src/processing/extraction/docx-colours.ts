/*
 * Colours in WordprocessingML: a plain hex value, "auto", or a theme colour
 * (w:themeColor="background1") that Word draws instead of the plain value,
 * lightened or darkened by w:themeTint / w:themeShade.
 */

/** Theme colour slots (dk1, lt1, accent1, …) to 6-digit hex. */
export type ThemeColours = ReadonlyMap<string, string>;

/** Office's default theme, for documents that don't carry one. */
const DEFAULT_THEME: Record<string, string> = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '44546A',
  lt2: 'E7E6E6',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
};

/**
 * Theme colour names used in w:themeColor and w:themeFill, mapped to theme
 * slots the way Word does by default (text1 is dark 1, background1 light 1).
 * Documents can remap them in settings.xml (w:clrSchemeMapping); that is rare
 * and not followed here.
 */
const THEME_SLOTS: Record<string, string> = {
  dark1: 'dk1',
  light1: 'lt1',
  dark2: 'dk2',
  light2: 'lt2',
  text1: 'dk1',
  background1: 'lt1',
  text2: 'dk2',
  background2: 'lt2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hyperlink: 'hlink',
  followedHyperlink: 'folHlink',
};

const HEX = /^[0-9a-f]{6}$/i;

/** The colour scheme of a theme part (word/theme/theme1.xml). */
export function readThemeColours(xml: string | null): ThemeColours {
  const colours = new Map(Object.entries(DEFAULT_THEME));
  const scheme = xml && /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0];
  if (!scheme) {
    return colours;
  }
  const slot =
    /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>\s*<a:(?:srgbClr\b[^>]*?\bval|sysClr\b[^>]*?\blastClr)=["']([0-9a-f]{6})["']/gi;
  for (const [, name, hex] of scheme.matchAll(slot)) {
    colours.set(name, hex.toUpperCase());
  }
  return colours;
}

export interface ColourAttributes {
  /** A hex value or "auto" (w:val, or w:fill for shading). */
  value?: string;
  /** w:themeColor or w:themeFill. */
  theme?: string;
  /** Hex byte: lower is lighter. */
  tint?: string;
  /** Hex byte: lower is darker. */
  shade?: string;
}

/**
 * The colour Word draws: a 6-digit hex, "auto", or null when unset or
 * unreadable. A theme colour wins over the plain value.
 */
export function resolveColour(
  attributes: ColourAttributes,
  theme: ThemeColours,
): string | null {
  const slot = attributes.theme && THEME_SLOTS[attributes.theme];
  const base = slot ? theme.get(slot) : attributes.value;
  if (!base) {
    return null;
  }
  if (!HEX.test(base)) {
    return base.toLowerCase() === 'auto' ? 'auto' : null;
  }
  if (!slot) {
    return base.toUpperCase();
  }
  // Word blends in HSL; blending each channel is close enough to tell
  // white from not white.
  const tint = byteFraction(attributes.tint);
  const shade = byteFraction(attributes.shade);
  const channels = [0, 2, 4].map((i) => {
    let channel = parseInt(base.slice(i, i + 2), 16);
    if (tint !== null) {
      channel = channel * tint + 255 * (1 - tint);
    }
    if (shade !== null) {
      channel *= shade;
    }
    return Math.round(channel);
  });
  return channels
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** White or almost white. Highlight colours are names, e.g. "white". */
export function isWhite(colour: string | null | undefined): boolean {
  if (!colour) {
    return false;
  }
  if (!HEX.test(colour)) {
    return colour.toLowerCase() === 'white';
  }
  return [0, 2, 4].every((i) => parseInt(colour.slice(i, i + 2), 16) >= 0xf0);
}

/** A fill that isn't empty, automatic or white, so white text on it shows. */
export function isBackgroundColour(colour: string | null | undefined): boolean {
  if (!colour) {
    return false;
  }
  const value = colour.toLowerCase();
  if (value === 'auto' || value === 'none' || value === 'clear') {
    return false;
  }
  return !isWhite(value);
}

function byteFraction(value: string | undefined): number | null {
  return value && /^[0-9a-f]{2}$/i.test(value)
    ? parseInt(value, 16) / 255
    : null;
}
