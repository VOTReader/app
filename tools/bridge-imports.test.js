/* bundle-d reaches its own modules by import, not through the window bridge (v15-code-health-04).
   ═══════════════════════════════════════════════════════════════════════
   tools/bridge-imports.mjs turned 38 same-bundle bare references in 30
   bundle-d files into ES imports (typed for tsc, visible to the bundler).
   This keeps it that way: a new module-to-module bare reference inside
   bundle-d fails here, naming the file and the name, with the fix (run the
   tool with --write) or the other option (list it in tools/bridge-skip.json
   with the reason). A skip-list entry nothing reads any more also fails, so
   the list only shrinks. */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'app/src/main/assets/src/ui/_entry-d.js';

const scan = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'tools/bridge-imports.mjs'), ENTRY, '--json'], { cwd: ROOT, encoding: 'utf8' }));
const skipList = JSON.parse(readFileSync(join(ROOT, 'tools/bridge-skip.json'), 'utf8'))['ui/_entry-d.js'];

describe('bundle-d and the window bridge', () => {
  it('the scan read the bundle (a dead scan would pass the next case)', () => {
    expect(scan.members).toBeGreaterThan(100);
  });

  it('no module reaches another bundle-d module through a window global', () => {
    const lines = scan.plan.map((p) => `${p.file}: ${p.name} (from ${p.from})`);
    expect(lines, 'import these (node tools/bridge-imports.mjs ' + ENTRY + ' --write), or list them in tools/bridge-skip.json with the reason').toEqual([]);
  });

  it('every name the skip list keeps is still read somewhere', () => {
    const kept = new Set(scan.skipped.filter((s) => s.why.startsWith('kept:')).map((s) => s.name));
    const stale = Object.keys(skipList).filter((name) => !kept.has(name));
    expect(stale, 'drop these from tools/bridge-skip.json').toEqual([]);
  });
});
