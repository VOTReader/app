/* reading-font.js - the reading font in v2 (mw11, design dz16 7g: Settings > Text and theme's Reading font row; main's
   25-font list opens from it). The fonts and their order are main's (utils/reading-fonts.js READING_FONTS, every one shipped
   under fonts/reading/, declared for v2 in reading-fonts.css); the choice is main's own setting (settings.fontStyle), so
   main and v2 read one value. v2's default stays EB Garamond: main saves fontStyle 'classic' (System Serif) for every
   profile as its default, so 'classic' counts as a choice only when the reader made it (main's settings.touched); any
   other saved font was chosen and is honoured. Shown as --font-read on <html> (the reading text and the page's preview). */
import { READING_FONTS, readingFontById } from '../utils/reading-fonts.js';

/** v2's own reading font (the kit's face). */
export const DEFAULT_FONT = 'modern';

/** The font a profile reads in: its chosen one, else EB Garamond. @param {Record<string, any> | null | undefined} settings */
export function readingFontOf(settings) {
  const s = settings || {};
  const id = typeof s.fontStyle === 'string' ? s.fontStyle : '';
  if (!id || !readingFontById(id)) return DEFAULT_FONT;
  if (id === 'classic' && !(s.touched && s.touched.fontStyle)) return DEFAULT_FONT;
  return id;
}

/** The font-family for font `id` (System Serif: the device's own serif). @param {string} id */
export function fontCss(id) {
  const def = readingFontById(id);
  if (id === 'classic') return 'serif';
  return (def && def.css) || "'EB Garamond', serif";
}

/** What the Reading font row says under its name: "EB Garamond · the app's own", else the font's name. @param {string} id */
export function fontRowWords(id) {
  const def = readingFontById(id) || readingFontById(DEFAULT_FONT);
  return id === DEFAULT_FONT ? 'EB Garamond · the app’s own' : def ? def.label : '';
}

/** main's list, in main's order (the owner's picker order), each name drawn in its own face. */
export function fontRows() {
  return READING_FONTS.map((f) => ({ id: f.id, label: f.label, sub: f.id === DEFAULT_FONT ? 'The app’s own' : f.sub, css: fontCss(f.id) }));
}

/** Shows font `id` on <html>: --font-read, left unset for v2's own face. @param {string} id @param {Document} [doc] */
export function applyReadingFont(id, doc = document) {
  const html = doc.documentElement;
  if (!id || id === DEFAULT_FONT) html.style.removeProperty('--font-read');
  else html.style.setProperty('--font-read', fontCss(id));
}
