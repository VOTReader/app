/* app-css.settings-root-wrap.test.js — Settings' first screen wraps a group's name instead of cutting it short.
   jsdom computes no layout; the before/after shots are the proof on screen, this keeps the rule. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe("Settings' first screen keeps every group's name whole", () => {
  it('row titles and lines on the Settings root wrap at their spaces, at every text size', () => {
    const m = CSS.match(/(^|[}\s])\.ws1-settings\.is-root :is\(\.ui-row-title, \.ui-row-meta\)\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m[2]).toMatch(/white-space:\s*normal/);
    expect(m[2]).toMatch(/overflow-wrap:\s*break-word/);
  });
});
