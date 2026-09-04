/* check-corpus-version — the bible- glob must not double-count bundle-a members.
   ─────────────────────────────────────────────────────────────────────────
   tools/check-corpus-version.js fingerprints every src/data file the corpus
   cache serves, so an edit to any of them demands a CORPUS_VERSION bump. Its
   `bible-` glob (readdirSync + /^bible-[a-z-]+\.js$/) ran straight over disk
   with no awareness that tools/build.py CONCATENATES some bible-*.js files
   into bundle-a — src/data/bible-audio-manifest.js is one, and build.py's own
   comments say bundle-a members need no CORPUS_VERSION bump because the SW
   content-hash (CACHE_VERSION) already busts them. Editing that ~4 KB file
   tripped the corpus gate anyway, forcing a CORPUS_VERSION bump that deletes
   vot-corpus-OLD and re-downloads the whole ~15 MB stable bucket for nothing.

   Fix (service-worker-2, 2026-09-04): subtract list-runtime-src-assets.js's
   bundledSrcFiles() — already used to keep the deploy's copy-back list honest
   — from the glob.

   HOW: same harness as check-apk-assets.test.js — the gate resolves its own
   paths from import.meta.url and exports no functions, so each case mirrors
   the real tools/check-corpus-version.js + tools/list-runtime-src-assets.js
   into a throwaway repo tree and runs the gate as a child process, exactly as
   pre-commit does. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-corpus-version.js');
const RUNTIME_ASSETS_TOOL = resolve(HERE, 'list-runtime-src-assets.js');

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the two real gate scripts + the minimum
 * fixture set check-corpus-version.js needs: a service worker (CORPUS_VERSION
 * + one precached font), the matching search-cache signature, the three lazy
 * corpus bundles, one font file, and two src/data files — bible-kjv.js (a
 * genuine corpus file) and bible-audio-manifest.js (concatenated into
 * bundle-a by the mirrored build.py, same as the real one). */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-corpus-version-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');

  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'check-corpus-version.js'));
  copyFileSync(RUNTIME_ASSETS_TOOL, join(toolsDir, 'list-runtime-src-assets.js'));
  writeFileSync(join(toolsDir, 'build.py'), "A = [\n    'src/data/bible-audio-manifest.js',\n]\n");

  const assets = join(root, 'app', 'src', 'main', 'assets');
  const dataDir = join(assets, 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(assets, 'src', 'search'), { recursive: true });
  mkdirSync(join(assets, 'dist'), { recursive: true });
  mkdirSync(join(assets, 'fonts', 'reading'), { recursive: true });

  writeFileSync(join(dataDir, 'bible-audio-manifest.js'), 'window.BIBLE_AUDIO_MANIFEST = {};\n');
  writeFileSync(join(dataDir, 'bible-kjv.js'), 'window.BIBLE_KJV = {};\n');
  for (const f of ['bundle-a-bible.js', 'bundle-a-matthew.js', 'bundle-a-vot.js']) {
    writeFileSync(join(assets, 'dist', f), '/* stub */\n');
  }
  writeFileSync(join(assets, 'fonts', 'reading', 'stub.woff2'), 'stub');
  writeFileSync(join(assets, 'src', 'search', 'cache.js'), "export const CORPUS_CONTENT_VERSION = 'c1';\n");
  writeFileSync(join(assets, 'service-worker.js'),
    "const CORPUS_VERSION = 'c1';\nconst x = './fonts/reading/stub.woff2';\n");

  return { root, dataDir };
}

function runGate(root, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-corpus-version.js'), ...args], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

// Why this file needs its own timeout, and why it is not a global bump.
//
// Both cases here do REAL WORK before they can assert: mkdtemp a throwaway repo
// mirror, write the corpus files into it, copy the gate in, then spawnSync a
// fresh node process — twice per case, once to seed the lock and once to check
// it. That is the design: the gate resolves ROOT from its own import.meta.url
// and exports nothing, so driving it any other way would stop testing the thing
// the pre-commit hook runs.
//
// Measured 2026-09-04 on this machine: 2.6 s for the file idle. Under the full
// suite with other gate runs competing, both cases blew the 5 s default at
// 19.4 s and 17.1 s — timeouts, not assertion failures, and they pass alone
// immediately after. Same shape and same 30 s as tools/check-apk-assets.test.js,
// which took two independent sightings to diagnose; this file has the identical
// spawn-per-case design and would have cost the next person the same hour.
//
// Do NOT lower it back to the default and do NOT raise testTimeout globally:
// every other suite in this repo is pure and should keep failing at 5 s.
const SPAWN_TIMEOUT_MS = 30_000;

describe('check-corpus-version — bible- glob excludes bundle-a members (RED before service-worker-2, 2026-09-04; GREEN after)', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('does not demand a CORPUS_VERSION bump when a bundle-a-concatenated file changes', () => {
    const { root, dataDir } = mirror();
    expect(runGate(root).status, 'lock seed').toBe(0);
    // Same edit shape as a real audio-manifest tweak — this file ships inside
    // bundle-a, so CACHE_VERSION (not CORPUS_VERSION) already busts it.
    appendFileSync(join(dataDir, 'bible-audio-manifest.js'), 'window.BIBLE_AUDIO_MANIFEST.x = 1;\n');
    const r = runGate(root, ['--check']);
    expect(r.status, r.all).toBe(0);
  });

  it('still demands a bump when a genuine (non-bundled) corpus file changes', () => {
    const { root, dataDir } = mirror();
    expect(runGate(root).status, 'lock seed').toBe(0);
    appendFileSync(join(dataDir, 'bible-kjv.js'), 'window.BIBLE_KJV.x = 1;\n');
    const r = runGate(root, ['--check']);
    expect(r.status, r.all).toBe(1);
    expect(r.stderr).toMatch(/STABLE-CACHE CONTENT CHANGED BUT CORPUS_VERSION WAS NOT BUMPED/);
  });
});
