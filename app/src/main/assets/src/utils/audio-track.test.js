// @ts-nocheck
/* audio-track — the release-URL trust boundary.

   Two immutable GitHub releases are the ONLY hosts a persisted or played
   track may point at: audio-v1 (letters) and audio-bible-v1 (whole-book
   Bible editions). These tests pin that boundary — an imported favorite or
   a widened prefix must never turn the app into a generic remote loader. */

import { describe, it, expect } from 'vitest';
import {
  AUDIO_RELEASE_PREFIX,
  AUDIO_BIBLE_RELEASE_PREFIX,
  AUDIO_WOP_OT_PREFIX,
  AUDIO_WOP_NT_PREFIX,
  BIBLE_AUDIO_EDITIONS,
  audioAssetUrl,
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

  it('accepts exactly the two release prefixes, nothing else', () => {
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
