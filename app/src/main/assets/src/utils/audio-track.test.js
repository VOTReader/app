// @ts-nocheck
/* audio-track — the release-URL trust boundary.

   A frozen list of immutable GitHub releases is the ONLY set of hosts a
   persisted or played track may point at: audio-v1 (letters), the per-chapter
   Bible editions on their OT/NT tag pairs, and audio-bible-v1 (the retired
   whole-book Bible tracks, kept live forever for saved recordings). These
   tests pin that boundary — an imported favorite or a widened prefix must
   never turn the app into a generic remote loader. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  AUDIO_RELEASE_PREFIX,
  AUDIO_BIBLE_RELEASE_PREFIX,
  AUDIO_WOP_OT_PREFIX,
  AUDIO_WOP_NT_PREFIX,
  AUDIO_BRM_OT_PREFIX,
  AUDIO_WEB_OT_PREFIX,
  AUDIO_WEB_NT_PREFIX,
  AUDIO_BRM_NT_PREFIX,
  AUDIO_READERS,
  BIBLE_AUDIO_EDITIONS,
  audioAssetUrl,
  audioReaderLabel,
  bibleAudioAssetUrl,
  bibleEditionOfAsset,
  bibleAudioEdition,
  displayPartLabel,
  isVotAudioUrl,
  normalizeAudioTrack,
  resolveBibleAudio,
  bibleReleaseTagFor,
} from './audio-track.js';

/* The shipped manifest, run rather than restated (classic var + IIFE), and
   held in a LOCAL. It used to be published on globalThis, where the
   resolveBibleAudio block's afterEach deletes it — so the invariant below
   passed when run alone and failed in file order, which is the worst way for
   a gate to be wrong. A gate owns its data; it does not inherit it from
   another block's setup. */
const SHIPPED_MANIFEST = (() => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const SRC = readFileSync(join(HERE, '..', 'data', 'bible-audio-manifest.js'), 'utf8');
  const box = {};
  new Function('g', SRC + ';g.out = BIBLE_AUDIO_MANIFEST;')(box);
  return box.out;
})();

describe('audio-track — release URL policy', () => {
  it('builds letter and Bible asset URLs on their own release tags', () => {
    expect(audioAssetUrl('abc123')).toBe(AUDIO_RELEASE_PREFIX + 'abc123.mp3');
    expect(bibleAudioAssetUrl('brm-kjv_genesis')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3');
  });

  it('rejects malformed asset ids in both builders', () => {
    for (const bad of ['', '  ', 'a/b', 'a?x=1', 'a b', 'a.mp3', null, undefined, 42]) {
      expect(audioAssetUrl(bad)).toBe('');
      expect(bibleAudioAssetUrl(bad)).toBe('');
    }
  });

  it('accepts exactly the frozen release prefixes, nothing else', () => {
    expect(isVotAudioUrl(AUDIO_RELEASE_PREFIX + 'idA1.mp3')).toBe(true);
    expect(isVotAudioUrl(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3')).toBe(true);
    expect(isVotAudioUrl('https://github.com/VOTReader/votreader-assets/releases/download/audio-v2/x.mp3')).toBe(false);
    expect(isVotAudioUrl('https://evil.example/audio-v1/x.mp3')).toBe(false);
    expect(isVotAudioUrl(AUDIO_BIBLE_RELEASE_PREFIX + '../escape.mp3')).toBe(false);
    expect(isVotAudioUrl(AUDIO_BIBLE_RELEASE_PREFIX + 'x.ogg')).toBe(false);
    expect(isVotAudioUrl(AUDIO_BIBLE_RELEASE_PREFIX)).toBe(false);
  });

  it('normalizeAudioTrack accepts a Bible release track (Listening Library parity)', () => {
    const t = normalizeAudioTrack({
      key: 'bible-brm-kjv:genesis',
      title: 'Genesis',
      sub: 'KJV · Biblical Restoration Ministries',
      url: AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3',
      readerCode: '',
    });
    expect(t).not.toBe(null);
    expect(t.url).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3');
    expect(normalizeAudioTrack({ title: 'x', url: 'https://evil.example/a.mp3' })).toBe(null);
  });
});

describe('audio-track — Bible edition registry', () => {
  it('resolves known editions and rejects off/unknown', () => {
    const ed = bibleAudioEdition('brm-kjv');
    expect(ed).toBe(BIBLE_AUDIO_EDITIONS['brm-kjv']);
    expect(ed.volKey).toBe('bible-brm-kjv');
    expect(ed.translation).toBe('kjv');
    expect(bibleAudioEdition('off')).toBe(null);
    expect(bibleAudioEdition('nope')).toBe(null);
    expect(bibleAudioEdition(undefined)).toBe(null);
    // Prototype names must not resolve (settings values are import-restorable).
    expect(bibleAudioEdition('toString')).toBe(null);
  });

  it('every edition volKey routes to the Bible release namespace', () => {
    for (const ed of Object.values(BIBLE_AUDIO_EDITIONS)) {
      expect(ed.volKey.startsWith('bible-')).toBe(true);
    }
  });
});

describe('audio-track — Word of Promise release routing', () => {
  it('routes wop1_/wop2_ assets to their testament tags, and a whole-book id to its own', () => {
    expect(bibleAudioAssetUrl('wop1_jeremiah_013')).toBe(AUDIO_WOP_OT_PREFIX + 'wop1_jeremiah_013.mp3');
    expect(bibleAudioAssetUrl('wop2_matthew_001')).toBe(AUDIO_WOP_NT_PREFIX + 'wop2_matthew_001.mp3');
    expect(bibleAudioAssetUrl('brm-kjv_genesis')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3');
  });

  it('accepts both wop release prefixes in the trust boundary', () => {
    expect(isVotAudioUrl(AUDIO_WOP_OT_PREFIX + 'wop1_jonah_001.mp3')).toBe(true);
    expect(isVotAudioUrl(AUDIO_WOP_NT_PREFIX + 'wop2_jude_001.mp3')).toBe(true);
    expect(isVotAudioUrl('https://github.com/VOTReader/votreader-assets/releases/download/audio-wop-v3/x.mp3')).toBe(false);
  });

  it('wop-nkjv edition resolves from settings', () => {
    const ed = bibleAudioEdition('wop-nkjv');
    expect(ed.volKey).toBe('bible-wop-nkjv');
    expect(ed.translation).toBe('nkjv');
  });
});

/* BRM KJV moved from 66 whole-book tracks to 1,189 per-chapter files on
   2026-08-09. Both shapes must resolve forever: the new asset ids stream from
   the brm tag pair, and the ids already sitting in saved recordings + resume
   snapshots keep pointing at audio-bible-v1, which is append-only for good. */
describe('audio-track — BRM per-chapter routing beside the permanent legacy tag', () => {
  it('routes brm1_/brm2_ assets to their testament tags', () => {
    expect(bibleAudioAssetUrl('brm1_genesis_037')).toBe(AUDIO_BRM_OT_PREFIX + 'brm1_genesis_037.mp3');
    expect(bibleAudioAssetUrl('brm2_revelation_022')).toBe(AUDIO_BRM_NT_PREFIX + 'brm2_revelation_022.mp3');
  });

  it('legacy whole-book <editionId>_<book> ids route to audio-bible-v1 by NAME', () => {
    // 'brm-kjv_' shares three characters with 'brm1_' and is still not captured
    // by the stamp routing. What changed is that it is now matched POSITIVELY
    // against the registry rather than being the fall-through: 'brm-kjv' is an
    // edition id, so '<it>_<book>' is a known shape and keeps its original host,
    // byte-identical. A name belonging to no edition at all now returns '' —
    // the case below.
    expect(bibleAudioAssetUrl('brm-kjv_genesis')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3');
    expect(bibleAudioAssetUrl('brm-kjv_revelation')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_revelation.mp3');
    expect(bibleAudioAssetUrl('wop-nkjv_john')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'wop-nkjv_john.mp3');
  });

  it('both brm tags join the trust boundary, and the legacy tag keeps its place', () => {
    expect(isVotAudioUrl(AUDIO_BRM_OT_PREFIX + 'brm1_genesis_001.mp3')).toBe(true);
    expect(isVotAudioUrl(AUDIO_BRM_NT_PREFIX + 'brm2_jude_001.mp3')).toBe(true);
    expect(isVotAudioUrl(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3')).toBe(true);
    expect(isVotAudioUrl('https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v3/x.mp3')).toBe(false);
  });

  it('a saved whole-book recording still normalizes after the switch', () => {
    // The Listening Library holds these URLs; the migration must never be the
    // reason a saved recording stops being playable.
    const t = normalizeAudioTrack({
      key: 'bible-brm-kjv:genesis',
      title: 'Genesis',
      sub: 'KJV · Biblical Restoration Ministries',
      url: AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3',
      readerCode: '',
    });
    expect(t).not.toBe(null);
    expect(t.url).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3');
  });
});

describe('audio-track — WEB (third edition) routing', () => {
  it('routes web1_/web2_ to their tags and trusts both prefixes', () => {
    expect(bibleAudioAssetUrl('web1_genesis_001')).toBe(AUDIO_WEB_OT_PREFIX + 'web1_genesis_001.mp3');
    expect(bibleAudioAssetUrl('web2_jude_001')).toBe(AUDIO_WEB_NT_PREFIX + 'web2_jude_001.mp3');
    expect(isVotAudioUrl(AUDIO_WEB_OT_PREFIX + 'web1_psalms_117.mp3')).toBe(true);
    expect(isVotAudioUrl('https://github.com/VOTReader/votreader-assets/releases/download/audio-web-v3/x.mp3')).toBe(false);
  });

  it('web-ebible edition resolves from settings', () => {
    const ed = bibleAudioEdition('web-ebible');
    expect(ed.volKey).toBe('bible-web');
    expect(ed.translation).toBe('web');
  });
});

/* The desk's Voice chips need a name short enough for a 44px chip row, and
   Settings needs the reader names without importing the player. Both read
   registries that live here, so neither surface carries its own string list. */
describe('audio-track — display registries the listening UI renders from', () => {
  it('every edition carries a short chip label led by its translation code', () => {
    expect(BIBLE_AUDIO_EDITIONS['brm-kjv'].short).toBe('KJV · BRM');
    expect(BIBLE_AUDIO_EDITIONS['wop-nkjv'].short).toBe('NKJV · Dramatized');
    expect(BIBLE_AUDIO_EDITIONS['web-ebible'].short).toBe('WEB');
    for (const ed of Object.values(BIBLE_AUDIO_EDITIONS)) {
      expect(ed.short.length).toBeLessThanOrEqual(ed.label.length);
      expect(ed.short.toUpperCase().indexOf(ed.translation.toUpperCase())).toBe(0);
    }
  });

  it('names every reader code and refuses anything else', () => {
    expect(Object.keys(AUDIO_READERS)).toEqual(['B', 'T', 'V', 'M']);
    expect(audioReaderLabel('B')).toBe('Read by Benjamin');
    expect(audioReaderLabel('M')).toBe('AI reading with music');
    expect(audioReaderLabel('Z')).toBe(null);
    expect(audioReaderLabel('')).toBe(null);
    expect(audioReaderLabel(undefined)).toBe(null);
    // Same rule as the edition registry: a prototype name is not a reader.
    expect(audioReaderLabel('toString')).toBe(null);
  });

  it('publishes both registries as globals for the classic-script screens', () => {
    expect(globalThis.BIBLE_AUDIO_EDITIONS).toBe(BIBLE_AUDIO_EDITIONS);
    expect(globalThis.AUDIO_READERS).toBe(AUDIO_READERS);
  });
});

/* A per-chapter Bible edition titles each track by its chapter (C2-A/A4) and
   still labels its part "Chapter N" — the authoritative chapter every consumer
   parses. The mini-player bar and the listening desk therefore printed the
   number twice in one glance ("Genesis 2 · Chapter 2"). displayPartLabel is the
   display rule that stops the echo, and ONLY the echo. */
describe('audio-track — displayPartLabel (the title-unique rule)', () => {
  it('suppresses a chapter label the title already ends with', () => {
    expect(displayPartLabel('Genesis 2', 'Chapter 2')).toBe(null);
    expect(displayPartLabel('Psalms 117', 'Chapter 117')).toBe(null);
    expect(displayPartLabel('1 Kings 3', 'Chapter 3')).toBe(null);
  });

  it('keeps a chapter label the title does NOT end with', () => {
    // The trap the rule is built for: a naive "endsWith" would eat this one.
    expect(displayPartLabel('Genesis 12', 'Chapter 2')).toBe('Chapter 2');
    expect(displayPartLabel('Genesis', 'Chapter 2')).toBe('Chapter 2');
    expect(displayPartLabel('Jude', 'Chapter 1')).toBe('Chapter 1');
    expect(displayPartLabel('2 John', 'Chapter 2')).toBe('Chapter 2');
  });

  it('never touches a label that is not a chapter', () => {
    expect(displayPartLabel('The Wide Path', 'Part 1')).toBe('Part 1');
    expect(displayPartLabel('The Wide Path 2', 'Part 2')).toBe('Part 2');
    expect(displayPartLabel('Recompense', 'Addendum')).toBe('Addendum');
  });

  it('answers null for the tracks that carry no label at all', () => {
    expect(displayPartLabel('The Seventh Day', null)).toBe(null);
    expect(displayPartLabel('The Seventh Day', '')).toBe(null);
    expect(displayPartLabel('The Seventh Day', undefined)).toBe(null);
    expect(displayPartLabel(null, 'Chapter 2')).toBe('Chapter 2');
  });
});

/* resolveBibleAudio — one function, two outputs, computed from DIFFERENT
   inputs, and neither is ever used for the other (Architect, §6).

     offer = the edition this BOOK is offered in. Falls back, because that is
             its whole job: a partial edition must not blank 65 books. Has to
             resolve with NOTHING playing — the Listen pill renders before any
             audio exists.
     paint = the edition of the recording CURRENTLY PLAYING, read from the
             asset-name stamp. NEVER falls back. A fallback here is §5.1 in a
             new costume and it fires on exactly the case the fallback exists
             for: a reader on a book the selected edition lacks, playing a
             library track from a third edition.
*/
describe('resolveBibleAudio — what is offered and what is painted', () => {
  const MANIFEST = {
    'bible-brm-kjv:john': [['brm2_john_001', '', 'Chapter 1']],
    'bible-brm-kjv:genesis': [['brm1_genesis_001', '', 'Chapter 1']],
    'bible-web:john': [['web2_john_001', '', 'Chapter 1']],
    'bible-wop-nkjv:john': [['wop2_john_001', '', 'Chapter 1']],
    'bible-wop-nkjv:genesis': [['wop1_genesis_001', '', 'Chapter 1']],
    // An edition whose assets are opaque archive ids and carry no stamp. This
    // is the shape TSOT Matthew ships (1wwN1I2tBRsfi5b0fepRT865uZ1Q40cUQ and
    // 27 more, five-char prefixes all different, none of them a stamp) — the
    // reason paint cannot be a property of the asset NAME. Registered here
    // under an edition that exists, because a fixture no release could produce
    // asserts about a world that does not exist.
    'bible-web:mark': [['1wwN1I2tBRsfi5b0fepRT865uZ1Q40cUQ', '', 'Chapter 1']],
    // deliberately NO 'bible-web:genesis' — a partial edition
  };
  // A track as the player builds it: `key` is `volKey + ':' + letterId`
  // (audio-player.js:859 and :1059), which is why the edition is already on
  // the object every caller passes.
  const trackFor = (asset, key) => ({
    key: key || null, url: 'https://example.test/' + asset + '.mp3',
  });

  beforeEach(() => { globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST; });
  afterEach(() => { delete globalThis.BIBLE_AUDIO_MANIFEST; });

  it('offers the selected edition for a book it carries', () => {
    const r = resolveBibleAudio({ settings: { bibleAudio: 'web-ebible' }, bookId: 'john' });
    expect(r.offer && r.offer.volKey).toBe('bible-web');
  });

  it('offers the default edition for a book the selected one does not carry', () => {
    const r = resolveBibleAudio({ settings: { bibleAudio: 'web-ebible' }, bookId: 'genesis' });
    expect(r.offer && r.offer.volKey).toBe('bible-brm-kjv');
  });

  it('offers nothing when Bible audio is off', () => {
    expect(resolveBibleAudio({ settings: { bibleAudio: 'off' }, bookId: 'john' }).offer).toBeNull();
  });

  it('resolves an offer with nothing playing \u2014 the pill renders before any audio exists', () => {
    const r = resolveBibleAudio({ settings: { bibleAudio: 'brm-kjv' }, bookId: 'john' });
    expect(r.offer && r.offer.volKey).toBe('bible-brm-kjv');
    expect(r.paint).toBeNull();
  });

  it('the offered edition is the one that gets queued \u2014 one value, read twice', () => {
    // The trap in the Architect\u2019s own \u00a71 ruling: resolve the pill from the
    // fallback and queue from the setting and the pill renders on a book whose
    // queued asset 404s. There is only ever ONE volKey to read.
    const r = resolveBibleAudio({ settings: { bibleAudio: 'web-ebible' }, bookId: 'genesis' });
    expect(MANIFEST[r.offer.volKey + ':genesis']).toBeTruthy();
  });

  it('paints from the asset stamp of the track that is playing', () => {
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'web-ebible' },
      bookId: 'john',
      track: trackFor('brm2_john_001', 'bible-brm-kjv:john'),
    });
    expect(r.paint && r.paint.volKey).toBe('bible-brm-kjv');
    expect(r.offer && r.offer.volKey).toBe('bible-web');
  });

  it('paint never falls back to offer', () => {
    // An asset naming no known edition (a legacy whole-book id) is not a
    // licence to guess: paint is null and nothing is painted.
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'brm-kjv' },
      bookId: 'genesis',
      track: trackFor('brm-kjv_genesis', 'bible-brm-kjv:genesis'),
    });
    expect(r.paint).toBeNull();
    expect(r.offer && r.offer.volKey).toBe('bible-brm-kjv');
  });

  it('the stamp table and the release hosts stay ONE table', () => {
    // RE-AIMED, and the rename is the point. This used to assert through
    // resolveBibleAudio, which no longer reads the stamp at all — it would
    // have gone on passing while describing a path it no longer describes.
    // The invariant is real and belongs to ROUTING: every stamp
    // bibleAudioAssetUrl routes on also names an edition, so the two readings
    // of an asset NAME can never disagree.
    for (const [asset, editionId] of [
      ['brm1_genesis_001', 'brm-kjv'], ['brm2_john_001', 'brm-kjv'],
      ['wop1_genesis_001', 'wop-nkjv'], ['wop2_john_001', 'wop-nkjv'],
      ['web1_genesis_001', 'web-ebible'], ['web2_john_001', 'web-ebible'],
    ]) {
      expect(bibleEditionOfAsset(asset), asset).toBe(editionId);
      expect(bibleAudioAssetUrl(asset), asset).toContain(asset);
    }
  });

  /* Section 12 (Architect, 2026-09-05), which REVERSES the stamp route above
     for paint. The stamp cannot see an edition whose assets are archive ids,
     so paint is null for every TSOT Matthew recording whatever timings ship —
     the same rule, two books, opposite verdicts. The edition is already on the
     track: the player builds `key` as `volKey + ':' + letterId`.

     The manifest check is NOT belt-and-braces. A key is stored data — a
     restored or imported row can name an edition it does not hold — and a
     lying key paints one edition's clock over another's voice, which is the
     defect this whole line of work exists to close. The asset id comes from
     the URL, so matching it against the row the key names PROVES the key
     instead of trusting it. */
  it('paints an edition whose assets carry no stamp at all', () => {
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'brm-kjv' },
      bookId: 'mark',
      track: trackFor('1wwN1I2tBRsfi5b0fepRT865uZ1Q40cUQ', 'bible-web:mark'),
    });
    expect(r.paint && r.paint.volKey).toBe('bible-web');
    // and offer is NULL here, which is the independence stated as a fact
    // rather than as a comment: no edition in this fixture carries mark, so
    // the book is offered in nothing while the recording still paints.
    expect(r.offer).toBeNull();
  });

  it('paints NOTHING when the key names an edition that does not carry the asset', () => {
    // The only arm that fails if someone later drops the manifest check as
    // redundant (Architect). The asset is real and belongs to brm-kjv; the key
    // claims web-ebible. Neither answer is safe, so there is no answer.
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'off' },
      bookId: 'john',
      track: trackFor('brm2_john_001', 'bible-web:john'),
    });
    expect(r.paint).toBeNull();
  });

  it('paints nothing for a track with no key, rather than guessing from the name', () => {
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'off' }, bookId: 'john', track: trackFor('brm2_john_001'),
    });
    expect(r.paint).toBeNull();
  });

  it('paints nothing for a key that is not a Bible edition at all', () => {
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'off' },
      bookId: 'john',
      track: { key: 'letters:a-blemish-and-a-stain', url: 'https://example.test/x.mp3' },
    });
    expect(r.paint).toBeNull();
  });

  it('CONTROL, and it must hold on BOTH sides of this change', () => {
    // A stamped brm asset under its own key paints brm-kjv. It passes on the
    // stamp route and on the key route, so on its own it proves nothing about
    // which one is running — which is exactly why it is here: without it,
    // "every drive edition paints null" and "the resolver is broken for
    // everything" print the same line.
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'off' },
      bookId: 'john',
      track: trackFor('brm2_john_001', 'bible-brm-kjv:john'),
    });
    expect(r.paint && r.paint.volKey).toBe('bible-brm-kjv');
    expect(resolveBibleAudio({
      settings: { bibleAudio: 'off' },
      bookId: 'john',
      track: trackFor('not-an-asset-at-all', 'bible-brm-kjv:john'),
    }).paint).toBeNull();
  });

  it('paints nothing for a legacy whole-book track, on either route', () => {
    // Their clock is book-relative, so per-chapter verse timings would be
    // wrong against them (Architect). Null today because the id carries no
    // stamp, null after because it is in no manifest row — the verdict is the
    // same and the reason changes, which is worth pinning while it is true.
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'brm-kjv' },
      bookId: 'genesis',
      track: trackFor('brm-kjv_genesis', 'bible-brm-kjv:genesis'),
    });
    expect(r.paint).toBeNull();
  });

  it('reads the manifest off globalThis, which is where the app puts it', () => {
    // A probe that evaluates the manifest into a private vm context sees every
    // paint lookup miss, so a CORRECT implementation reports failure — the
    // Data Builder lost two runs to exactly this. Pinning the contract here so
    // the next reader knows where to look before blaming the resolver.
    const saved = globalThis.BIBLE_AUDIO_MANIFEST;
    try {
      delete globalThis.BIBLE_AUDIO_MANIFEST;
      expect(resolveBibleAudio({
        settings: { bibleAudio: 'off' },
        bookId: 'john',
        track: trackFor('brm2_john_001', 'bible-brm-kjv:john'),
      }).paint).toBeNull();
    } finally {
      globalThis.BIBLE_AUDIO_MANIFEST = saved;
    }
  });
});

/* releaseTag — an edition says where its bytes live, instead of the asset name
   secretly encoding it (Architect §11).
   ─────────────────────────────────────────────────────────────────────
   Matthew's manifest ids are Drive ids, not the <prefix><testament>_<book>_<NNN>
   scheme, so there is no stamp to route on. The edition declares its release
   tag and the files stay where they are — no re-upload, no permanent duplicate
   on an append-only tag.

   AND THE FALLBACK GOES, which is the half that fixes a defect rather than
   adding a feature. Routing an unrecognised name to audio-bible-v1 turned "I
   do not know this edition" into a confident URL, so an undeclared Matthew
   would have 404'd on all 28 chapters instead of failing once, visibly, where
   it was built.

   THE FALLBACK WAS NOT PROTECTING SAVED TRACKS, which is what its comment
   implied and what made deleting it look risky. Measured: a saved library row
   is identified by its `url` (audio-library-store's `_identity`), and
   bibleAudioAssetUrl's only live callers build from MANIFEST ids
   (audio-player `_assetUrlFor`). Nothing ever asks it to reproduce a legacy
   URL — the row already holds one. The boundary still ACCEPTS those URLs, and
   the control below is what says so.
*/
describe('audio-track — a declared release tag', () => {
  const DRIVE_ID = '1AbC_dEfGh23IjKlMnOpQrStUvWxYz45';   // Matthew's id shape

  it('builds a declared edition\u2019s URL on its own tag', () => {
    expect(bibleAudioAssetUrl(DRIVE_ID, AUDIO_RELEASE_PREFIX))
      .toBe(AUDIO_RELEASE_PREFIX + DRIVE_ID + '.mp3');
  });

  it('the URL a declared tag builds passes the trust boundary', () => {
    // The point of declaring an EXISTING tag rather than a new host: the
    // boundary does not move.
    expect(isVotAudioUrl(bibleAudioAssetUrl(DRIVE_ID, AUDIO_RELEASE_PREFIX))).toBe(true);
  });

  it('returns nothing for a name belonging to no edition at all', () => {
    // The deleted catch-all. '' is the same answer an invalid id gets, and it
    // fails where it is built instead of 404ing 28 times where it is played.
    // An undeclared Matthew is exactly this case.
    expect(bibleAudioAssetUrl(DRIVE_ID)).toBe('');
    expect(bibleAudioAssetUrl('notanedition_genesis')).toBe('');
    expect(bibleAudioAssetUrl('brm_genesis')).toBe('');   // 'brm' is not an edition id
  });

  it('refuses a tag that is not a release prefix, rather than trusting it', () => {
    // A declared tag is data. An undeclared host must not be able to
    // impersonate one, or the trust boundary is decided by whoever edits the
    // registry rather than by RELEASE_PREFIXES.
    expect(bibleAudioAssetUrl(DRIVE_ID, 'https://example.test/')).toBe('');
    expect(bibleAudioAssetUrl(DRIVE_ID, '')).toBe('');
  });

  it('a declared tag beats the name stamp when both are present', () => {
    expect(bibleAudioAssetUrl('brm2_john_001', AUDIO_RELEASE_PREFIX))
      .toBe(AUDIO_RELEASE_PREFIX + 'brm2_john_001.mp3');
  });

  it('CONTROL \u2014 stamped names still route to their own tags', () => {
    expect(bibleAudioAssetUrl('brm2_john_001')).toBe(AUDIO_BRM_NT_PREFIX + 'brm2_john_001.mp3');
    expect(bibleAudioAssetUrl('web1_genesis_001')).toBe(AUDIO_WEB_OT_PREFIX + 'web1_genesis_001.mp3');
  });

  it('CONTROL \u2014 a saved legacy URL is still accepted, it is only no longer BUILT', () => {
    // The distinction the fallback's comment blurred. Deleting the builder's
    // guess does not strand anybody's saved recording.
    expect(isVotAudioUrl(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3')).toBe(true);
  });

  it('no edition declares a tag outside the trust boundary', () => {
    // Derived from the registry rather than listed, so a new edition cannot
    // introduce a host by declaring one.
    for (const id of Object.keys(BIBLE_AUDIO_EDITIONS)) {
      const tag = bibleReleaseTagFor(BIBLE_AUDIO_EDITIONS[id].volKey);
      if (!tag) continue;
      expect(isVotAudioUrl(tag + 'aaaa.mp3'), id + ' declares ' + tag).toBe(true);
    }
  });

  it('every edition\u2019s every chapter builds a URL inside the boundary', () => {
    // The Verifier's offline invariant (Architect §11): for every edition,
    // every declared book, every chapter, the URL built from the manifest id
    // and the edition's route passes isVotAudioUrl. This is the half that
    // catches a declaration drifting from where the bytes actually are.
    const m = SHIPPED_MANIFEST;
    expect(m, 'manifest not loaded \u2014 this gate would be vacuous').toBeTruthy();
    let checked = 0;
    for (const key of Object.keys(m)) {
      const volKey = key.slice(0, key.lastIndexOf(':'));
      const tag = bibleReleaseTagFor(volKey);
      for (const part of m[key]) {
        const url = bibleAudioAssetUrl(part[0], tag);
        expect(url, key + ' \u2192 ' + part[0]).not.toBe('');
        expect(isVotAudioUrl(url), key + ' \u2192 ' + url).toBe(true);
        checked++;
      }
    }
    expect(checked, 'no chapters examined').toBeGreaterThan(1000);
  });
});
