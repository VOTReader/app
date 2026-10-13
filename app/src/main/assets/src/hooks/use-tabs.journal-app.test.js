// @ts-nocheck — reads app.jsx source (node fs), like translations.test.js.
/* W40 (sweep 2026-10-13): App() must take journalEntryId from the active tab
   (tabField), not one app-wide useState: the app-wide value showed tab B's
   journal entry in tab A's viewer. App() has no render harness, so this pins
   the wiring; use-tabs.test.js pins the per-tab behaviour. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('App() journalEntryId wiring (W40)', () => {
  it('reads journalEntryId from tabField, not an app-wide useState', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app.jsx'), 'utf8');
    expect(src).toMatch(/const \[journalEntryId, setJournalEntryId\] = tabField\('journalEntryId'\);/);
    expect(src).not.toMatch(/\[journalEntryId, setJournalEntryId\] = useState\(/);
  });
});
