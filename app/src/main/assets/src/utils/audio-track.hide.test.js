// @ts-nocheck — evaluates the generated manifest script via node fs/path/url,
// same house pattern as audio-track.editions.test.js.

/* An edition whose assets are NOT on the release is offered nowhere.
   ─────────────────────────────────────────────────────────────────────
   2026-09-12: tsot-matthew's 28 chapters (Drive ids, declared releaseTag
   audio-v1) are not on audio-v1 — every one of them 404s live. The edition
   stays in the registry and its 28 rows stay in the manifest (the alignment,
   the read-along and the release plan are all keyed on them); what changes is
   that ONE flag on the registry entry, `unreleased: true`, takes it out of
   every door at once:

     the Listening Library's shelf      AudioLibraryScreen.test.jsx
     the desk's Voice chips             AudioManagerSheet.test.jsx
     Settings' Bible Audio picker       SettingsScreen.hidden-edition.test.jsx
     the Listen pill's resolver         here (resolveBibleAudio)
     the desk→settings bridge           screen-routes.bibleaudio.test.jsx

   through ONE predicate, bibleAudioOffered(). Two definitions that must agree
   is the root, so every door imports the predicate and none re-reads the flag.
   The re-enable is deleting the flag line; the counts below then move by one
   and say so beside each number.

   Every function is read off the module object rather than imported by name so
   this file LOADS on the base tree and fails as a RED there, not as an import
   error wearing a RED's colour. */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as AT from './audio-track.js';

const { BIBLE_AUDIO_EDITIONS, BIBLE_AUDIO_DEFAULT, resolveBibleAudio } = AT;
const offered = AT.bibleAudioOffered;

const HERE = dirname(fileURLToPath(import.meta.url));
/* The manifest is a classic script (var + IIFE), not a module: evaluate the
   REAL generated file into a local, never a hand copy of its rows. */
const MANIFEST_SRC = readFileSync(join(HERE, '..', 'data', 'bible-audio-manifest.js'), 'utf8');
const manifestCtx = {};
new Function('ctx', `with (ctx) { ${MANIFEST_SRC}; ctx.M = BIBLE_AUDIO_MANIFEST; }`)(manifestCtx);
const MANIFEST = manifestCtx.M;

const HIDDEN_TODAY = ['tsot-matthew'];

describe('bibleAudioOffered — the one predicate every door asks', () => {
  it('exists, and reads absence as offered and the flag as hidden', () => {
    expect(typeof offered, 'audio-track.js must export bibleAudioOffered').toBe('function');
    expect(offered({ volKey: 'bible-x' })).toBe(true);           // absence IS the fact
    expect(offered({ volKey: 'bible-x', unreleased: true })).toBe(false);
    expect(offered(null)).toBe(false);                            // no edition is not an offered one
  });

  it('the registry today: five editions, exactly one of them hidden (tsot-matthew, 2026-09-12)', () => {
    expect(Object.keys(BIBLE_AUDIO_EDITIONS)).toHaveLength(5);
    const hidden = Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, e]) => !offered(e)).map(([id]) => id);
    // When the mirror lands and the flag line is deleted this reads [] — and
    // the door cases in the four files above go vacuous with it: delete
    // HIDDEN_TODAY and them together, or flag the next unreleased edition.
    expect(hidden).toEqual(HIDDEN_TODAY);
  });

  it('the flag is absent or exactly true — the re-enable is a deletion, never a false left behind', () => {
    for (const [id, e] of Object.entries(BIBLE_AUDIO_EDITIONS)) {
      expect([true, undefined], `edition ${id}: unreleased`).toContain(e.unreleased);
    }
  });

  it('CONTROL (green on the base tree by design): the hidden edition keeps its 28 manifest rows', () => {
    // The hide is a door change, not a data change — the rows are what the
    // alignment and the re-enable rest on. This case pins what must NOT move.
    expect(MANIFEST['bible-tsot-matthew:matthew']).toHaveLength(28);
    expect(Object.keys(MANIFEST)).toHaveLength(200);
  });
});

describe('resolveBibleAudio — a hidden selection stands in as the default', () => {
  afterEach(() => { delete globalThis.BIBLE_AUDIO_MANIFEST; });

  it('on a book the hidden edition CARRIES, the pill offers the default, not the hidden edition', () => {
    // The real manifest carries Matthew for tsot, so the per-book fallback
    // alone would keep offering it — only the flag can take it away.
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    expect(MANIFEST['bible-tsot-matthew:matthew'], 'fixture: the row exists').toBeTruthy();
    const { offer } = resolveBibleAudio({ settings: { bibleAudio: 'tsot-matthew' }, bookId: 'matthew' });
    expect(offer).toBe(BIBLE_AUDIO_EDITIONS[BIBLE_AUDIO_DEFAULT]);
  });

  it('CONTROL: an offered selection on a book it carries is unchanged, and off is still off', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    expect(resolveBibleAudio({ settings: { bibleAudio: 'wop-nkjv' }, bookId: 'matthew' }).offer)
      .toBe(BIBLE_AUDIO_EDITIONS['wop-nkjv']);
    expect(resolveBibleAudio({ settings: { bibleAudio: 'web-ebible' }, bookId: 'genesis' }).offer)
      .toBe(BIBLE_AUDIO_EDITIONS['web-ebible']);
    expect(resolveBibleAudio({ settings: { bibleAudio: 'off' }, bookId: 'matthew' }).offer).toBeNull();
  });

  it('and the stand-in still yields to the per-book rule: a book the default lacks offers nothing', () => {
    // A manifest where the default carries no Matthew: the hidden selection
    // becomes the default first, then the default's own per-book check runs.
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-tsot-matthew:matthew': MANIFEST['bible-tsot-matthew:matthew'] };
    expect(resolveBibleAudio({ settings: { bibleAudio: 'tsot-matthew' }, bookId: 'matthew' }).offer).toBeNull();
  });

  it('paint is untouched: a playing track still names the edition its key proves', () => {
    // paint answers "which recording is playing", a fact about the track, and
    // hiding a door must not blind the wash to a recording already on the queue.
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    const [id] = MANIFEST['bible-tsot-matthew:matthew'][0];
    const track = { key: 'bible-tsot-matthew:matthew', url: 'https://x/' + id + '.mp3' };
    expect(resolveBibleAudio({ track }).paint).toBe(BIBLE_AUDIO_EDITIONS['tsot-matthew']);
  });
});
