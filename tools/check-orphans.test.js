// tools/check-orphans.mjs as a gate (arch-6, audit 2026-11-23): no source module the bundles never load,
// no export that nothing reads. An allowlist entry must still name something real, so a stale one fails here too.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findOrphans, exportNames, isTestish, SRC, ENTRIES, ORPHAN_ALLOW, EXPORT_ALLOW } from './check-orphans.mjs';

describe('check-orphans', () => {
  const r = findOrphans();

  it('every source module is reached from a bundle entry', () => {
    expect(r.orphans).toEqual([]);
  });

  it('every export is read by another file or used in its own', () => {
    expect(r.deadExports).toEqual([]);
  });

  it('sees the whole source tree, not an empty folder', () => {
    expect(r.modules).toBeGreaterThan(200);
    for (const e of ENTRIES) expect(existsSync(join(SRC, e)), e).toBe(true);
  });

  it('each allowlist entry still names a real file and export', () => {
    for (const p of ORPHAN_ALLOW.keys()) expect(existsSync(join(SRC, p)), p).toBe(true);
    for (const key of EXPORT_ALLOW.keys()) {
      const [p, nm] = key.split(' ');
      expect(exportNames(readFileSync(join(SRC, p), 'utf8')), key).toContain(nm);
    }
  });

  it('reads both export forms and leaves tests and fixtures out', () => {
    expect(exportNames('export const A = 1;\nexport async function b() {}\nexport { c, d as e, f as default };')).toEqual(['A', 'b', 'c', 'e']);
    expect(isTestish('ui/x.test.jsx')).toBe(true);
    expect(isTestish('utils/song-catalog.fixture.js')).toBe(true);
    expect(isTestish('ui/screens/settings-harness.jsx')).toBe(true);
    expect(isTestish('ui/screens/SettingsScreen.jsx')).toBe(false);
  });
});
