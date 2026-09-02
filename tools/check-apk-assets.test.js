/* check-apk-assets — the gate must not pass vacuously.
   ─────────────────────────────────────────────────────────────────────────
   tools/check-apk-assets.js proves every RUNTIME-INJECTED asset survives
   app/build.gradle.kts's ignoreAssetsPatterns. It derives BOTH sides by regex
   over source text, and a regex that stops matching does not fail — it finds
   nothing, and "nothing excluded" reads as OK. Two paths make the gate
   vacuous today (found in the 2026-09-01 Verifier orientation):

     1. readIgnorePatterns() returns null when the `ignoreAssetsPatterns +=
        listOf(` block is not matched, and the gate exits 0 with "nothing to
        check". A reformat of build.gradle.kts (`.addAll(`, `= listOf(`, a
        different indent style) silently disarms the only check standing
        between a `<dir>` pattern and a silent NKJV fallback on device.
     2. collectInjectedPaths() finding zero `.src = '…'` sites exits 0 with
        "OK — 0 runtime-injected assets". A loader refactor to
        setAttribute('src', …) or a template literal leaves the gate checking
        an empty list forever, and the list is the whole point.

   The sibling gates already refuse to pass on zero: smoke-lite's linkage
   check and list-runtime-src-assets --check both FAIL when their scan comes
   back empty. This suite holds check-apk-assets to the same standard.

   HOW: the gate resolves ROOT from its own import.meta.url and exports no
   functions, so each case copies the script VERBATIM into a temp mirror of
   the repo layout (tools/ + app/build.gradle.kts + app/src/main/assets/src)
   and runs it as a child process, exactly as the pre-commit hook does. Two
   positive controls prove the harness drives the real gate (a genuine
   exclusion fails, a clean tree passes and reports its count), so the two
   RED cases cannot themselves pass vacuously. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-apk-assets.js');

/** The block exactly as build.gradle.kts writes it (the shape the gate's regex expects). */
const GRADLE_WITH_BLOCK = `
android {
    androidResources {
        ignoreAssetsPatterns += listOf(
            "!.svn", ".*", "<dir>_*",
            "<dir>components", "<dir>hooks", "<dir>ui",
            "app.jsx"
        )
    }
}
`;

/** The same intent in a DSL form the gate's regex does not recognise. */
const GRADLE_WITHOUT_BLOCK = `
android {
    androidResources {
        // The list moved to a different DSL form; the gate's regex no longer sees it.
        ignoreAssetsPatterns.addAll(listOf("<dir>src"))
    }
}
`;

/** A loader the gate's regex sees: script.src = 'src/data/bible-studies.js'. */
const LOADER_LITERAL = `
export function loadStudies() {
  const s = document.createElement('script');
  s.src = 'src/data/bible-studies.js';
  document.head.appendChild(s);
}
`;

/** The same loader after a refactor the gate's regex does NOT see. */
const LOADER_INVISIBLE = `
export function loadStudies() {
  const s = document.createElement('script');
  s.setAttribute('src', 'src/data/bible-studies.js');
  document.head.appendChild(s);
}
`;

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/**
 * A throwaway repo mirror: the real gate script, a gradle file, one loader
 * module, and the data file the loader names (so the gate's "missing on
 * disk" warning path stays out of these cases).
 */
function mirror({ gradle, loader, dataFiles = ['bible-studies.js'] }) {
  const root = mkdtempSync(join(tmpdir(), 'vot-apk-assets-'));
  mirrors.push(root);
  // The gate is ESM under a .js extension, which node accepts only inside a
  // "type":"module" package — mirror the repo's package.json setting.
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  mkdirSync(join(root, 'tools'), { recursive: true });
  copyFileSync(GATE, join(root, 'tools', 'check-apk-assets.js'));
  mkdirSync(join(root, 'app'), { recursive: true });
  writeFileSync(join(root, 'app', 'build.gradle.kts'), gradle);
  const src = join(root, 'app', 'src', 'main', 'assets', 'src');
  mkdirSync(join(src, 'data'), { recursive: true });
  mkdirSync(join(src, 'utils'), { recursive: true });
  writeFileSync(join(src, 'utils', 'translations.js'), loader);
  for (const f of dataFiles) writeFileSync(join(src, 'data', f), 'window.STUB = 1;\n');
  return root;
}

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-apk-assets.js')], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

describe('check-apk-assets — the harness drives the real gate (positive controls)', () => {
  it('FAILS when a runtime-injected asset is excluded by a <dir> pattern', () => {
    const gradle = GRADLE_WITH_BLOCK.replace('"<dir>ui",', '"<dir>ui", "<dir>data",');
    const r = runGate(mirror({ gradle, loader: LOADER_LITERAL }));
    expect(r.status, r.all).toBe(1);
    expect(r.stderr).toMatch(/\[apk-assets\] FAIL/);
    expect(r.stderr).toContain('src/data/bible-studies.js');
    expect(r.stderr).toContain('<dir>data');
  });

  it('PASSES a tree whose one injected asset survives the list, and reports the count it checked', () => {
    const r = runGate(mirror({ gradle: GRADLE_WITH_BLOCK, loader: LOADER_LITERAL }));
    expect(r.status, r.all).toBe(0);
    expect(r.stdout).toMatch(/\[apk-assets\] OK — 1 runtime-injected/);
  });
});

describe('check-apk-assets — refuses to pass vacuously (RED against the old gate; GREEN since the floors landed 2026-09-01)', () => {
  it('FAILS, not "nothing to check", when the ignoreAssetsPatterns block is not found', () => {
    const r = runGate(mirror({ gradle: GRADLE_WITHOUT_BLOCK, loader: LOADER_LITERAL }));
    expect(r.status, 'exit 0 with the block unmatched means the gate is disarmed:\n' + r.all).toBe(1);
    expect(r.stderr).toMatch(/\[apk-assets\]/);
  });

  it('FAILS, not "OK — 0 runtime-injected assets", when the source scan derives zero paths', () => {
    const r = runGate(mirror({ gradle: GRADLE_WITH_BLOCK, loader: LOADER_INVISIBLE }));
    expect(r.status, 'exit 0 with zero derived paths means the gate checks nothing:\n' + r.all).toBe(1);
    expect(r.stderr).toMatch(/\[apk-assets\]/);
  });
});
