// @ts-nocheck
/* audio-track — the release-URL trust boundary.

   A frozen list of immutable GitHub releases is the ONLY set of hosts a
   persisted or played track may point at: audio-v1 (letters), the per-chapter
   Bible editions on their OT/NT tag pairs, and audio-bible-v1 (the retired
   whole-book Bible tracks, kept live forever for saved recordings). These
   tests pin that boundary — an imported favorite or a widened prefix must
   never turn the app into a generic remote loader. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  bibleAudioEdition,
  displayPartLabel,
  isVotAudioUrl,
  normalizeAudioTrack,
  resolveBibleAudio,
} from './audio-track.js';

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
  it('routes wop1_/wop2_ assets to their testament tags, everything else to audio-bible-v1', () => {
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

  it('legacy whole-book brm-kjv_* ids still resolve to audio-bible-v1', () => {
    // 'brm-kjv_' shares three characters with 'brm1_' and must NOT be captured
    // by the new routing — a saved track's URL has to stay byte-identical.
    expect(bibleAudioAssetUrl('brm-kjv_genesis')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_genesis.mp3');
    expect(bibleAudioAssetUrl('brm-kjv_revelation')).toBe(AUDIO_BIBLE_RELEASE_PREFIX + 'brm-kjv_revelation.mp3');
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
    // deliberately NO 'bible-web:genesis' — a partial edition
  };
  const trackFor = (asset) => ({ url: 'https://example.test/' + asset + '.mp3' });

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
      settings: { bibleAudio: 'web-ebible' }, bookId: 'john', track: trackFor('brm2_john_001'),
    });
    expect(r.paint && r.paint.volKey).toBe('bible-brm-kjv');
    expect(r.offer && r.offer.volKey).toBe('bible-web');
  });

  it('paint never falls back to offer', () => {
    // An asset naming no known edition (a legacy whole-book id) is not a
    // licence to guess: paint is null and nothing is painted.
    const r = resolveBibleAudio({
      settings: { bibleAudio: 'brm-kjv' }, bookId: 'genesis', track: trackFor('brm-kjv_genesis'),
    });
    expect(r.paint).toBeNull();
    expect(r.offer && r.offer.volKey).toBe('bible-brm-kjv');
  });

  it('reads the edition off every stamp the URL builder routes on', () => {
    // The stamps and the release hosts are ONE table; this pins that every
    // stamp bibleAudioAssetUrl routes on also names an edition, so the two
    // readings of an asset name can never disagree.
    for (const [asset, volKey] of [
      ['brm1_genesis_001', 'bible-brm-kjv'], ['brm2_john_001', 'bible-brm-kjv'],
      ['wop1_genesis_001', 'bible-wop-nkjv'], ['wop2_john_001', 'bible-wop-nkjv'],
      ['web1_genesis_001', 'bible-web'], ['web2_john_001', 'bible-web'],
    ]) {
      const r = resolveBibleAudio({
        settings: { bibleAudio: 'off' }, bookId: 'john', track: trackFor(asset),
      });
      expect(r.paint && r.paint.volKey, asset).toBe(volKey);
      // and the same stamp still routes to a release host, not the fallthrough
      expect(bibleAudioAssetUrl(asset), asset).toContain(asset);
    }
  });
});
