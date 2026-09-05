// @ts-nocheck — reads index.html off disk, so it imports node:fs/path/url,
// which the browser-scoped tsconfig for src/ does not type. Same reason
// journal-media-store.test.js carries one for node:buffer.
/* The boot writer and the module must not drift.
   ────────────────────────────────────────────────────────────────────
   `index.html`'s inline script runs before any bundle, so it cannot import
   `font-scale.js` — it carries a copy of the arithmetic. Everywhere else in
   this codebase, two definitions that must agree is the defect and the fix is
   to delete one. Here one of them HAS to live in index.html, so the fix is
   unavailable and a test takes its place.

   Two assertions, and the second is the one that matters:

     F8a  index.html contains BOOT_FONT_SCALE_EXPR verbatim.
     F8b  evaluating that expression produces what resolveFontScale produces,
          over a table that covers every branch.

   A string match alone would be satisfied by two expressions that agree on
   nothing — it only proves someone copied SOMETHING. Running the copy against
   the function is what makes this a guard rather than a spelling check.

   F7 belongs here too because it is the same coupling seen from the other
   end: the boot writer reads three fields out of localStorage['vot-state'],
   and `_bootScriptShim` is what puts them there. Leave either new field out
   of the shim and the writer falls back on every launch while React corrects
   it — a resize flash on every boot. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOT_FONT_SCALE_EXPR, resolveFontScale } from './font-scale.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = resolve(HERE, '..', '..', 'index.html');

describe('F8: the inline boot writer is the module, copied', () => {
  it('F8a: index.html carries the expression verbatim', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    expect(html).toContain(BOOT_FONT_SCALE_EXPR);
  });

  it('F8b: the copy computes what resolveFontScale computes', () => {
    // Every branch: reader wins, system wins, legacy 1 → system, legacy
    // non-1 → reader, clamps at both ends, and the non-numeric fallbacks.
    const cases = [
      { fontScale: '1.3', fontScaleSource: 'reader', systemFontScale: '2' },
      { fontScale: '1', fontScaleSource: 'reader', systemFontScale: '2' },   // R7: an explicit 100% BEATS a larger phone
      { fontScale: '1.3', fontScaleSource: 'system', systemFontScale: '2' },
      { fontScale: '1', systemFontScale: '2' },              // legacy, ambiguous → system
      { fontScale: '1.5', systemFontScale: '2' },            // legacy, unambiguous → reader
      { fontScale: '9', fontScaleSource: 'reader' },         // clamps high
      { fontScale: '0.1', fontScaleSource: 'reader' },       // clamps low
      { fontScaleSource: 'system' },                         // no cached system scale → 1
      { fontScale: 'wat', fontScaleSource: 'reader' },        // non-numeric → 1
      { fontScale: '1', fontScaleSource: 'garbage', systemFontScale: '2' }, // unknown → absent
      {},                                                     // nothing at all
    ];

    for (const settings of cases) {
      // Run the literal copy in the shape the boot script runs it: `s` is the
      // parsed vot-state, and the writer sets a CSS custom property.
      let applied = null;
      const s = { settings };
      const document = { documentElement: { style: { setProperty: (k, v) => { if (k === '--font-scale') applied = v; } } } };
      // Running the shipped copy IS the assertion.
      new Function('s', 'document', BOOT_FONT_SCALE_EXPR)(s, document);

      expect(applied, `boot writer produced nothing for ${JSON.stringify(settings)}`).not.toBeNull();
      expect(Number(applied), `boot vs module for ${JSON.stringify(settings)}`)
        .toBe(resolveFontScale(settings));
    }
  });

  /* The old writer returned early on `isFinite(fsc) && fsc !== 1`, which was
     safe only while 1 meant "nothing to do". With a system source it does not:
     a reader at 1 on a phone at 2.0 must end up at 2.0. */
  it('F8c: it no longer skips when the stored scale is 1', () => {
    let applied = null;
    const s = { settings: { fontScale: '1', fontScaleSource: 'system', systemFontScale: '1.8' } };
    const document = { documentElement: { style: { setProperty: (k, v) => { if (k === '--font-scale') applied = v; } } } };
    new Function('s', 'document', BOOT_FONT_SCALE_EXPR)(s, document);
    expect(applied).toBe('1.8');
  });
});
