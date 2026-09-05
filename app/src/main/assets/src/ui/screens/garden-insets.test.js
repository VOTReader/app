// @ts-nocheck
/* RED — gap-garden-viewer-and-image-cache-7 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   GardenView bypasses ScreenLayout, so it also bypasses the app-wide inset
   discipline: .garden-fullscreen is position:fixed inset:0 and its two bars
   pad with fixed rems — no var(--inset-top) / var(--inset-bottom) — while
   every other chrome surface calc()s them in (.top-nav at app.css:101, the
   tabs overview at 3348, the sheets, the Garden's OWN warning overlay at
   2558). On a cutout phone the back button sits under the notch and the
   page arrows under the gesture bar. The emulator measurement (cutout
   emulation overlay) is in verifier-repros.md; this pins the stylesheet
   contract that the fix changes.

   CONTRACT PINNED HERE: .garden-top-bar's padding references --inset-top and
   .garden-bottom-bar's references --inset-bottom, like the rest of app.css. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../app.css'), 'utf8');

/** The declaration block of the FIRST rule whose selector list is exactly `sel`. */
function rule(sel) {
  const re = new RegExp('(^|[\\s}])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = CSS.match(re);
  if (!m) throw new Error('no rule for ' + sel);
  return m[2];
}

describe('gap-garden-viewer-7 — the Garden bars ignore the display cutout insets', () => {
  it('CONTROL: the Garden warning overlay and the top nav already pad by the injected insets', () => {
    expect(rule('.garden-warning-overlay')).toMatch(/var\(--inset-top/);
    expect(rule('.garden-warning-overlay')).toMatch(/var\(--inset-bottom/);
    expect(rule('.tabs-overview')).toMatch(/var\(--inset-top/);
  });

  it('.garden-top-bar pads its top by --inset-top (the back button must clear the notch)', () => {
    const decl = rule('.garden-top-bar');
    expect(decl).toMatch(/position\s*:\s*absolute/);
    expect(decl).toMatch(/var\(--inset-top/);
  });

  it('.garden-bottom-bar pads its bottom by --inset-bottom (the page arrows must clear the gesture bar)', () => {
    const decl = rule('.garden-bottom-bar');
    expect(decl).toMatch(/position\s*:\s*absolute/);
    expect(decl).toMatch(/var\(--inset-bottom/);
  });
});
