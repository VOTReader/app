/**
 * PF1 — minify a single built bundle IN PLACE with esbuild.
 *
 * Invoked by tools/build.py as `node tools/minify-bundle.mjs <file>`.
 *
 * Why a JS-API script instead of build.py shelling to the esbuild CLI:
 * on Unix, esbuild's installer REPLACES node_modules/esbuild/bin/esbuild with
 * the native binary (an ELF/Mach-O executable), so `node .../bin/esbuild` there
 * fails with "Invalid or unexpected token" (node parsing the binary as JS).
 * The JS API (`import 'esbuild'`) resolves lib/main.js and spawns the correct
 * platform binary internally, so this is byte-identical and works on every OS.
 *
 * Options mirror the verified CLI exactly:
 *   esbuild <file> --minify --target=chrome108 --allow-overwrite --outfile=<file>
 * --target=chrome108 is the WebView floor (Permanent Rule 6) — it caps the syntax
 * esbuild emits to what Chromium 108 parses. Only the pure-data corpus bundles
 * (no top-level `this`) are passed here; bundle-a stays raw (PF2).
 */
import { buildSync } from 'esbuild';
import { statSync } from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/minify-bundle.mjs <file>');
  process.exit(1);
}

const sizeBefore = statSync(file).size;

buildSync({
  entryPoints: [file],
  outfile: file,
  allowOverwrite: true,
  minify: true,
  target: 'chrome108',
  logLevel: 'warning',
});

// BLD-3: a minify that emits an empty (or implausibly tiny) file is a SILENT failure —
// esbuild exits 0 having overwritten the source with nothing useful, and only the
// corpus-version CHANGE detector (not an emptiness check) would notice downstream. Guard
// it: minified corpus bundles retain ~60-75% of their bytes, so anything below 20% (or 0)
// means a truncated/emptied input slipped through — refuse rather than ship it.
const sizeAfter = statSync(file).size;
if (sizeAfter === 0 || (sizeBefore > 1024 && sizeAfter < sizeBefore * 0.2)) {
  console.error(`[minify] ${file}: output ${sizeAfter} bytes is implausibly small vs input ${sizeBefore} — refusing to ship a truncated bundle.`);
  process.exit(1);
}
