// @ts-nocheck
// The app map fix list's wording entries for the shell sheets (lane fix-ui-b, 2026-11-26): each reads the source line
// the reader sees, so the old words cannot come back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(resolve(here, f), 'utf8');

describe('#22 Link to… hints name the chips the reader sees', () => {
  it('says Inside the text and Titles and references, never Full text or Titles & refs', () => {
    const s = src('LinkPicker.jsx').split('\n').filter((l) => l.includes('navpick-empty-hint')).join('\n');
    expect(s).not.toMatch(/Full text/);
    expect(s).not.toMatch(/Titles &amp; refs|Titles & refs/);
    expect(s).toMatch(/Inside the text/);
    expect(s).toMatch(/Titles and references/);
  });
});
