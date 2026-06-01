/**
 * Sync the CSP `script-src` sha256 allow-list against the inline <script>
 * blocks in index.html (U10 — drop 'unsafe-inline').
 *
 * WHY HASHES, NOT NONCES: a nonce must be a fresh per-RESPONSE random value
 * injected by a server. VOTReader is served as STATIC files — GitHub Pages
 * and the Android WebViewAssetLoader both hand back index.html byte-for-byte
 * with no server to mint a nonce. So the only way to drop 'unsafe-inline'
 * from script-src is to allow each inline script by the sha256 of its exact
 * source: `'sha256-<base64>'`.
 *
 * WHY CR-STRIP BEFORE HASHING: the HTML parser normalizes CR/CRLF -> LF
 * during input-stream preprocessing, BEFORE the CSP hash is computed over a
 * script element's text content. So the browser always hashes LF-only source,
 * regardless of whether the file is served LF (Pages, git-normalized) or CRLF
 * (a Windows-built APK). Hashing CR-stripped content here matches the browser
 * on every platform — and makes the committed hash identical on a Windows
 * (CRLF) vs Linux-CI (LF) checkout, so the --check gate is deterministic.
 * (Same reasoning as sync-sw-version.js's CR-strip.)
 *
 * style-src KEEPS 'unsafe-inline' BY DESIGN: React `style={{}}` emits inline
 * `style=""` attributes app-wide, which style-src governs; there is no
 * hash/nonce path for dynamic style attributes short of 'unsafe-hashes' +
 * hashing every (runtime-generated) value, so removing it is infeasible. Only
 * script-src is hardened here.
 *
 * MODES:
 *   (default)  rewrite index.html's script-src to 'self' + the current hashes
 *              (drops 'unsafe-inline' + blob:). Idempotent: no write if current.
 *   --check    compute + compare only; exit 1 if the committed script-src is
 *              stale. Used by CI; never writes.
 *
 * Wired into `npm run build` (build:csp, BEFORE build:sw so the SW content
 * hash covers the final CSP) and the pre-commit hook (auto-restages index.html).
 */

import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = resolve(root, 'app/src/main/assets/index.html');
const check = process.argv.includes('--check');

const html = readFileSync(htmlPath, 'utf-8');

// Strip HTML comments BEFORE extracting scripts. The browser hashes only real
// <script> ELEMENTS — never the literal text "<script>" that appears in a
// <!-- comment --> (e.g. the CSP rationale above the meta tag mentions the
// "inline <script>" blocks). Without this strip, the regex would match the
// comment's <script> token and fold prose into a bogus hash. Stripping comments
// is both correct (matches the browser) and robust to any future comment text.
const scannable = html.replace(/<!--[\s\S]*?-->/g, '');

// Every INLINE <script> (no `src=` attribute). No real inline block contains the
// literal `</script>` (verified), so the non-greedy match is unambiguous.
const scriptRx = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const hashes = [];
const seen = new Set();
let m;
while ((m = scriptRx.exec(scannable)) !== null) {
  const content = m[1].replace(/\r/g, ''); // CR-strip → match the HTML parser
  const digest = createHash('sha256').update(content, 'utf8').digest('base64');
  const token = `'sha256-${digest}'`;
  if (!seen.has(token)) { seen.add(token); hashes.push(token); }
}

if (hashes.length === 0) {
  console.error('[csp-hashes] found no inline <script> blocks in index.html — aborting');
  process.exit(1);
}

// Rebuild the directive: 'self' + the inline-script hashes. No 'unsafe-inline'
// (the whole point) and no blob: (export uses a blob <a download> HREF, never a
// blob script; verified no new Worker(blob)/blob <script>, FlexSearch not in
// worker mode).
const nextDirective = `script-src 'self' ${hashes.join(' ')};`;

// Scope the rewrite to INSIDE the CSP `content="..."` attribute so the word
// "script-src" in the explanatory <!-- comment --> above the meta tag is never
// touched (it has no `;`, so a document-wide regex would eat prose).
const cspRx = /(<meta http-equiv="Content-Security-Policy" content=")([\s\S]*?)(")/;
const cspM = html.match(cspRx);
if (!cspM || !/script-src [^;]*;/.test(cspM[2])) {
  console.error('[csp-hashes] could not find the script-src directive inside the CSP meta tag');
  process.exit(1);
}
const next = html.replace(cspRx, (_full, open, body, close) =>
  open + body.replace(/script-src [^;]*;/, nextDirective) + close);

if (check) {
  if (next !== html) {
    console.error('[csp-hashes] CSP script-src is STALE — an inline <script> changed without a re-hash.');
    console.error('  Run `npm run build` (or `node tools/sync-csp-hashes.js`) and re-stage index.html.');
    process.exit(1);
  }
  console.log(`[csp-hashes] CSP script-src matches ${hashes.length} inline-script hashes — OK.`);
} else if (next === html) {
  console.log(`[csp-hashes] CSP script-src already current (${hashes.length} hashes) — no change.`);
} else {
  writeFileSync(htmlPath, next);
  console.log(`[csp-hashes] CSP script-src -> ${hashes.length} sha256 hashes (dropped 'unsafe-inline' + blob:).`);
}
