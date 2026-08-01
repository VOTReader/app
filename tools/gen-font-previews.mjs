#!/usr/bin/env node
/* gen-font-previews — build the tiny name-glyph preview fonts for the
 * Settings → Reading Font picker, and report the pinned CDN URLs + sizes
 * that src/utils/reading-fonts.js declares.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY: the picker shows every font's NAME rendered in that font BEFORE the
 * user downloads it. Shipping 15 full fonts would add ~3 MB to the APK and
 * the PWA precache, so instead each font ships as a ~2–4 KB WOFF2 subset
 * containing ONLY the glyphs of its display name. The full font downloads
 * on selection (Cache Storage bucket 'vot-fonts-v1') — see
 * src/utils/reading-fonts.js.
 *
 * WHAT IT DOES (needs network — dev-time only, outputs are committed):
 *   1. For each candidate font: fetch its full WOFF2(s) from the fontsource
 *      CDN (@latest), following redirects.
 *   2. Record the RESOLVED (version-pinned) URL + byte size of every file —
 *      reading-fonts.js pins these so the runtime cache key never drifts.
 *   3. Subset the regular face down to the font's display-name glyphs and
 *      write app/src/main/assets/fonts/previews/<id>.woff2.
 *   4. Subset the local EB Garamond the same way (id "modern").
 *   5. Print a paste-ready report (pinned URLs, per-font KB totals).
 *
 * Run: node tools/gen-font-previews.mjs
 * NEVER hand-edit the emitted previews — regenerate (gen-restored-nt.mjs
 * discipline). Uses the subset-font devDependency (harfbuzz wasm).
 */
import subsetFont from 'subset-font';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'app', 'src', 'main', 'assets');
const OUT_DIR = join(ASSETS, 'fonts', 'previews');

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/';
// Variable package: one file per style covering the whole weight axis.
const vf = (id) => [
  { url: `${CDN}${id}:vf@latest/latin-wght-normal.woff2`, weight: '100 900', style: 'normal' },
  { url: `${CDN}${id}:vf@latest/latin-wght-italic.woff2`, weight: '100 900', style: 'italic' },
];
const vfNoItalic = (id) => [
  { url: `${CDN}${id}:vf@latest/latin-wght-normal.woff2`, weight: '100 900', style: 'normal' },
];
// Static package: explicit weight/style files.
const st = (id, specs) => specs.map(([w, s]) => ({
  url: `${CDN}${id}@latest/latin-${w}-${s}.woff2`, weight: String(w), style: s,
}));

/* The candidate list. label doubles as the preview subset text. Keep in
 * sync with READING_FONTS in src/utils/reading-fonts.js (this script is
 * the authoring step; that file holds the pinned output). */
const CANDIDATES = [
  { id: 'lora',                 label: 'Lora',                 files: vf('lora') },
  { id: 'literata',             label: 'Literata',             files: vf('literata') },
  { id: 'merriweather',         label: 'Merriweather',         files: st('merriweather', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'crimson-pro',          label: 'Crimson Pro',          files: vf('crimson-pro') },
  { id: 'source-serif-4',       label: 'Source Serif 4',       files: vf('source-serif-4') },
  { id: 'libre-baskerville',    label: 'Libre Baskerville',    files: st('libre-baskerville', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'cardo',                label: 'Cardo',                files: st('cardo', [[400, 'normal'], [700, 'normal'], [400, 'italic']]) },
  { id: 'gentium-book-plus',    label: 'Gentium Book Plus',    files: st('gentium-book-plus', [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) },
  { id: 'noto-serif',           label: 'Noto Serif',           files: vf('noto-serif') },
  { id: 'spectral',             label: 'Spectral',             files: st('spectral', [[400, 'normal'], [600, 'normal'], [400, 'italic']]) },
  { id: 'vollkorn',             label: 'Vollkorn',             files: vf('vollkorn') },
  { id: 'alegreya',             label: 'Alegreya',             files: vf('alegreya') },
  { id: 'bitter',               label: 'Bitter',               files: vf('bitter') },
  { id: 'atkinson-hyperlegible', label: 'Atkinson Hyperlegible', files: st('atkinson-hyperlegible', [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) },
  { id: 'lexend',               label: 'Lexend',               files: vfNoItalic('lexend') },
];

async function fetchFont(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { resolvedUrl: res.url, bytes: buf.length, buf };
}

/** Unique glyph set for a preview: the label + a space. */
const subsetText = (label) => [...new Set((label + ' ').split(''))].join('');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = [];
  let previewTotal = 0;

  for (const font of CANDIDATES) {
    const files = [];
    let regularBuf = null;
    for (const f of font.files) {
      const got = await fetchFont(f.url);
      files.push({ ...f, resolvedUrl: got.resolvedUrl, bytes: got.bytes });
      if (!regularBuf && f.style === 'normal') regularBuf = got.buf;
    }
    const preview = await subsetFont(regularBuf, subsetText(font.label), { targetFormat: 'woff2' });
    const outPath = join(OUT_DIR, `${font.id}.woff2`);
    writeFileSync(outPath, preview);
    previewTotal += preview.length;
    const totalKb = Math.round(files.reduce((s, f) => s + f.bytes, 0) / 1024);
    report.push({ id: font.id, label: font.label, kb: totalKb, previewBytes: preview.length, files });
    console.log(`${font.id}: full ${totalKb} KB (${files.length} files), preview ${preview.length} B`);
  }

  // EB Garamond ("modern") preview from the LOCAL bundled file.
  const eb = readFileSync(join(ASSETS, 'fonts', 'eb-garamond-latin-wght-normal.woff2'));
  const ebPreview = await subsetFont(eb, subsetText('EB Garamond'), { targetFormat: 'woff2' });
  writeFileSync(join(OUT_DIR, 'modern.woff2'), ebPreview);
  previewTotal += ebPreview.length;
  console.log(`modern (EB Garamond, local): preview ${ebPreview.length} B`);

  console.log(`\npreview total: ${(previewTotal / 1024).toFixed(1)} KB across ${report.length + 1} files`);
  console.log('\n── pinned files for reading-fonts.js ──');
  for (const r of report) {
    console.log(`  // ${r.label} — ~${r.kb} KB`);
    for (const f of r.files) {
      console.log(`  { url: '${f.resolvedUrl}', weight: '${f.weight}', style: '${f.style}' },`);
    }
  }
  writeFileSync(join(ROOT, 'tools', '_font-previews-report.json'), JSON.stringify(report, null, 2));
  console.log('\nreport written to tools/_font-previews-report.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
