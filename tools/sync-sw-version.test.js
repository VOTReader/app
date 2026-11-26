/**
 * tools/sync-sw-version.test.js — tests for tools/sync-sw-version.js.
 *
 * The script runs at import, exports nothing, and rewrites the real
 * service-worker.js in place, so it cannot be imported into vitest.
 * Each case mirrors the real script (plus its list-runtime-src-assets.js
 * import and a stub tools/build.py) into a throwaway repo tree with a
 * small synthetic service-worker.js and fixture assets, then runs the
 * script as a child process, exactly as `npm run build` does. Fully
 * offline, deterministic. Precedent: tools/check-app-size.test.js.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'sync-sw-version.js');
const RUNTIME_LIST = resolve(HERE, 'list-runtime-src-assets.js');

const INT_BEGIN = '// ── BEGIN GENERATED: ASSET_INTEGRITY (tools/sync-sw-version.js) ──';
const INT_END = '// ── END GENERATED: ASSET_INTEGRITY ──';
const REV_BEGIN = '// ── BEGIN GENERATED: ASSET_REVISIONS (tools/sync-sw-version.js) ──';
const REV_END = '// ── END GENERATED: ASSET_REVISIONS ──';

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

function defaultCore() {
  return [
    "'./',",
    "'./index.html',",
    "'./dist/app.min.css',",
    "'./manifest.json',",
    "'./dist/bundle-a.js',",
    "'./logo.png',",
  ];
}

function defaultCritical() {
  return ["'./',", "'./index.html',", "'./dist/app.min.css',"];
}

/** A small synthetic service-worker.js with the same shapes the script parses. */
function swText(o = {}) {
  const lines = [];
  if (o.cacheVersion !== false) {
    lines.push(`const CACHE_VERSION = '${o.cacheVersion ?? 'v0.0.0-0000000000'}';`);
  }
  if (o.core !== false) {
    lines.push('const CORE_ASSETS = [');
    lines.push(...(o.core ?? defaultCore()));
    lines.push('];');
  }
  if (o.critical !== false) {
    lines.push('const CRITICAL_ASSETS = new Set([');
    lines.push(...(o.critical ?? defaultCritical()));
    lines.push(']);');
  }
  lines.push('const CORPUS_PRECACHE = [');
  lines.push(...(o.corpus ?? ["'./corpus/bundle-a.json',", "'./corpus/missing.json',"]));
  lines.push('];');
  lines.push('const READING_FONT_PRECACHE = [');
  lines.push(...(o.fonts ?? ["'./fonts/reading/lexend-latin-400-normal.woff2',"]));
  lines.push('];');
  if (o.integrity === 'missing') {
    // no integrity block at all
  } else if (o.integrity === 'duplicate') {
    lines.push(INT_BEGIN, 'const ASSET_INTEGRITY = {};', INT_END);
    lines.push(INT_BEGIN, 'const ASSET_INTEGRITY = {};', INT_END);
  } else if (o.integrity === 'misordered') {
    lines.push(INT_END, 'const ASSET_INTEGRITY = {};', INT_BEGIN);
  } else {
    lines.push(INT_BEGIN, 'const ASSET_INTEGRITY = {};', INT_END);
  }
  if (o.revisions === 'missing') {
    // no revisions block at all
  } else if (o.revisions === 'duplicate') {
    lines.push(REV_BEGIN, 'const ASSET_REVISIONS = {};', REV_END);
    lines.push(REV_BEGIN, 'const ASSET_REVISIONS = {};', REV_END);
  } else {
    lines.push(REV_BEGIN, 'const ASSET_REVISIONS = {};', REV_END);
  }
  return lines.join('\n') + '\n';
}

// Fixture assets (paths relative to app/src/main/assets). The PNG bytes
// carry a 0x0d so the CR-strip is exercised on a binary revision too.
const DEFAULT_FILES = {
  'index.html': '<!doctype html><html><body>hi</body></html>\n',
  'dist/app.min.css': 'body{margin:0}\n',
  'manifest.json': '{"name":"vot"}\n',
  'dist/bundle-a.js': "console.log('a');\n",
  'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'corpus/bundle-a.json': '{"corpus":1}\n',
  'fonts/reading/lexend-latin-400-normal.woff2': Buffer.from([0, 1, 2, 3]),
  'src/data/extra.js': 'export const X = 1;\n',
};

// A runtime loader under src/: deriveRuntimeSrcAssets() picks up both
// references; ghost.js does not exist on disk, so it gets no revision.
const DEFAULT_LOADER = "const s = document.createElement('script');\ns.src = 'src/data/extra.js';\ns.src = 'src/data/ghost.js';\n";

/** A throwaway repo mirror with the real script + fixture assets. */
function mirror(o = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-sw-version-'));
  mirrors.push(root);
  // "type": "module" — the script and its import are ESM (.js, import syntax).
  writeFileSync(join(root, 'package.json'),
    JSON.stringify({ name: 'vot-test', type: 'module', version: o.version ?? '1.2.3' }) + '\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'sync-sw-version.js'));
  copyFileSync(RUNTIME_LIST, join(toolsDir, 'list-runtime-src-assets.js'));
  writeFileSync(join(toolsDir, 'build.py'), '# stub: no src/data files are concatenated into a bundle\n');
  const assetsDir = join(root, 'app', 'src', 'main', 'assets');
  mkdirSync(join(assetsDir, 'src'), { recursive: true });
  const files = { ...DEFAULT_FILES, ...(o.files ?? {}) };
  for (const rel of o.removeFiles ?? []) delete files[rel];
  for (const [rel, content] of Object.entries(files)) {
    const fp = join(assetsDir, rel);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, content);
  }
  if (o.loader !== false) {
    writeFileSync(join(assetsDir, 'src', 'loader.js'), o.loader ?? DEFAULT_LOADER);
  }
  writeFileSync(join(assetsDir, 'service-worker.js'), swText(o.sw ?? {}));
  return { root, swPath: join(assetsDir, 'service-worker.js') };
}

function runScript(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'sync-sw-version.js')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const crStrip = (buf) => Buffer.from(buf).filter((b) => b !== 0x0d);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const asBuffer = (c) => (Buffer.isBuffer(c) ? c : Buffer.from(c));

function versionOf(sw) {
  const m = sw.match(/const CACHE_VERSION = '([^']+)';/);
  return m ? m[1] : null;
}

/** Parse a generated map block ('path': '<64 hex>',) into an object. */
function mapOf(sw, begin, end) {
  const bi = sw.indexOf(begin);
  const ei = sw.indexOf(end);
  if (bi === -1 || ei === -1) return null;
  return Object.fromEntries(
    [...sw.slice(bi, ei).matchAll(/'([^']+)': '([0-9a-f]{64})',/g)].map((x) => [x[1], x[2]]),
  );
}

/** The digest the script should produce for `files` ({ './path': content }): sha256
 * over (path + CR-stripped bytes) per file, paths sorted — the script's own algorithm. */
function expectedDigest(files) {
  const hash = createHash('sha256');
  for (const p of Object.keys(files).sort()) {
    hash.update(p);
    hash.update(crStrip(asBuffer(files[p])));
  }
  return hash.digest('hex').slice(0, 10);
}

// The five core files the default mirror hashes (all exist on disk).
const DEFAULT_CORE_FILES = {
  './dist/app.min.css': DEFAULT_FILES['dist/app.min.css'],
  './dist/bundle-a.js': DEFAULT_FILES['dist/bundle-a.js'],
  './index.html': DEFAULT_FILES['index.html'],
  './logo.png': DEFAULT_FILES['logo.png'],
  './manifest.json': DEFAULT_FILES['manifest.json'],
};

describe('happy path', () => {
  it('writes v{version}-{10-hex digest} matching a recomputed content hash', () => {
    const { root, swPath } = mirror();
    const r = runScript(root);
    expect(r.status).toBe(0);
    const digest = expectedDigest(DEFAULT_CORE_FILES);
    expect(versionOf(readFileSync(swPath, 'utf-8'))).toBe(`v1.2.3-${digest}`);
    expect(r.stdout).toContain(
      `[sw-version] CACHE_VERSION -> 'v1.2.3-${digest}' (hashed 5 core assets, 5 integrity hashes).`,
    );
  });

  it('digest is exactly 10 lowercase hex chars under the package version', () => {
    const { root, swPath } = mirror({ version: '2.0.0' });
    expect(runScript(root).status).toBe(0);
    expect(versionOf(readFileSync(swPath, 'utf-8'))).toMatch(/^v2\.0\.0-[0-9a-f]{10}$/);
  });

  it('integrity map holds CR-stripped sha256 per verifiable asset; ./ borrows index.html', () => {
    const { root, swPath } = mirror();
    expect(runScript(root).status).toBe(0);
    const integrity = mapOf(readFileSync(swPath, 'utf-8'), INT_BEGIN, INT_END);
    expect(Object.keys(integrity).sort()).toEqual([
      './', './dist/app.min.css', './dist/bundle-a.js', './index.html', './manifest.json',
    ]);
    for (const [p, rel] of [
      ['./index.html', 'index.html'],
      ['./dist/app.min.css', 'dist/app.min.css'],
      ['./manifest.json', 'manifest.json'],
      ['./dist/bundle-a.js', 'dist/bundle-a.js'],
    ]) {
      expect(integrity[p]).toBe(sha(crStrip(asBuffer(DEFAULT_FILES[rel]))));
    }
    expect(integrity['./']).toBe(integrity['./index.html']);
    expect(integrity['./logo.png']).toBeUndefined();
  });

  it('revisions map covers binary core, corpus, font and runtime assets; absent files have none', () => {
    const { root, swPath } = mirror();
    expect(runScript(root).status).toBe(0);
    const revisions = mapOf(readFileSync(swPath, 'utf-8'), REV_BEGIN, REV_END);
    expect(Object.keys(revisions).sort()).toEqual([
      './corpus/bundle-a.json',
      './fonts/reading/lexend-latin-400-normal.woff2',
      './logo.png',
      './src/data/extra.js',
    ]);
    expect(revisions['./logo.png']).toBe(sha(crStrip(DEFAULT_FILES['logo.png'])));
    expect(revisions['./corpus/bundle-a.json'])
      .toBe(sha(crStrip(asBuffer(DEFAULT_FILES['corpus/bundle-a.json']))));
    expect(revisions['./fonts/reading/lexend-latin-400-normal.woff2'])
      .toBe(sha(crStrip(DEFAULT_FILES['fonts/reading/lexend-latin-400-normal.woff2'])));
    expect(revisions['./src/data/extra.js'])
      .toBe(sha(crStrip(asBuffer(DEFAULT_FILES['src/data/extra.js']))));
    // Listed but absent from disk: fetched, never given a revision.
    expect(revisions['./corpus/missing.json']).toBeUndefined();
    expect(revisions['./src/data/ghost.js']).toBeUndefined();
  });

  it('second run is a no-op: already current, file untouched', () => {
    const { root, swPath } = mirror();
    expect(runScript(root).status).toBe(0);
    const afterFirst = readFileSync(swPath, 'utf-8');
    const mtime = statSync(swPath).mtimeMs;
    const r2 = runScript(root);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('already');
    expect(readFileSync(swPath, 'utf-8')).toBe(afterFirst);
    expect(statSync(swPath).mtimeMs).toBe(mtime);
  });
});

describe('hash shifts', () => {
  it('changing a core file shifts CACHE_VERSION', () => {
    const a = mirror();
    expect(runScript(a.root).status).toBe(0);
    const v1 = versionOf(readFileSync(a.swPath, 'utf-8'));
    const b = mirror({ files: { 'index.html': '<!doctype html><html><body>CHANGED</body></html>\n' } });
    expect(runScript(b.root).status).toBe(0);
    expect(versionOf(readFileSync(b.swPath, 'utf-8'))).not.toBe(v1);
  });

  it('adding a core asset shifts CACHE_VERSION and lands in the integrity map', () => {
    const a = mirror();
    expect(runScript(a.root).status).toBe(0);
    const v1 = versionOf(readFileSync(a.swPath, 'utf-8'));
    const b = mirror({
      files: { 'extra.css': 'x{}\n' },
      sw: { core: [...defaultCore(), "'./extra.css',"] },
    });
    expect(runScript(b.root).status).toBe(0);
    expect(versionOf(readFileSync(b.swPath, 'utf-8'))).not.toBe(v1);
    expect(mapOf(readFileSync(b.swPath, 'utf-8'), INT_BEGIN, INT_END)['./extra.css'])
      .toBe(sha(crStrip(Buffer.from('x{}\n'))));
  });

  it('removing a core asset shifts CACHE_VERSION', () => {
    const a = mirror();
    expect(runScript(a.root).status).toBe(0);
    const v1 = versionOf(readFileSync(a.swPath, 'utf-8'));
    const b = mirror({
      removeFiles: ['dist/bundle-a.js'],
      sw: { core: defaultCore().filter((l) => !l.includes('bundle-a')) },
    });
    expect(runScript(b.root).status).toBe(0);
    expect(versionOf(readFileSync(b.swPath, 'utf-8'))).not.toBe(v1);
  });

  it('CRLF bytes hash identically to LF', () => {
    const lf = mirror();
    expect(runScript(lf.root).status).toBe(0);
    const lfSw = readFileSync(lf.swPath, 'utf-8');
    const crlf = mirror({ files: { 'index.html': '<!doctype html><html><body>hi</body></html>\r\n' } });
    expect(runScript(crlf.root).status).toBe(0);
    const crlfSw = readFileSync(crlf.swPath, 'utf-8');
    expect(versionOf(crlfSw)).toBe(versionOf(lfSw));
    expect(mapOf(crlfSw, INT_BEGIN, INT_END)['./index.html'])
      .toBe(mapOf(lfSw, INT_BEGIN, INT_END)['./index.html']);
  });
});

describe('CORE_ASSETS parse', () => {
  it("ignores apostrophes and fake paths inside comments (SW-1)", () => {
    const core = [
      "'./',",
      "// wouldn't you know, './ghost.js' isn't a real asset",
      "/* the reader's './phantom.js' note */",
      "'./index.html',",
      "'./dist/app.min.css',",
      "'./manifest.json',",
      "'./dist/bundle-a.js',",
      "'./logo.png',",
    ];
    const { root, swPath } = mirror({ sw: { core } });
    const r = runScript(root);
    expect(r.status).toBe(0);
    const integrity = mapOf(readFileSync(swPath, 'utf-8'), INT_BEGIN, INT_END);
    expect(integrity['./ghost.js']).toBeUndefined();
    expect(integrity['./phantom.js']).toBeUndefined();
    expect(integrity['./index.html']).toBeDefined();
  });

  it('fails loud on a CORE_ASSETS entry without the ./ prefix (parse desync)', () => {
    const { root } = mirror({
      files: { 'dist/bundle-b.js': "console.log('b');\n" },
      sw: { core: [...defaultCore(), "'dist/bundle-b.js',"] },
    });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('parse desync');
  });
});

describe('failures exit 1 with a loud message', () => {
  it('missing verifiable core asset', () => {
    const { root } = mirror({ removeFiles: ['dist/bundle-a.js'] });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("CORE_ASSETS lists './dist/bundle-a.js' but it does not exist");
  });

  it('missing binary core asset is tolerated', () => {
    const { root, swPath } = mirror({ removeFiles: ['logo.png'] });
    const r = runScript(root);
    expect(r.status).toBe(0);
    const sw = readFileSync(swPath, 'utf-8');
    expect(mapOf(sw, INT_BEGIN, INT_END)['./logo.png']).toBeUndefined();
    expect(mapOf(sw, REV_BEGIN, REV_END)['./logo.png']).toBeUndefined();
  });

  it('missing CACHE_VERSION line', () => {
    const { root } = mirror({ sw: { cacheVersion: false } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not find a CACHE_VERSION line');
  });

  it('missing CORE_ASSETS array', () => {
    const { root } = mirror({ sw: { core: false } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not find the CORE_ASSETS array');
  });

  it('missing CRITICAL_ASSETS', () => {
    const { root } = mirror({ sw: { critical: false } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not find CRITICAL_ASSETS');
  });

  it('uncovered CRITICAL_ASSETS', () => {
    const { root } = mirror({ sw: { critical: [...defaultCritical(), "'./logo.png',"] } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('have no integrity hash');
  });

  it('missing integrity markers leaves the file untouched', () => {
    const { root, swPath } = mirror({ sw: { integrity: 'missing' } });
    const before = readFileSync(swPath, 'utf-8');
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not find the ASSET_INTEGRITY generated block');
    expect(readFileSync(swPath, 'utf-8')).toBe(before);
  });

  it('duplicated integrity markers', () => {
    const { root } = mirror({ sw: { integrity: 'duplicate' } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('MORE THAN ONE ASSET_INTEGRITY marker pair');
  });

  it('misordered integrity markers', () => {
    const { root } = mirror({ sw: { integrity: 'misordered' } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not find the ASSET_INTEGRITY generated block');
  });

  it('empty integrity map is refused', () => {
    const { root } = mirror({ sw: { core: ["'./',", "'./logo.png',"] } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('EMPTY ASSET_INTEGRITY');
  });

  it('missing revisions markers', () => {
    const { root } = mirror({ sw: { revisions: 'missing' } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('exactly one ASSET_REVISIONS marker pair');
  });

  it('duplicated revisions markers', () => {
    const { root } = mirror({ sw: { revisions: 'duplicate' } });
    const r = runScript(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('exactly one ASSET_REVISIONS marker pair');
  });
});
