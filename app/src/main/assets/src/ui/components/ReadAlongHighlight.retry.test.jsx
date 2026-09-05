// @ts-nocheck
/* RED — read-along-5 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   Harness skeleton adopted from codex-repros d2dee0fb (Codex unit); the
   assertion is the Verifier's. Codex asserted an IMMEDIATE second load on the
   error bump, which prescribes one of the two fixes the finding allows
   (re-ask on the store's error version) and would stay RED under the other
   (re-arm on the next playing event / chapter change with a small backoff).
   This version fires EVERY plausible retry input the reader produces while
   staying on the chapter — the error bump itself, a pause and resume, and a
   chapter change within the same book — and asks only that the loader was
   asked AGAIN at least once. Today the effect's deps are [needBibleSync,
   volKey], both unchanged by all of those, so the answer is exactly one call:
   a flaky first byte, a corpus bump that just evicted the cache entry, or a
   Pages hiccup leaves the wash silently dead for the whole book.

   Control: switching the wash off and on re-asks today (needBibleSync flips),
   which proves the harness can see a retry when one happens. */
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
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute() {}
}

function Host({ chapter = 1, readAlongOn = true, volKey = 'bible-brm-kjv' }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <main className="chapter-body" ref={mainRef}>
        <span data-hl-key={'bible:john:' + chapter + ':1'}>A verse.</span>
        <ReadAlongHighlight
          volKey={volKey}
          letterId="john"
          chapter={chapter}
          mainRef={mainRef}
          hlKeyFn={(book, n) => 'bible:' + book + ':' + chapter + ':' + n}
          readAlongOn={readAlongOn}
          readAlongFollow={false}
        />
      </main>
    </div>
  );
}

/** A loader whose FIRST fetch fails the way index.html's factory fails:
    the promise clears, error flips on, the version bumps. Later fetches land. */
function failingOnceFactory() {
  const made = [];
  globalThis.__makeLazyLoader = vi.fn((name, path) => {
    const listeners = new Set();
    let version = 0;
    const corpus = {
      loaded: false,
      error: false,
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion() { return version; },
    };
    const bump = () => { version += 1; listeners.forEach((cb) => cb()); };
    const load = vi.fn(() => {
      if (load.mock.calls.length === 1) {
        corpus.error = true;
        bump();
        return Promise.reject(new Error('first fetch failed'));
      }
      corpus.error = false;
      corpus.loaded = true;
      bump();
      return Promise.resolve();
    });
    const l = { name, path, corpus, load };
    made.push(l);
    return l;
  });
  return { loads: (path) => { const l = made.find((x) => x.path === path); return l ? l.load.mock.calls.length : 0; } };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const playChapter = (chapterNum) => act(() => {
  AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'john', label: 'KJV', chapterNum });
});

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  // Real asset ids. The names carry the edition stamp bibleAudioAssetUrl
  // routes on and resolveBibleAudio reads, so which timings file this
  // component asks for is decided by the RECORDING. 'john-1' named no
  // edition, which under that rule is 'do not paint' — a fixture that no
  // release could produce, and it went quiet the moment the name mattered.
  globalThis.BIBLE_AUDIO_MANIFEST = {
    'bible-brm-kjv:john': [['brm2_john_001', '', 'Chapter 1'], ['brm2_john_002', '', 'Chapter 2']],
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

const FILE = 'src/data/bible-sync-brm-kjv.js';
const WEB_FILE = 'src/data/bible-sync-web-ebible.js';

describe('the timings file asked for is the PLAYING edition\u2019s', () => {
  it('fetches the recording\u2019s file, not the Settings edition\u2019s', async () => {
    // The third of the three lines that carry the sync-selector defect, and
    // the only one no other case can see: everywhere else the table is
    // installed directly on globalThis, so the loader is never the path that
    // supplies it. Asking for the setting's file downloads a table nothing
    // paints from and leaves the wash dead until the reader changes Settings
    // to match \u2014 a silence with a network request behind it.
    const { loads } = failingOnceFactory();
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:john': [['brm2_john_001', '', 'Chapter 1']],
      'bible-web:john': [['web2_john_001', '', 'Chapter 1']],
    };
    render(<Host volKey="bible-web" />);      // Settings says WEB
    playChapter(1);                            // a BRM recording plays
    await flush();
    expect(loads(FILE), 'the playing edition\u2019s file').toBe(1);
    expect(loads(WEB_FILE), 'the Settings edition\u2019s file').toBe(0);
  });
});

describe('read-along-5 — a failed first Bible-timings fetch', () => {
  it('CONTROL: switching the wash off and on asks for the file again (the harness sees retries)', async () => {
    const { loads } = failingOnceFactory();
    const view = render(<Host />);
    playChapter(1);
    await flush();
    expect(loads(FILE)).toBe(1);
    view.rerender(<Host readAlongOn={false} />);
    view.rerender(<Host readAlongOn />);
    await flush();
    expect(loads(FILE)).toBeGreaterThanOrEqual(2);
  });

  it('RED: while the reader stays on the book the failed fetch must be retried on SOME real input', async () => {
    const { loads } = failingOnceFactory();
    const view = render(<Host />);
    playChapter(1);
    await flush();
    expect(loads(FILE)).toBe(1);               // the failed first fetch

    // Input 1 — the error itself: the store bumped its version.
    await flush();
    // Input 2 — the reader pauses and resumes.
    act(() => { AudioPlayer.toggle(); });
    await flush();
    act(() => { AudioPlayer.toggle(); });
    await flush();
    // Input 3 — the reader moves to the next chapter of the same book.
    view.rerender(<Host chapter={2} />);
    playChapter(2);
    await flush();
    // Input 4 — time passes with the track playing.
    act(() => {
      const el = FakeAudio.last;
      el.currentTime = 30;
      el.dispatchEvent(new Event('timeupdate'));
    });
    await flush();

    expect(loads(FILE), 'the timings file was never asked for again').toBeGreaterThanOrEqual(2);
  });
});
