import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { textForRecording, recordingTranslationFor } from './audio-text-edition.js';

const OPTIONS = [
  { id: 'nkjv' }, { id: 'rnkjv' }, { id: 'web' }, { id: 'kjv' }, { id: 'rkjv', base: 'kjv' },
];

describe('textForRecording: the words on screen match the voice', () => {
  beforeEach(() => { /** @type {any} */ (globalThis).TRANSLATION_OPTIONS = OPTIONS; });
  afterEach(() => { delete (/** @type {any} */ (globalThis)).TRANSLATION_OPTIONS; });

  it('keeps the reader\'s choice when nothing of this book plays', () => {
    expect(textForRecording('nkjv', '')).toBe('nkjv');
    expect(textForRecording(undefined, null)).toBe('nkjv');
    expect(textForRecording('web', '')).toBe('web');
  });
  it('shows KJV under the default KJV recording (NKJV stays the reading default)', () => {
    expect(textForRecording('nkjv', 'kjv')).toBe('kjv');
    expect(textForRecording(undefined, 'kjv')).toBe('kjv');
  });
  it('shows NKJV under the NKJV recording for a KJV reader', () => {
    expect(textForRecording('kjv', 'nkjv')).toBe('nkjv');
  });
  it('a restored-Name reader keeps restored names in the recording\'s family', () => {
    expect(textForRecording('rnkjv', 'nkjv')).toBe('rnkjv');
    expect(textForRecording('rkjv', 'kjv')).toBe('rkjv');
    expect(textForRecording('rnkjv', 'kjv')).toBe('rkjv');
    expect(textForRecording('rkjv', 'nkjv')).toBe('rnkjv');
    expect(textForRecording('rnkjv', 'web')).toBe('web');
  });
  it('a recording with no text edition (TSOT Matthew) leaves the choice alone', () => {
    expect(textForRecording('nkjv', 'vot-matthew')).toBe('nkjv');
  });
});

describe('recordingTranslationFor', () => {
  const g = /** @type {any} */ (globalThis);
  beforeEach(() => {
    g.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:john': [['brm2_john_001'], ['brm2_john_002']] };
  });
  afterEach(() => { delete g.BIBLE_AUDIO_MANIFEST; });
  const url = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v2/brm2_john_001.mp3';
  const player = (status, track) => ({ getState: () => ({ status, qi: 0, queue: track ? [track] : [] }) });

  it('names the playing recording\'s translation for its own book', () => {
    expect(recordingTranslationFor(player('playing', { key: 'bible-brm-kjv:john', url }), 'john')).toBe('kjv');
  });
  it('holds while paused, so the words do not change under a reader who stopped to look', () => {
    expect(recordingTranslationFor(player('paused', { key: 'bible-brm-kjv:john', url }), 'john')).toBe('kjv');
  });
  it('is empty for another book, an idle player or a letter', () => {
    expect(recordingTranslationFor(player('playing', { key: 'bible-brm-kjv:john', url }), 'luke')).toBe('');
    expect(recordingTranslationFor(player('idle', { key: 'bible-brm-kjv:john', url }), 'john')).toBe('');
    expect(recordingTranslationFor(player('playing', null), 'john')).toBe('');
    expect(recordingTranslationFor(player('playing', { key: 'vol1:letter-1', url: 'x' }), 'john')).toBe('');
  });
});
