// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* THE READ FORM (search200 wave 3 red team, 2026-10-23). index.html declares TRANSLATION_OPTIONS with a top-level
   `const`: a global binding, never a property of window or globalThis (SettingsScreen.editiondesc.test.jsx holds the
   same line for the picker). Read off globalThis, the registry is always absent in the app, so a sparse overlay's base
   is never checked there: KJV-R on the phone without the KJV it falls back to was built as KJV-R while the reader
   showed NKJV. Every harness (search-follows-shown-edition.test.js) installs the registry as a property, so only the source can show the form. */
describe('shownEdition reads the edition registry as the page declares it', () => {
  const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'engine.js'), 'utf8');
  const body = (SRC.split('function shownEdition(')[1] || '').split('\n}\n')[0];

  it('CONTROL: the function is there and checks an overlay base', () => {
    expect(body).toContain('base');
    expect(body).toContain("'BIBLE_'");
  });

  it('reads TRANSLATION_OPTIONS as a free variable first', () => {
    expect(body).toContain('typeof TRANSLATION_OPTIONS');
  });
});
