// @ts-nocheck
/* audio-track — the release-URL trust boundary.

   A frozen list of immutable GitHub releases is the ONLY set of hosts a
   persisted or played track may point at: audio-v1 (letters), the per-chapter
   Bible editions on their OT/NT tag pairs, and audio-bible-v1 (the retired
   whole-book Bible tracks, kept live forever for saved recordings). These
   tests pin that boundary — an imported favorite or a widened prefix must
   never turn the app into a generic remote loader. */

import { describe, it, expect } from 'vitest';
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
  isVotAudioUrl,
  normalizeAudioTrack,
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
