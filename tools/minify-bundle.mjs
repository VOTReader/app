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
 *   esbuild <file> --minify --target=chrome69 --allow-overwrite --outfile=<file>
 * --target=chrome69 is MANDATORY (Permanent Rule 6) — it transpiles any syntax
 * newer than the Android 8/9 WebView floor. Only the pure-data corpus bundles
 * (no top-level `this`) are passed here; bundle-a stays raw (PF2).
 */
import { buildSync } from 'esbuild';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/minify-bundle.mjs <file>');
  process.exit(1);
}

buildSync({
  entryPoints: [file],
  outfile: file,
  allowOverwrite: true,
  minify: true,
  target: 'chrome69',
  logLevel: 'warning',
});
