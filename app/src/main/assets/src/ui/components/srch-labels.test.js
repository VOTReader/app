// @ts-nocheck — reads the shipped index.html as text
/* The search labels that index.html's inline script defines (SRCH_KIND_LABEL, SRCH_GROUP_META): the reader sees
   "Words To Live By", never the code "WTLB" (half-baked 7). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../index.html'), 'utf8');
const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

describe('search labels', () => {
  it('spell out Words To Live By in the kind badges and the group headers', () => {
    const kinds = block('const SRCH_KIND_LABEL', '};');
    const groups = block('const SRCH_GROUP_META', '};');
    expect(kinds).toMatch(/'wtlb': \{ label: 'Words To Live By'/);
    expect(kinds).toMatch(/'wtlb-title': \{ label: 'Words To Live By'/);
    expect(groups).toMatch(/'wtlb1': \{ label: 'Words To Live By · Part One'/);
    expect(groups).toMatch(/'wtlb2': \{ label: 'Words To Live By · Part Two'/);
    expect(kinds + groups).not.toMatch(/WTLB/);
  });
});
