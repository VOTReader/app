// @ts-nocheck
/* v2's scripture-web.css and answers.css carry copies of main's app.css blocks, and a merge of main never updated them, so
   main's CSS fixes there skipped v2 (myweb mw15: sweb's compact-sheet chips, dbe175951/aae6217de). This fails while a copy
   differs from what tools/gen-v2-css.mjs would write from today's app.css. Fix: node tools/gen-v2-css.mjs */
import { describe, it, expect } from 'vitest';
import { COPIES, expected, read } from '../../../../../../tools/gen-v2-css.mjs';

describe("v2's copies of main's CSS match app.css (mw15)", () => {
  for (const rel of Object.keys(COPIES)) {
    it(`${rel} is current (else: node tools/gen-v2-css.mjs)`, () => {
      expect(read(rel) === expected(rel)).toBe(true);
    });
  }

  it('bites: a fix main makes in its Scripture Web block leaves the copy stale', () => {
    const app = read('app.css');
    const fixed = app.replace(/(\.sw-fallback-row \{)/, '.sw-mw15-bite { color: red; }\n$1');
    expect(fixed).not.toBe(app);
    const want = expected('src/v2/scripture-web.css', fixed);
    expect(want).toContain('.sw-mw15-bite');
    expect(read('src/v2/scripture-web.css') === want).toBe(false);
  });
});
