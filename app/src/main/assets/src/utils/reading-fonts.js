/* ═══════════════════════════════════════════════════════════════════════
   reading-fonts — the Reading Font registry (all fonts ship in the app)
   ═══════════════════════════════════════════════════════════════════════
   Bundled into dist/bundle-b.js (use-settings applies the persisted font
   at boot; the Settings picker in bundle-d reads these via window globals).

   THE DESIGN (2026-07-31; same-day owner revision "acceptable bloat, put
   in app by default, all predownloaded"):
   - settings.fontStyle holds any READING_FONTS id. "classic" and "modern"
     keep their historical meanings (system serif / EB Garamond) so every
     persisted or backup-imported value stays valid.
   - EVERY font is vendored locally under fonts/reading/ (~1.7 MB total,
     fetched once at dev time by tools/gen-reading-fonts.mjs — regenerate,
     never hand-edit) and declared as plain @font-face in app.css.
     Browsers fetch an @font-face file only when its family is actually
     used, so unchosen fonts cost nothing at runtime; the service worker
     serves fonts/reading/ from the STABLE corpus cache so every choice
     works offline. No CDN, no download step, no Cache Storage loader —
     the earlier download-on-demand design (vot-fonts-v1 bucket,
     ensureReadingFont) is retired; the SW deletes the old bucket.
   - The chosen font lands in the --font-body CSS var on <html>; app.css
     routes every body-text font-family through it. Cinzel chrome stays
     Cinzel for every choice except "classic" (which disables the whole
     #custom-fonts block — the pre-2026-07-31 all-system look).
   - LIST ORDER IS THE PICKER ORDER (owner call): scripture-and-classic
     book faces first, contemporary reading serifs next, display/antique
     voices after, the two readability sans last.

   `faces` names the local woff2 files — reading-fonts.test.js gates
   registry ↔ fonts/reading/ ↔ app.css @font-face sync.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {{ id: string, label: string, family: string | null,
 *             css: string | null, sub: string, faces: string[] }} ReadingFontDef
 */

/** @type {ReadingFontDef[]} */
export const READING_FONTS = [
  // Built-ins.
  { id: 'classic', label: 'System Serif', family: null, css: null, sub: 'Your device’s own serif — the original look', faces: [] },
  { id: 'modern', label: 'EB Garamond', family: 'EB Garamond', css: "'EB Garamond', serif", sub: 'The app’s classic garamond', faces: [] },
  // Scripture & classic book faces.
  { id: 'cormorant-garamond', label: 'Cormorant Garamond', family: 'Cormorant Garamond', css: "'Cormorant Garamond', serif", sub: 'Refined garamond, light and graceful', faces: ['cormorant-garamond-latin-400-normal.woff2', 'cormorant-garamond-latin-700-normal.woff2', 'cormorant-garamond-latin-400-italic.woff2'] },
  { id: 'cardo', label: 'Cardo', family: 'Cardo', css: "'Cardo', serif", sub: 'Scholarly face favored for scripture', faces: ['cardo-latin-400-normal.woff2', 'cardo-latin-700-normal.woff2', 'cardo-latin-400-italic.woff2'] },
  { id: 'gentium-book-plus', label: 'Gentium Book Plus', family: 'Gentium Book Plus', css: "'Gentium Book Plus', serif", sub: 'Bible-translation staple', faces: ['gentium-book-plus-latin-400-normal.woff2', 'gentium-book-plus-latin-700-normal.woff2', 'gentium-book-plus-latin-400-italic.woff2', 'gentium-book-plus-latin-700-italic.woff2'] },
  { id: 'rosarivo', label: 'Rosarivo', family: 'Rosarivo', css: "'Rosarivo', serif", sub: 'Made for scripture typesetting', faces: ['rosarivo-latin-400-normal.woff2', 'rosarivo-latin-400-italic.woff2'] },
  { id: 'crimson-pro', label: 'Crimson Pro', family: 'Crimson Pro', css: "'Crimson Pro', serif", sub: 'Old-style book face', faces: ['crimson-pro-latin-wght-normal.woff2', 'crimson-pro-latin-wght-italic.woff2'] },
  { id: 'sorts-mill-goudy', label: 'Sorts Mill Goudy', family: 'Sorts Mill Goudy', css: "'Sorts Mill Goudy', serif", sub: 'Old-style Goudy revival', faces: ['sorts-mill-goudy-latin-400-normal.woff2', 'sorts-mill-goudy-latin-400-italic.woff2'] },
  { id: 'old-standard-tt', label: 'Old Standard TT', family: 'Old Standard TT', css: "'Old Standard TT', serif", sub: 'Classical scholarship look', faces: ['old-standard-tt-latin-400-normal.woff2', 'old-standard-tt-latin-700-normal.woff2', 'old-standard-tt-latin-400-italic.woff2'] },
  { id: 'im-fell-english', label: 'IM Fell English', family: 'IM Fell English', css: "'IM Fell English', serif", sub: 'Antique English bible print', faces: ['im-fell-english-latin-400-normal.woff2', 'im-fell-english-latin-400-italic.woff2'] },
  { id: 'libre-baskerville', label: 'Libre Baskerville', family: 'Libre Baskerville', css: "'Libre Baskerville', serif", sub: 'Classic Baskerville, tuned for screens', faces: ['libre-baskerville-latin-400-normal.woff2', 'libre-baskerville-latin-700-normal.woff2', 'libre-baskerville-latin-400-italic.woff2'] },
  // Contemporary reading serifs.
  { id: 'lora', label: 'Lora', family: 'Lora', css: "'Lora', serif", sub: 'Calm contemporary serif', faces: ['lora-latin-wght-normal.woff2', 'lora-latin-wght-italic.woff2'] },
  { id: 'literata', label: 'Literata', family: 'Literata', css: "'Literata', serif", sub: 'Made for long e-book reading', faces: ['literata-latin-wght-normal.woff2', 'literata-latin-wght-italic.woff2'] },
  { id: 'merriweather', label: 'Merriweather', family: 'Merriweather', css: "'Merriweather', serif", sub: 'Sturdy screen serif', faces: ['merriweather-latin-400-normal.woff2', 'merriweather-latin-700-normal.woff2', 'merriweather-latin-400-italic.woff2'] },
  { id: 'gelasio', label: 'Gelasio', family: 'Gelasio', css: "'Gelasio', serif", sub: 'Familiar Georgia feel', faces: ['gelasio-latin-400-normal.woff2', 'gelasio-latin-700-normal.woff2', 'gelasio-latin-400-italic.woff2', 'gelasio-latin-700-italic.woff2'] },
  { id: 'source-serif-4', label: 'Source Serif 4', family: 'Source Serif 4', css: "'Source Serif 4', serif", sub: 'Clear modern text serif', faces: ['source-serif-4-latin-wght-normal.woff2', 'source-serif-4-latin-wght-italic.woff2'] },
  { id: 'noto-serif', label: 'Noto Serif', family: 'Noto Serif', css: "'Noto Serif', serif", sub: 'Balanced, familiar serif', faces: ['noto-serif-latin-wght-normal.woff2', 'noto-serif-latin-wght-italic.woff2'] },
  { id: 'spectral', label: 'Spectral', family: 'Spectral', css: "'Spectral', serif", sub: 'Airy, elegant text face', faces: ['spectral-latin-400-normal.woff2', 'spectral-latin-600-normal.woff2', 'spectral-latin-400-italic.woff2'] },
  { id: 'vollkorn', label: 'Vollkorn', family: 'Vollkorn', css: "'Vollkorn', serif", sub: 'Warm bread-and-butter serif', faces: ['vollkorn-latin-wght-normal.woff2', 'vollkorn-latin-wght-italic.woff2'] },
  { id: 'alegreya', label: 'Alegreya', family: 'Alegreya', css: "'Alegreya', serif", sub: 'Lively literary rhythm', faces: ['alegreya-latin-wght-normal.woff2', 'alegreya-latin-wght-italic.woff2'] },
  { id: 'bitter', label: 'Bitter', family: 'Bitter', css: "'Bitter', serif", sub: 'Slab serif, high clarity', faces: ['bitter-latin-wght-normal.woff2', 'bitter-latin-wght-italic.woff2'] },
  { id: 'neuton', label: 'Neuton', family: 'Neuton', css: "'Neuton', serif", sub: 'Compact, warm, unhurried', faces: ['neuton-latin-400-normal.woff2', 'neuton-latin-700-normal.woff2', 'neuton-latin-400-italic.woff2'] },
  // Display / antique voice.
  { id: 'playfair-display', label: 'Playfair Display', family: 'Playfair Display', css: "'Playfair Display', serif", sub: 'Ornate high-contrast display', faces: ['playfair-display-latin-wght-normal.woff2', 'playfair-display-latin-wght-italic.woff2'] },
  // Readability sans.
  { id: 'atkinson-hyperlegible', label: 'Atkinson Hyperlegible', family: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', sans-serif", sub: 'Sans built for low vision', faces: ['atkinson-hyperlegible-latin-400-normal.woff2', 'atkinson-hyperlegible-latin-700-normal.woff2', 'atkinson-hyperlegible-latin-400-italic.woff2', 'atkinson-hyperlegible-latin-700-italic.woff2'] },
  { id: 'lexend', label: 'Lexend', family: 'Lexend', css: "'Lexend', sans-serif", sub: 'Sans tuned for reading ease', faces: ['lexend-latin-wght-normal.woff2'] },
];

/** @param {string | null | undefined} id @returns {ReadingFontDef | undefined} */
export function readingFontById(id) {
  return READING_FONTS.find((f) => f.id === id);
}

/**
 * The --font-body value for a fontStyle id. Unknown ids (e.g. a backup
 * from a newer app version) fall back to the default stack — which is
 * also correct for "classic": the #custom-fonts block is disabled there,
 * so 'EB Garamond' resolves to the system serif exactly as before.
 * @param {string | null | undefined} id
 */
export function readingFontCss(id) {
  const def = readingFontById(id);
  return (def && def.css) || "'EB Garamond', serif";
}
