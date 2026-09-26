// @ts-nocheck -- reads the Holy Days corpus through node's fs + vm
/* hl-keys — the Holy Days key space.
 *
 * screen-routes.jsx sends a Holy Days entry whose type is 'wtlb' to
 * WtlbEntryView (hl-keys wtlb:<id>:<n>) and every other one to LetterView
 * (letter:<id>:<n>). A link endpoint has to be keyed the way its reader paints,
 * or the chain icon never shows and a tap cannot scroll to the picked block.
 * HOLY_DAYS_LETTER_IDS is written out by hand because LinkStore repairs saved
 * links before the corpus has loaded; this suite holds it to the corpus. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { HOLY_DAYS_LETTER_IDS, entryHlBase } from './hl-keys.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function holyDays() {
  const ctx = {};
  runInNewContext(readFileSync(resolve(HERE, '..', 'data', 'holy-days.js'), 'utf8'), ctx);
  return ctx.HOLY_DAYS;
}

describe('HOLY_DAYS_LETTER_IDS', () => {
  it('names exactly the Holy Days entries LetterView renders', () => {
    const fromCorpus = holyDays().filter((e) => e.type !== 'wtlb').map((e) => e.id).sort();
    expect(fromCorpus.length).toBeGreaterThan(0);
    expect([...HOLY_DAYS_LETTER_IDS].sort()).toEqual(fromCorpus);
  });
});

describe('entryHlBase', () => {
  it('keys a block-shaped Holy Days entry letter:, as LetterView paints it', () => {
    expect(entryHlBase('holy-days', 'unleavened')).toBe('letter:unleavened');
    expect(entryHlBase('holy-days', 'atonement')).toBe('letter:atonement');
  });

  it('keys a paragraph-shaped Holy Days entry wtlb:, as WtlbEntryView paints it', () => {
    expect(entryHlBase('holy-days', 'the-holy-days')).toBe('wtlb:the-holy-days');
  });

  it('keeps WTLB, Blessed and Answers on wtlb:, even for an id Holy Days also uses', () => {
    // "devotion" is a block-shaped Holy Days entry AND a WTLB One entry.
    expect(entryHlBase('wtlb', 'devotion')).toBe('wtlb:devotion');
    expect(entryHlBase('holy-days', 'devotion')).toBe('letter:devotion');
    expect(entryHlBase('blessed', 'unleavened')).toBe('wtlb:unleavened');
  });
});
