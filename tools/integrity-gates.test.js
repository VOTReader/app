/**
 * The two install gates that guard every release had no tests (ideas L5.6):
 *   - check-asset-integrity.js: the service worker's ASSET_INTEGRITY map must match
 *     the bytes on disk, or no client can update;
 *   - sync-csp-hashes.js: the CSP script-src must carry the sha256 of every inline
 *     <script>, or the app boots with its inline scripts blocked.
 * Each case runs the tool's main() in-process on a temp fixture (a cold node per
 * case timed out under a loaded pre-push; nw27, as audit-footnotes.test.js).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { main as checkIntegrity } from './check-asset-integrity.js';
import { main as syncCsp } from './sync-csp-hashes.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'integrity-gates-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function capture() {
  const out = { log: '', error: '' };
  return { out, log: (s) => { out.log += s + '\n'; }, error: (s) => { out.error += s + '\n'; } };
}

describe('check-asset-integrity', () => {
  // The worker hashes CR-stripped bytes, so a CRLF checkout matches an LF build.
  const sha = (text) => createHash('sha256').update(text.replace(/\r/g, '')).digest('hex');
  const FILES = { 'index.html': '<!doctype html><p>hi</p>\n', 'app.js': 'console.log(1);\n' };

  function writeFixture({ files = FILES, map, critical = ['./index.html'] } = {}) {
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
    const m = map ?? {
      './': sha(FILES['index.html']),
      './index.html': sha(FILES['index.html']),
      './app.js': sha(FILES['app.js']),
    };
    const entries = Object.entries(m).map(([k, v]) => `  '${k}': '${v}',`).join('\n');
    writeFileSync(join(dir, 'service-worker.js'), [
      "const CORE_ASSETS = [",
      "  './',",
      "  './index.html', // the shell",
      "  './app.js',",
      "  './icon.png', /* not a text asset: never hashed */",
      "];",
      `const CRITICAL_ASSETS = new Set([${critical.map((c) => `'${c}'`).join(', ')}]);`,
      `const ASSET_INTEGRITY = {\n${entries}\n};`,
      '',
    ].join('\n'));
  }
  const run = () => { const c = capture(); return { status: checkIntegrity({ assetsDir: dir, ...c }), ...c.out }; };

  it('passes when the map matches the bytes, with ./ borrowing index.html', () => {
    writeFixture();
    const r = run();
    expect(r.status).toBe(0);
    expect(r.log).toMatch(/3 hashes match/);
  });

  it('passes a CRLF copy of an asset hashed as LF', () => {
    writeFixture({ files: { ...FILES, 'app.js': 'console.log(1);\r\n' } });
    expect(run().status).toBe(0);
  });

  it('fails a changed asset as STALE', () => {
    writeFixture({ files: { ...FILES, 'app.js': 'console.log(2);\n' } });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/'\.\/app\.js' hash is STALE/);
  });

  it('fails a core asset missing from the map, and an uncovered critical asset', () => {
    writeFixture({ map: { './': sha(FILES['index.html']), './app.js': sha(FILES['app.js']) } });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/'\.\/index\.html' has NO hash/);
    expect(r.error).toMatch(/CRITICAL_ASSETS have no hash in the committed map: \.\/index\.html/);
  });

  it('fails a key that is not a verifiable core asset', () => {
    writeFixture({ map: {
      './': sha(FILES['index.html']), './index.html': sha(FILES['index.html']),
      './app.js': sha(FILES['app.js']), './icon.png': sha('x'),
    } });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/entry for '\.\/icon\.png', which is not a verifiable CORE asset/);
  });

  it('fails a malformed map entry', () => {
    writeFixture({ map: {
      './': sha(FILES['index.html']), './index.html': sha(FILES['index.html']), './app.js': 'abc123',
    } });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/3 entry line\(s\) but only 2 parse/);
  });

  it('fails a worker with no map', () => {
    writeFileSync(join(dir, 'service-worker.js'), "const CORE_ASSETS = ['./index.html'];\n");
    const r = run();
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/no ASSET_INTEGRITY map/);
  });
});

describe('sync-csp-hashes', () => {
  const b64 = (text) => createHash('sha256').update(text, 'utf8').digest('base64');
  const INLINE_A = '\n  window.a = 1;\n';
  const INLINE_B = 'window.b = 2;';
  const HOSTS = "'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com";

  function writeHtml({ scriptSrc = "script-src 'self';", eol = '\n', csp = true } = {}) {
    const html = [
      '<!doctype html><html><head>',
      '<!-- the CSP below allows each inline <script> by hash: script-src -->',
      csp ? `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; ${scriptSrc} style-src 'self' 'unsafe-inline';">` : '',
      `<script>${INLINE_A}</script>`,
      `<script type="module">${INLINE_B}</script>`,
      '<script src="bundle.js"></script>',
      `<script>${INLINE_A}</script>`,
      '</head></html>',
      '',
    ].join(eol);
    const p = join(dir, 'index.html');
    writeFileSync(p, html);
    return p;
  }
  const run = (argv, htmlPath) => { const c = capture(); return { status: syncCsp(argv, { htmlPath, ...c }), ...c.out }; };
  const directive = `script-src ${HOSTS} 'sha256-${b64(INLINE_A)}' 'sha256-${b64(INLINE_B)}';`;

  it('--check fails a stale script-src and never writes', () => {
    const p = writeHtml();
    const before = readFileSync(p, 'utf-8');
    const r = run(['--check'], p);
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/STALE/);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('rewrites script-src to one hash per distinct inline script, skipping src= and comments', () => {
    const p = writeHtml();
    expect(run([], p).status).toBe(0);
    const html = readFileSync(p, 'utf-8');
    expect(html).toContain(directive);
    expect(html).toContain("style-src 'self' 'unsafe-inline';");
    // The comment's "script-src" is prose outside the meta tag: untouched.
    expect(html).toContain('by hash: script-src -->');
  });

  it('then passes --check, and a second run writes nothing', () => {
    const p = writeHtml({ scriptSrc: directive });
    expect(run(['--check'], p).status).toBe(0);
    const r = run([], p);
    expect(r.status).toBe(0);
    expect(r.log).toMatch(/already current \(2 hashes\)/);
  });

  it('hashes a CRLF file as the browser does, LF only', () => {
    const p = writeHtml({ scriptSrc: directive, eol: '\r\n' });
    // INLINE_A's own newlines stay LF in the template, so the CRLF lines are the
    // tag joins; write the inline body CRLF too to prove the strip.
    writeFileSync(p, readFileSync(p, 'utf-8').split(INLINE_A).join(INLINE_A.replace(/\n/g, '\r\n')));
    expect(run(['--check'], p).status).toBe(0);
  });

  it('fails when the CSP meta tag is missing', () => {
    const p = writeHtml({ csp: false });
    const r = run(['--check'], p);
    expect(r.status).toBe(1);
    expect(r.error).toMatch(/could not find the script-src directive/);
  });
});
