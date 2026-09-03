// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AudioPlayer } from '../../utils/audio-player.js';
import { resetSyncLoadersForTests } from '../../utils/sync-loaders.js';
import { ReadAlongHighlight } from './ReadAlongHighlight.jsx';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
    this.duration = 600;
    this.paused = true;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
    FakeAudio.last = this;
  }
  set src(value) { this._src = value; }
  get src() { return this._src || ''; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() {}
}

function Host() {
  const mainRef = React.useRef(null);
  return (
    <main ref={mainRef}>
      <span data-hl-key="bible:john:1:1">A verse.</span>
      <ReadAlongHighlight
        volKey="bible-brm-kjv"
        letterId="john"
        chapter={1}
        mainRef={mainRef}
        hlKeyFn={(book, chapter, verse) => `bible:${book}:${chapter}:${verse}`}
        readAlongOn
        readAlongFollow={false}
      />
    </main>
  );
}

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.BIBLE_AUDIO_MANIFEST = {
    'bible-brm-kjv:john': [['john-1', '', 'Chapter 1']],
  };
  globalThis.BIBLE_AUDIO_BOOKS = [['john', 'John']];
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  AudioPlayer.stop();
  resetSyncLoadersForTests();
});

afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  resetSyncLoadersForTests();
  delete globalThis.Audio;
  delete globalThis.BIBLE_AUDIO_MANIFEST;
  delete globalThis.BIBLE_AUDIO_BOOKS;
  delete globalThis.__makeLazyLoader;
});

describe('REPRO read-along-5: failed Bible timings fetch', () => {
  it('retries after the loader reports a failed first fetch while the chapter remains open', async () => {
    let loadCalls = 0;
    const listeners = new Set();
    const corpus = {
      loaded: false,
      error: false,
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion() { return loadCalls; },
    };
    const load = vi.fn(() => {
      loadCalls += 1;
      if (loadCalls === 1) {
        corpus.error = true;
        listeners.forEach((cb) => cb());
        return Promise.reject(new Error('first fetch failed'));
      }
      return Promise.resolve();
    });
    globalThis.__makeLazyLoader = vi.fn(() => ({ corpus, load }));

    render(<Host />);
    await act(async () => {
      AudioPlayer.playBibleBook({
        volKey: 'bible-brm-kjv', bookId: 'john', label: 'KJV', chapterNum: 1,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(load).toHaveBeenCalledTimes(2);
  });
});
