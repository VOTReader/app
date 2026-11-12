/* Sheets and the bottom inset on the APK (FIXC, REVIEW-android and REVIEW-css).
   ─────────────────────────────────────────────────────────────────────────────
   On the phone the WebView does not shrink for the keyboard: MainActivity folds the gesture bar AND the keyboard
   into one number, --inset-bottom (about 24 px closed, 300-350 px with the keyboard up), and --keyboard-height
   stays 0. Desktop Chrome sets neither, so a rule that counts the inset twice looks right in every headless walk.
   These read the rules themselves: whoever lifts a sheet off the bottom owns the inset, and nobody adds it again. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every declaration block whose selector list is exactly `selector` (comments stripped). */
function blocks(selector) {
  const out = [];
  let i = -1;
  while ((i = CSS.indexOf(selector + ' {', i + 1)) !== -1) {
    const before = CSS.lastIndexOf('}', i);
    const head = CSS.slice(before + 1, i + selector.length).trim();
    if (head !== selector) continue;
    const open = CSS.indexOf('{', i);
    out.push(CSS.slice(open + 1, CSS.indexOf('}', open)));
  }
  return out;
}
const decl = (block, prop) => { const m = block.match(new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*([^;]+)')); return m ? m[1].trim() : null; };

describe('the five form sheets (note, bookmark, link, link list, notebook) leave the keyboard to their overlay', () => {
  it('.rd-form-sheet pads its foot by spacing alone: the overlay already lifts it by max(keyboard, inset)', () => {
    const [b] = blocks('.rd-form-sheet');
    expect(b).toBeTruthy();
    expect(b).not.toMatch(/inset-bottom|keyboard-height|safe-area/);
    for (const o of ['.note-sheet-overlay', '.nb-picker-overlay']) {
      expect(decl(blocks(o)[0], 'padding-bottom'), o).toBe('max(var(--keyboard-height, 0px), var(--inset-bottom, 0px))');
    }
  });
});

describe('the "Delete all your data?" dialog stays above the keyboard', () => {
  it('its centred overlay keeps the keyboard lift at its foot (the flat padding beat .note-sheet-overlay\'s)', () => {
    const [b] = blocks('.note-sheet-overlay.ws3-dialog-overlay');
    expect(b).toBeTruthy();
    expect(decl(b, 'padding')).toMatch(/max\(var\(--gutter\), var\(--keyboard-height, 0px\), var\(--inset-bottom, 0px\)\)$/);
  });
});
