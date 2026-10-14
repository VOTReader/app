/* The shipped meaning pack's text hashes describe that pack (sr8, 2026-10-14). tools/build-semantic.py keeps
   every passage's shipped vector whose text tools/semantic-units.hashes says the pack holds, so a rebuild
   embeds only new text and one new passage no longer moves all 52,854 vectors. Hashes of another pack
   would stop that rebuild (or, read as this one's, keep vectors made from other text): line 1 names the
   shipped units file, and there is one hash per passage. build-semantic.py writes both with the pack. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const man = JSON.parse(readFileSync(resolve(ROOT, 'app/src/main/assets/semantic/manifest.json'), 'utf8'));
const lines = readFileSync(resolve(ROOT, 'tools/semantic-units.hashes'), 'utf8').split('\n').filter(Boolean);

describe('tools/semantic-units.hashes', () => {
  it('names the shipped units file and holds one hash per passage', () => {
    expect(lines[0].split(':')[0].replace(/^#\s*/, '')).toBe(man.units);
    expect(lines.length - 1).toBe(man.count);
    expect(lines.slice(1).every((h) => /^[0-9a-f]{16}$/.test(h))).toBe(true);
  });
});
