/**
 * ux3 (2026-09-22): a toast must never sit on the first-run tip pill.
 * ─────────────────────────────────────────────────────────────────────
 * Both are position:fixed and bottom-centred: .vot-toast at
 * safe-area + 2rem, .ann-hint-pill at max(1.2rem, --inset-bottom) and up to
 * three lines tall on a narrow phone. Measured in the real built app at
 * 390x844 (2026-09-22): the "Copied" toast (y 763-812) sat inside the pill
 * (y 746-825). The fix lifts every toast while the pill is in the document.
 * jsdom has no layout, so this pins the CSS contract: the lift rule exists,
 * starts from the pill's own base offset, and clears a three-line pill.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'app.css'), 'utf-8');

/** The declaration block of the first rule whose selector is exactly `selector`. */
function block(selector) {
  const i = CSS.indexOf(selector + ' {');
  if (i < 0) return null;
  return CSS.slice(i, CSS.indexOf('}', i));
}

describe('toasts clear the first-run tip pill (ux3)', () => {
  it('lifts .vot-toast while an .ann-hint-pill is in the page (and not hidden by autoscroll)', () => {
    const lift = block('body:not(.autoscroll-on):has(.ann-hint-pill) .vot-toast');
    expect(lift, 'the lift rule is missing from app.css').toBeTruthy();
    // Starts from the pill's own base, so the two can never drift apart.
    expect(block('.ann-hint-pill')).toMatch(/bottom:\s*max\(1\.2rem, var\(--inset-bottom, 0px\)\)/);
    const m = /bottom:\s*calc\(max\(1\.2rem, var\(--inset-bottom, 0px\)\) \+ ([\d.]+)rem\)/.exec(lift || '');
    expect(m, 'the lift must be the pill base plus a rem offset').toBeTruthy();
    // Measured: the two-line pill is 79 px tall at 390 px wide, so a three-line pill (a 320 px phone) is about
    // 100 px = 6.3rem; the lift must clear that with a visible gap.
    expect(Number(m && m[1])).toBeGreaterThanOrEqual(7);
  });
});
