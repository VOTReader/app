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
