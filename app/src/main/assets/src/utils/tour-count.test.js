// @ts-nocheck — reads scripture-web-data.js and tour-steps.js from disk through node:fs, which has no
// types under this tsconfig (the sw-register / update-toast precedent). The type-checked half of the
// count's proof is in tour-steps.test.js.
/* THE TOUR'S COUNT IS READ, NEVER TYPED (w-tour-copy, 2026-09-11). tools/gen-scripture-web.mjs
   writes utils/scripture-web/famous-count.js in the same run as the data, by the screen's own law
   (graphStats: the sum of every bucket's off10). Two legs live here because they read files:
   (b) the generated count equals the committed data's Famous count — computed from
       src/data/scripture-web-data.js on disk, not from a second copy of the law's answer;
   (c) the digits appear nowhere in tour-steps.js, raw or formatted, and the placeholder + the import
       are what the source carries (the positive on the same file). */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SCRIPTURE_WEB_FAMOUS_COUNT } from './scripture-web/famous-count.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const COUNT = SCRIPTURE_WEB_FAMOUS_COUNT.toLocaleString();

describe('the tour\'s Scripture Web count is generated beside the data and never typed', () => {
  it('the generated count is the committed data\'s Famous count under the screen\'s law (sum of off10)', () => {
    const src = fs.readFileSync(resolve(HERE, '../data/scripture-web-data.js'), 'utf8');
    const at = src.indexOf('var SCRIPTURE_WEB_DATA = ');
    expect(at, 'the data file declares SCRIPTURE_WEB_DATA').toBeGreaterThan(0);
    const data = JSON.parse(src.slice(at + 'var SCRIPTURE_WEB_DATA = '.length).replace(/;\s*$/, ''));
    expect(data.buckets.length, 'buckets').toBeGreaterThan(0);
    const famous = data.buckets.reduce((n, b) => n + b.off10, 0);
    expect(famous).toBe(SCRIPTURE_WEB_FAMOUS_COUNT);
    expect(famous).toBe(data.count);   // today every shipped thread is Famous; if that ever changes, the law above still rules
  });

  it('the count\'s digits are not typed anywhere in tour-steps.js (raw or formatted)', () => {
    const src = fs.readFileSync(resolve(HERE, 'tour-steps.js'), 'utf8');
    expect(src, 'raw digits').not.toContain(String(SCRIPTURE_WEB_FAMOUS_COUNT));
    expect(src, 'formatted').not.toContain(COUNT);
    expect(src, 'the placeholder is what the source carries').toContain('{COUNT}');
    // and the positive on the same file: the module that supplies it is imported
    expect(src).toMatch(/from '\.\/scripture-web\/famous-count\.js'/);
  });
});
