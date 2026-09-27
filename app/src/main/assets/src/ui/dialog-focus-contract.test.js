// @ts-nocheck — node:fs source scan; the Q4 typecheck scope has no node types
/* Every dialog traps focus (keyboard + screen reader contract, 2026-09-27).
   ─────────────────────────────────────────────────────────────────────
   A dialog or sheet must take focus when it opens, keep Tab inside, hand focus
   back to where the reader was when it closes, and close on Escape / Android
   Back. useFocusTrap (hooks/use-focus-trap.js) does the first three; Escape and
   Back go through the modal registry or the __closeSheet slot, never a listener
   of the dialog's own.

   This is the static half: a component file cannot declare more
   role="dialog"/"alertdialog" elements than it calls useFocusTrap. It is how
   the Scripture Web's how-to-read card (the one dialog without a trap in the
   2026-09-27 walk) would have been caught. The behaviour itself is pinned per
   dialog next to each component. */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = dirname(fileURLToPath(import.meta.url));

/** Every product .jsx under src/ui (tests excluded), as [relative path, source]. */
function uiSources(dir = UI, rel = '') {
  /** @type {[string, string][]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) { out.push(...uiSources(join(dir, entry.name), r)); continue; }
    if (!entry.name.endsWith('.jsx') || entry.name.includes('.test.')) continue;
    out.push([r, readFileSync(resolve(dir, entry.name), 'utf-8')]);
  }
  return out;
}

/** Source without block and line comments (a comment naming role="dialog" is not a dialog). */
const code = (/** @type {string} */ src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

describe('dialogs trap focus', () => {
  it('no component file has more role="dialog" elements than useFocusTrap calls', () => {
    const short = uiSources()
      .map(([rel, src]) => {
        const c = code(src);
        return { rel, dialogs: (c.match(/role="(?:dialog|alertdialog)"/g) || []).length, traps: (c.match(/useFocusTrap\(/g) || []).length };
      })
      .filter((f) => f.dialogs > f.traps)
      .map((f) => `${f.rel}: ${f.dialogs} dialogs, ${f.traps} traps`);
    expect(short).toEqual([]);
  });

  it('CONTROL: the scan sees the dialogs it counts', () => {
    const files = uiSources().filter(([, src]) => /role="dialog"/.test(code(src)));
    expect(files.length).toBeGreaterThan(20);
  });
});
