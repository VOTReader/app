// @ts-nocheck
// Fix list #1: every caller of the Safari 7-day gate hands it the gesture, so the
// reader's first save runs once the warning is answered instead of being dropped.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('safari 7-day gate callers hand over their gesture', () => {
  it.each([
    'ui/sheets/SelectionToolbar.jsx',
    'ui/components/ChapterBookmarkBtn.jsx',
    'hooks/use-journal-mutations.js',
  ])('%s passes a resume to checkFirstDataCreation', (rel) => {
    const src = readFileSync(resolve(SRC, rel), 'utf8');
    expect(src).toMatch(/checkFirstDataCreation\(/);
    expect(src).not.toMatch(/checkFirstDataCreation\(\)/);
  });
});
