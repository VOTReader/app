/* A voice memo that cannot play said nothing (sweep v070).
   ─────────────────────────────────────────────────────────────────
   JournalAudioBlock's Play called audioRef.current.play() and dropped the
   promise it returns. play() rejects when the memo cannot play: a codec this
   WebView cannot decode (a backup made on another device), a broken file.
   The rejection went unhandled, the 'play' event the element had already
   fired left the button on Pause over silence, and the reader was told
   nothing. Play failing now puts the button back on Play and says why; an
   AbortError (a pause or a new load cut the start short) is no failure and
   stays quiet. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { JournalAudioBlock } from './JournalViewerScreen.jsx';

function setupGlobals() {
  window.JournalMediaStore = {
    objectUrl: vi.fn(() => Promise.resolve('blob:memo')),
    get: vi.fn(() => Promise.resolve(null)),
  };
  window.JournalHelpers = {
    formatDuration: (s) => {
      const t = Math.max(0, Math.round(s || 0));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    },
  };
  window.ConfirmStrip = () => null;
  /** @type {any} */ (globalThis).showToast = vi.fn();
}

/**
 * play() as a browser runs it on a memo it cannot start: 'play' fires, then the promise rejects.
 * `seen.handled` turns true once the block attaches a rejection handler to that promise. A plain
 * function, not vi.spyOn: a spy subscribes to the promises its mock returns (settledResults), which
 * would handle the rejection on the block's behalf.
 */
const realPlay = HTMLMediaElement.prototype.play;
function playRejects(name) {
  const seen = { handled: false };
  HTMLMediaElement.prototype.play = function () {
    this.dispatchEvent(new Event('play'));
    const p = Promise.reject(new DOMException('cannot play', name));
    const then = p.then.bind(p);
    p.then = (ok, bad) => { if (bad) seen.handled = true; return then(ok, bad); };
    p.catch = (bad) => { seen.handled = true; return then(undefined, bad); };
    return p;
  };
  return seen;
}

async function renderAndTapPlay() {
  await act(async () => { render(<JournalAudioBlock mediaId="m1" duration={12} caption="Morning walk" />); });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  cleanup();
  HTMLMediaElement.prototype.play = realPlay;
  delete window.JournalMediaStore;
  delete window.JournalHelpers;
  delete window.ConfirmStrip;
  delete (/** @type {any} */ (globalThis).showToast);
});

describe('JournalAudioBlock — a memo that cannot play (v070)', () => {
  it('puts the button back on Play and tells the reader, with no unhandled rejection', async () => {
    setupGlobals();
    const seen = playRejects('NotSupportedError');
    await renderAndTapPlay();
    expect(seen.handled).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    const showToast = /** @type {any} */ (globalThis).showToast;
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: 'vot-toast-memo-play', ariaLive: 'assertive', text: expect.stringMatching(/can.t be played/),
    }));
  });

  it('an AbortError (a pause cut the start short) is handled and stays quiet', async () => {
    setupGlobals();
    const seen = playRejects('AbortError');
    await renderAndTapPlay();
    expect(seen.handled).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(/** @type {any} */ (globalThis).showToast).not.toHaveBeenCalled();
  });
});
