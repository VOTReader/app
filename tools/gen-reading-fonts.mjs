#!/usr/bin/env node
/* gen-reading-fonts — vendor the Reading Font files into the app.
 * ═══════════════════════════════════════════════════════════════════════
 * 2026-07-31 (owner call): all reading fonts ship IN the app ("acceptable
 * bloat"), predownloaded — no CDN, no download-on-demand. This replaces
 * gen-font-previews.mjs (the ~45 KB name-glyph preview subsets + the
 * vot-fonts-v1 Cache Storage loader are retired; fonts/previews/ deleted).
 *
 * WHAT IT DOES (needs network — dev-time only, outputs are committed):
 *   1. Fetch every font's latin WOFF2(s) from the fontsource CDN.
 *   2. Write them to app/src/main/assets/fonts/reading/<id>-<file>.woff2.
 *   3. Print the three paste-ready blocks that must stay in sync:
 *      the app.css @font-face block, the READING_FONTS faces arrays
 *      (src/utils/reading-fonts.js), and the service-worker precache list.
 *      reading-fonts.test.js gates registry ↔ disk ↔ app.css sync.
 *
 * Run: node tools/gen-reading-fonts.mjs
 * NEVER hand-edit the emitted woff2s — regenerate.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'app', 'src', 'main', 'assets', 'fonts', 'reading');

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/';
const vf = (id) => [
  { remote: `${id}:vf@latest/latin-wght-normal.woff2`, file: `${id}-latin-wght-normal.woff2`, weight: '100 900', style: 'normal' },
  { remote: `${id}:vf@latest/latin-wght-italic.woff2`, file: `${id}-latin-wght-italic.woff2`, weight: '100 900', style: 'italic' },
];
const vfNoItalic = (id) => [vf(id)[0]];
const st = (id, specs) => specs.map(([w, s]) => ({
  remote: `${id}@latest/latin-${w}-${s}.woff2`, file: `${id}-latin-${w}-${s}.woff2`, weight: String(w), style: s,
}));

/* Keep ids + families in sync with READING_FONTS (src/utils/reading-fonts.js). */
const FONTS = [
  { id: 'cormorant-garamond', family: 'Cormorant Garamond', faces: st('cormorant-garamond', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'cardo', family: 'Cardo', faces: st('cardo', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'gentium-book-plus', family: 'Gentium Book Plus', faces: st('gentium-book-plus', [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) },
  { id: 'rosarivo', family: 'Rosarivo', faces: st('rosarivo', [[400, 'normal'], [400, 'italic']]) },
  { id: 'crimson-pro', family: 'Crimson Pro', faces: vf('crimson-pro') },
  { id: 'sorts-mill-goudy', family: 'Sorts Mill Goudy', faces: st('sorts-mill-goudy', [[400, 'normal'], [400, 'italic']]) },
  { id: 'old-standard-tt', family: 'Old Standard TT', faces: st('old-standard-tt', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'im-fell-english', family: 'IM Fell English', faces: st('im-fell-english', [[400, 'normal'], [400, 'italic']]) },
  { id: 'libre-baskerville', family: 'Libre Baskerville', faces: st('libre-baskerville', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'lora', family: 'Lora', faces: vf('lora') },
  { id: 'literata', family: 'Literata', faces: vf('literata') },
  { id: 'merriweather', family: 'Merriweather', faces: st('merriweather', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'gelasio', family: 'Gelasio', faces: st('gelasio', [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) },
  { id: 'source-serif-4', family: 'Source Serif 4', faces: vf('source-serif-4') },
  { id: 'noto-serif', family: 'Noto Serif', faces: vf('noto-serif') },
  { id: 'spectral', family: 'Spectral', faces: st('spectral', [[400, 'normal'], [600, 'normal'], [400, 'italic']]) },
  { id: 'vollkorn', family: 'Vollkorn', faces: vf('vollkorn') },
  { id: 'alegreya', family: 'Alegreya', faces: vf('alegreya') },
  { id: 'bitter', family: 'Bitter', faces: vf('bitter') },
  { id: 'neuton', family: 'Neuton', faces: st('neuton', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'playfair-display', family: 'Playfair Display', faces: vf('playfair-display') },
  { id: 'atkinson-hyperlegible', family: 'Atkinson Hyperlegible', faces: st('atkinson-hyperlegible', [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) },
  { id: 'lexend', family: 'Lexend', faces: vfNoItalic('lexend') },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = [];
  let total = 0;
  for (const font of FONTS) {
    let bytes = 0;
    for (const face of font.faces) {
      const res = await fetch(CDN + face.remote, { redirect: 'follow' });
      if (!res.ok) throw new Error(`${res.status} ${face.remote}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(OUT_DIR, face.file), buf);
      face.bytes = buf.length;
      bytes += buf.length;
    }
    total += bytes;
    report.push({ id: font.id, kb: Math.round(bytes / 1024), files: font.faces.length });
    console.log(`${font.id}: ${Math.round(bytes / 1024)} KB (${font.faces.length} files)`);
  }
  console.log(`\nTOTAL: ${(total / 1024 / 1024).toFixed(2)} MB, ${FONTS.reduce((s, f) => s + f.faces.length, 0)} files\n`);

  console.log('── app.css @font-face block ──');
  for (const f of FONTS) {
    for (const face of f.faces) {
      console.log(`      @font-face { font-family: '${f.family}'; font-weight: ${face.weight}; font-style: ${face.style}; src: url('../fonts/reading/${face.file}') format('woff2'); font-display: swap; }`);
    }
  }
  console.log('\n── READING_FONTS faces ──');
  for (const f of FONTS) {
    console.log(`  ${f.id}: [${f.faces.map((x) => `'${x.file}'`).join(', ')}],`);
  }
  console.log('\n── service-worker precache ──');
  for (const f of FONTS) {
    for (const face of f.faces) console.log(`  './fonts/reading/${face.file}',`);
  }
  writeFileSync(join(ROOT, 'tools', '_reading-fonts-report.json'), JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
