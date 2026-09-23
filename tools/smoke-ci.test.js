/* smoke-ci — an uncaught page error must fail the run.
   ─────────────────────────────────────────────────────────────────────────
   tools/smoke-ci.js drives the 13-screen render walk in headless Chrome and
   collects every `pageerror` the page raises. Until 2026-09-03 the collection
   was write-only: the errors were printed only inside the branch taken when
   the walk had ALREADY failed, and never touched report.ok or the exit code.
   So a TypeError thrown from an onClick handler, a store subscriber, a
   setTimeout callback or an async effect during the walk passed green — React's
   ErrorBoundary does not catch any of those (they happen outside render), so
   smoke.js's isCrashed() saw nothing and the screen still painted.

   foldPageErrors() is the verdict step that closes that hole. The end-to-end
   RED proof lives in the 2026-09-03 hand-off: with
   `setTimeout(() => { throw new Error(...) }, 4000)` appended to
   dist/bundle-b.js, the old smoke:ci exited 0 with a PASS line; the folded
   verdict exits 1 naming the error. This suite pins the fold itself so the
   hole cannot quietly reopen in a refactor of main(). */

import { describe, it, expect } from 'vitest';
import { foldPageErrors } from './smoke-ci.js';

function passingReport() {
  return { ok: true, summary: 'PASS: globals ok, data ok, screens 0 crashed' };
}

describe('smoke-ci: uncaught page errors are part of the verdict', () => {
  it('turns a passing walk into a FAIL and names the first error', () => {
    const report = foldPageErrors(passingReport(), [
      'TypeError: Cannot read properties of undefined (reading "id")\n    at Timeout._onTimeout (dist/bundle-d.js:12:34)',
      'Error: second',
    ]);
    expect(report.ok).toBe(false);
    expect(report.summary).toMatch(/2 UNCAUGHT PAGE ERRORS/);
    expect(report.summary).toContain('TypeError: Cannot read properties of undefined (reading "id")');
    expect(report.summary).not.toContain('at Timeout._onTimeout'); // first line only — the log carries the rest
    expect(report.pageErrors).toEqual([
      'TypeError: Cannot read properties of undefined (reading "id")\n    at Timeout._onTimeout (dist/bundle-d.js:12:34)',
      'Error: second',
    ]);
  });

  it('a single error reads as one error, not "1 ERRORS"', () => {
    const report = foldPageErrors(passingReport(), ['Error: boom']);
    expect(report.ok).toBe(false);
    expect(report.summary).toMatch(/1 UNCAUGHT PAGE ERROR — first: Error: boom/);
  });

  it('leaves a clean walk untouched', () => {
    const report = foldPageErrors(passingReport(), []);
    expect(report.ok).toBe(true);
    expect(report.summary).toBe('PASS: globals ok, data ok, screens 0 crashed');
    expect(report.pageErrors).toBeUndefined();
    expect(foldPageErrors(passingReport(), undefined).ok).toBe(true);
  });

  it('keeps a failing walk failing and still records the errors', () => {
    const report = foldPageErrors({ ok: false, summary: 'FAIL: screens 1 crashed' }, ['Error: boom']);
    expect(report.ok).toBe(false);
    expect(report.summary).toBe('FAIL: screens 1 crashed | 1 UNCAUGHT PAGE ERROR — first: Error: boom');
  });

  it('does not itself crash on a non-string error entry', () => {
    const report = foldPageErrors(passingReport(), [{ message: 'not a string' }]);
    expect(report.ok).toBe(false);
    expect(report.summary).toMatch(/1 UNCAUGHT PAGE ERROR/);
  });
});

/* The tap-target probe (2026-09-22). jsdom has no layout, so each case builds
   the geometry by hand: `drawn` is the box getBoundingClientRect() reports,
   `hit` is the area elementFromPoint() answers with the element (a ::after ring
   makes it larger than the drawing). The probe must judge the HIT area. */
import { probeTapTargets, foldTapTargets, TAP_TARGET_MIN_PX } from './smoke-ci.js';

function layout(boxes) {
  // boxes: [{ el, drawn:{x,y,w,h}, hit:{x,y,w,h} }], later boxes paint on top
  for (const b of boxes) {
    const d = b.drawn;
    b.el.getBoundingClientRect = () => ({ left: d.x, top: d.y, width: d.w, height: d.h, right: d.x + d.w, bottom: d.y + d.h });
  }
  document.elementFromPoint = (x, y) => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const h = boxes[i].hit || boxes[i].drawn;
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return boxes[i].el;
    }
    return document.body;
  };
}
function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const node = wrap.firstElementChild;
  document.body.appendChild(node);
  return node;
}

describe('smoke-ci: every control a phone reader taps is at least 24 px', () => {
  it('flags an 18 x 18 footnote marker in running text (the 2026-09-22 measurement)', () => {
    document.body.innerHTML = '';
    const fn = el('<span role="button" class="fn-ref" style="display:inline-flex" aria-label="Footnote 1">1</span>');
    layout([{ el: fn, drawn: { x: 200, y: 300, w: 18, h: 18 } }]);
    const r = probeTapTargets(TAP_TARGET_MIN_PX);
    expect(r.probed).toBe(1);
    expect(r.offenders).toEqual([{ label: 'Footnote 1', w: 18, h: 18, missed: 4 }]); // the 4 axis points; the diagonals still fall inside the square
  });

  it('passes the same 18 px drawing once its HIT area is a 30 px ring', () => {
    document.body.innerHTML = '';
    const fn = el('<span role="button" style="display:inline-flex" aria-label="Footnote 1">1</span>');
    layout([{ el: fn, drawn: { x: 200, y: 300, w: 18, h: 18 }, hit: { x: 194, y: 294, w: 30, h: 30 } }]);
    expect(probeTapTargets(TAP_TARGET_MIN_PX)).toEqual({ probed: 1, offenders: [] });
  });

  it('flags a 22 px tall button and passes a 44 px one', () => {
    document.body.innerHTML = '';
    const low = el('<button aria-label="Sort verses in book order">Book order</button>');
    const big = el('<button aria-label="Home">H</button>');
    layout([{ el: low, drawn: { x: 20, y: 100, w: 80, h: 22 } }, { el: big, drawn: { x: 200, y: 100, w: 44, h: 44 } }]);
    const r = probeTapTargets(TAP_TARGET_MIN_PX);
    expect(r.probed).toBe(2);
    expect(r.offenders.map((o) => o.label)).toEqual(['Sort verses in book order']);
  });

  it('probes only inside the root it is given (the read-along e2e scopes it to the player bar)', () => {
    document.body.innerHTML = '';
    const bar = el('<div class="audio-bar"></div>');
    const seek = document.createElement('input');
    seek.type = 'range'; seek.setAttribute('aria-label', 'Seek'); bar.appendChild(seek);
    const outside = el('<button aria-label="Sort verses in book order">Book order</button>');
    layout([{ el: seek, drawn: { x: 60, y: 300, w: 127, h: 14 } }, { el: outside, drawn: { x: 20, y: 100, w: 80, h: 22 } }]);
    const r = probeTapTargets(TAP_TARGET_MIN_PX, '.audio-bar');
    expect(r.probed).toBe(1);
    expect(r.offenders.map((o) => o.label)).toEqual(['Seek']);
    expect(probeTapTargets(TAP_TARGET_MIN_PX, '.no-such-root')).toEqual({ probed: 0, offenders: [] });
  });

  it('exempts an inline link in a sentence, and skips a control covered at its centre', () => {
    document.body.innerHTML = '';
    const link = el('<a href="https://example.org" style="display:inline">thevolumesoftruth.com</a>');
    const under = el('<button aria-label="Hidden under the sheet">x</button>');
    const sheet = el('<div class="sheet"></div>');
    layout([
      { el: link, drawn: { x: 10, y: 10, w: 159, h: 17 } },
      { el: under, drawn: { x: 100, y: 400, w: 18, h: 18 } },
      { el: sheet, drawn: { x: 0, y: 380, w: 1024, h: 200 } },
    ]);
    expect(probeTapTargets(TAP_TARGET_MIN_PX)).toEqual({ probed: 0, offenders: [] });
  });

  it('folds offenders into a FAIL that names screen, label and size; a clean audit into ok', () => {
    const bad = foldTapTargets(passingReport(), { probed: 9, offenders: [{ screen: 'letter', label: 'Footnote 1', w: 18, h: 18, missed: 8 }] });
    expect(bad.ok).toBe(false);
    expect(bad.summary).toContain('TAP TARGETS under 24px: letter:Footnote 1 18x18');
    const good = foldTapTargets(passingReport(), { probed: 9, offenders: [] });
    expect(good.ok).toBe(true);
    expect(good.summary).toContain('tap targets ok (9 probed at 360x800)');
    const broken = foldTapTargets(passingReport(), { error: 'no search box' });
    expect(broken.ok).toBe(false);
    expect(broken.summary).toContain('TAP TARGETS audit failed: no search box');
  });
});

import { foldSharedLink } from './smoke-ci.js';

describe('smoke-ci: a shared passage link opens there (A8)', () => {
  it('names the passage on a pass and fails the run with the evidence otherwise', () => {
    const good = foldSharedLink(passingReport(), { ok: true, verseOnPage: true, search: '' });
    expect(good.ok).toBe(true);
    expect(good.summary).toContain('shared link opens John 3:16');
    const bad = foldSharedLink(passingReport(), { ok: false, verseOnPage: false, search: '?p=bible%3Ajohn%3A3%3A16' });
    expect(bad.ok).toBe(false);
    expect(bad.summary).toContain('SHARED LINK FAIL');
    expect(bad.summary).toContain('verseOnPage":false');
  });
});
