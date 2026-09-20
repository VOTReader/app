// @ts-nocheck
/* "OPEN THE READING" ON A WTLB COMPILATION (2026-09-20). hasTextDestination keyed off track.key, and a section
   track's key is null — the desk hid the button for the one queue that most needs it (two hours, many letters).
   textKeyOf answers the letter under the clock for the CURRENT section track (the player's sectionLetterKeyAt),
   the section's opening letter during the intro silence, and the string key for everything else. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hasTextDestination, textKeyOf } from './AudioShelf.jsx';

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const PART1 = { key: null, title: 'Part 1 · Intro–19', sub: 'Words To Live By: Part One', url: URL_OF('1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g'), readerCode: 'V', partLabel: null };

beforeEach(() => {
  globalThis.COL_BY_KEY = new Map([['wtlb1', { volKey: 'wtlb1', letterScreen: 'wtlb-one-entry' }]]);
  globalThis.AUDIO_SECTIONS = { wtlb1: [['Part 1 · Intro–19', '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g', 'V']] };
  globalThis.AUDIO_SYNC_SECTIONS = { '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g': { 'wtlb1:introduction': [[4.2, 0, -1, -1, 0]], 'wtlb1:come-love-awaits-you': [[61.0, 0, 0, 54, 0]] } };
});
afterEach(() => { delete globalThis.COL_BY_KEY; delete globalThis.AUDIO_SECTIONS; delete globalThis.AUDIO_SYNC_SECTIONS; });

describe('textKeyOf / hasTextDestination — section tracks', () => {
  it('a keyed track is its own key; a section track not playing opens at its first letter', () => {
    expect(textKeyOf({ key: 'wtlb1:the-only-way', url: URL_OF('x') })).toBe('wtlb1:the-only-way');
    expect(textKeyOf(PART1)).toBe('wtlb1:introduction');
    expect(hasTextDestination(PART1)).toBe(true);
  });
  it('a section track with no table yet has no destination (the tap stays inert, as before)', () => {
    delete globalThis.AUDIO_SYNC_SECTIONS;
    expect(textKeyOf(PART1)).toBe(null);
    expect(hasTextDestination(PART1)).toBe(false);
  });
});
