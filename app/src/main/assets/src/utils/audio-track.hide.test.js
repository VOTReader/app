// @ts-nocheck — evaluates the generated manifest script via node fs/path/url,
// same house pattern as audio-track.editions.test.js.

/* An edition whose assets are NOT on the release is offered nowhere.
   ─────────────────────────────────────────────────────────────────────
   2026-09-12: tsot-matthew's 28 chapters (Drive ids, declared releaseTag
   audio-v1) were not on audio-v1 — every one of them 404ed live. The edition
   stayed in the registry and its 28 rows stayed in the manifest (the
   alignment, the read-along and the release plan are all keyed on them); ONE
   flag on the registry entry, `unreleased: true`, took it out of every door
   at once:

     the Listening Library's shelf      AudioLibraryScreen.test.jsx
     the desk's Voice chips             AudioManagerSheet.test.jsx
     Settings' Bible Audio picker       SettingsScreen.hidden-edition.test.jsx
     the Listen pill's resolver         here (resolveBibleAudio)
     the desk→settings bridge           screen-routes.bibleaudio.test.jsx

   through ONE predicate, bibleAudioOffered(). Two definitions that must agree
   is the root, so every door imports the predicate and none re-reads the flag.

   2026-09-13: the mirror landed (28 of 28 on audio-v1) and the flag line is
   deleted — the re-enable. The door cases INVERT with it: each now reads the
   edition offered at its door, so the flag's return reddens all of them; the
   registry walk reads nothing hidden; the never-false pin is what forbids the
   other way to re-enable (`unreleased: false`) — it is the ONLY case that
   catches that edit, bitten to prove it. What is dormant on this registry:
   the filter at the shelf, the chips, the resolver's stand-in and the bridge
   is exercised by no entry (their unfiltered forms would pass every case
   here); the predicate's unit case below and the synthetic-registry Settings
   case (SettingsScreen.hidden-edition.test.jsx) are the live witnesses of
   the rule until the next unreleased edition flags itself.

   Every function is read off the module object rather than imported by name so
   this file LOADS on the base tree and fails as a RED there, not as an import
   error wearing a RED's colour. */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as AT from './audio-track.js';

const { BIBLE_AUDIO_EDITIONS, resolveBibleAudio } = AT;
const offered = AT.bibleAudioOffered;

const HERE = dirname(fileURLToPath(import.meta.url));
/* The manifest is a classic script (var + IIFE), not a module: evaluate the
   REAL generated file into a local, never a hand copy of its rows. */
const MANIFEST_SRC = readFileSync(join(HERE, '..', 'data', 'bible-audio-manifest.js'), 'utf8');
const manifestCtx = {};
new Function('ctx', `with (ctx) { ${MANIFEST_SRC}; ctx.M = BIBLE_AUDIO_MANIFEST; }`)(manifestCtx);
const MANIFEST = manifestCtx.M;

const HIDDEN_TODAY = [];                       // tsot-matthew mirrored 2026-09-13

describe('bibleAudioOffered — the one predicate every door asks', () => {
  it('exists, and reads absence as offered and the flag as hidden', () => {
    expect(typeof offered, 'audio-track.js must export bibleAudioOffered').toBe('function');
    expect(offered({ volKey: 'bible-x' })).toBe(true);           // absence IS the fact
    expect(offered({ volKey: 'bible-x', unreleased: true })).toBe(false);
    expect(offered(null)).toBe(false);                            // no edition is not an offered one
  });

  it('the registry today: five editions, none of them hidden (tsot-matthew mirrored 2026-09-13)', () => {
    expect(Object.keys(BIBLE_AUDIO_EDITIONS)).toHaveLength(5);
    const hidden = Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, e]) => !offered(e)).map(([id]) => id);
    // The next unreleased edition goes into HIDDEN_TODAY with its flag, and
    // the door cases in the four files above invert back with it.
    expect(hidden).toEqual(HIDDEN_TODAY);
    expect(offered(BIBLE_AUDIO_EDITIONS['tsot-matthew'])).toBe(true);
  });

  it('the flag is absent or exactly true — the re-enable is a deletion, never a false left behind (the only case an `unreleased: false` reddens)', () => {
    for (const [id, e] of Object.entries(BIBLE_AUDIO_EDITIONS)) {
      expect([true, undefined], `edition ${id}: unreleased`).toContain(e.unreleased);
    }
  });

  it('CONTROL (green on both trees by design): the edition keeps its 28 manifest rows', () => {
    // The hide and the re-enable are door changes, not data changes — the rows
    // are what the alignment rests on. This case pins what must NOT move.
    expect(MANIFEST['bible-tsot-matthew:matthew']).toHaveLength(28);
    expect(Object.keys(MANIFEST)).toHaveLength(200);
  });
});

describe('resolveBibleAudio — the Listen pill offers the edition the reader chose again', () => {
  afterEach(() => { delete globalThis.BIBLE_AUDIO_MANIFEST; });

  it('on matthew, a reader who chose tsot-matthew is offered tsot-matthew — not the default it stood in for', () => {
    // Same fixture as the hide's case, inverted: the real manifest carries
    // Matthew for tsot, so only the flag could take the offer away, and the
    // flag is gone. A reader whose persisted choice rode out the hide as
    // 'tsot-matthew' hears it again without touching Settings.
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    expect(MANIFEST['bible-tsot-matthew:matthew'], 'fixture: the row exists').toBeTruthy();
    const { offer } = resolveBibleAudio({ settings: { bibleAudio: 'tsot-matthew' }, bookId: 'matthew' });
    expect(offer).toBe(BIBLE_AUDIO_EDITIONS['tsot-matthew']);
  });

  it('CONTROL: an offered selection on a book it carries is unchanged, and off is still off', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    expect(resolveBibleAudio({ settings: { bibleAudio: 'wop-nkjv' }, bookId: 'matthew' }).offer)
      .toBe(BIBLE_AUDIO_EDITIONS['wop-nkjv']);
    expect(resolveBibleAudio({ settings: { bibleAudio: 'web-ebible' }, bookId: 'genesis' }).offer)
      .toBe(BIBLE_AUDIO_EDITIONS['web-ebible']);
    expect(resolveBibleAudio({ settings: { bibleAudio: 'off' }, bookId: 'matthew' }).offer).toBeNull();
  });

  it('and the per-book rule runs on the CHOSEN edition: where only tsot carries Matthew, a tsot reader is offered tsot', () => {
    // A manifest where the default carries no Matthew. Under the hide this
    // read null (the stand-in became the default, then failed its own
    // per-book check); with the edition offered, the default's gap is not
    // the reader's problem.
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-tsot-matthew:matthew': MANIFEST['bible-tsot-matthew:matthew'] };
    expect(resolveBibleAudio({ settings: { bibleAudio: 'tsot-matthew' }, bookId: 'matthew' }).offer)
      .toBe(BIBLE_AUDIO_EDITIONS['tsot-matthew']);
  });

  it('CONTROL (green on both trees): paint names the edition a playing track\'s key proves', () => {
    // paint answers "which recording is playing", a fact about the track; it
    // never asked the flag, so it reads the same with the flag and without.
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    const [id] = MANIFEST['bible-tsot-matthew:matthew'][0];
    const track = { key: 'bible-tsot-matthew:matthew', url: 'https://x/' + id + '.mp3' };
    expect(resolveBibleAudio({ track }).paint).toBe(BIBLE_AUDIO_EDITIONS['tsot-matthew']);
  });
});
