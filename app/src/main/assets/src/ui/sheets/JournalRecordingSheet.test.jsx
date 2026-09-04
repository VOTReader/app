/* JRNL-3 — downsampleWave bounds the stored voice-memo waveform.
   The amplitude poll accumulates ~3750 floats over a 5-min clip, but only ~48
   bars render; storing the full array inflated every journal autosave + export.
   These pin the max-pool downsample (peaks survive; result is a fixed size). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { downsampleWave, JournalRecordingSheet } from './JournalRecordingSheet.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { PlatformBridge } from '../../utils/platform-bridge.js';

vi.mock('../../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    isAndroid: false,
    requestMicPermission: () => {
      setTimeout(() => { if (window.__onMicPermissionResult) window.__onMicPermissionResult(true); }, 0);
    },
    nativeRecordStart: vi.fn(() => 'ok'),
    nativeRecordAmplitude: () => 8000,
    nativeRecordStop: vi.fn(),
    nativeRecordCancel: vi.fn(),
    nativeRecordPause: vi.fn(() => 'ok'),
    nativeRecordResume: vi.fn(() => 'ok'),
    startAudioSession: vi.fn(),
    endAudioSession: vi.fn(),
  },
}));

const MockBridge = /** @type {any} */ (PlatformBridge);

describe('downsampleWave (JRNL-3)', () => {
  it('returns arrays at/under the bucket count unchanged', () => {
    expect(downsampleWave([0.1, 0.2, 0.3], 48)).toEqual([0.1, 0.2, 0.3]);
  });

  it('max-pools a large array down to `buckets` bars, preserving peaks', () => {
    // A 1.0 peak at the start of every 8-wide window; 384 / 48 = 8 per bucket.
    const arr = Array.from({ length: 384 }, (_, i) => (i % 8 === 0 ? 1 : 0.1));
    const out = downsampleWave(arr, 48);
    expect(out.length).toBe(48);
    expect(out.every((v) => v === 1)).toBe(true);   // each bucket's peak survives
  });

  it('downsamples the real 5-min poll size (3750 → 48)', () => {
    const arr = Array.from({ length: 3750 }, () => 0.5);
    expect(downsampleWave(arr, 48).length).toBe(48);
  });

  it('null → null, [] → []', () => {
    expect(downsampleWave(null, 48)).toBeNull();
    expect(downsampleWave([], 48)).toEqual([]);
  });
});

/* Discard is confirm-gated when audio is at risk.
   ─────────────────────────────────────────────────────────────────
   Discard destroys an in-progress take or a finished recording, yet it was
   reachable INSTANTLY from the backdrop, the header ×, the recording-stage
   Cancel, and the preview × sitting next to Save. requestDiscard() now gates
   all four behind a ConfirmStrip whenever recorded seconds exist (or a
   preview is up); the empty `requesting` stage still closes instantly.
   The bridge is mocked (top of file); the REAL ConfirmStrip renders so the
   gate is non-vacuous. */

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

beforeEach(() => {
  vi.clearAllMocks();
  MockBridge.isAndroid = false;
  MockBridge.nativeRecordStart.mockReturnValue('ok');
});

/** Mount + grant mic + let ~1.3s of "recording" elapse (seconds > 0). */
function renderRecording(onClose) {
  const utils = render(<JournalRecordingSheet onSave={() => {}} onClose={onClose} />);
  act(() => { vi.advanceTimersByTime(10); });    // permission grant fires
  act(() => { vi.advanceTimersByTime(1300); });  // tick interval → seconds >= 1
  return utils;
}

describe('JournalRecordingSheet discard confirm', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('Cancel during a real take shows the confirm instead of closing; confirming closes', () => {
    const onClose = vi.fn();
    renderRecording(onClose);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this recording?')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, discard'));
    expect(onClose).toHaveBeenCalled();
  });

  it('the confirm can be cancelled — recording UI returns, nothing closed', () => {
    const onClose = vi.fn();
    renderRecording(onClose);
    fireEvent.click(screen.getByText('Cancel'));
    // The action row is REPLACED by the strip, so this is the strip's Cancel.
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Discard this recording?')).toBeNull();
    expect(screen.getByText('Recording')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('backdrop tap during a real take is confirm-gated too', () => {
    const onClose = vi.fn();
    const { container } = renderRecording(onClose);
    fireEvent.click(container.querySelector('.note-sheet-overlay'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this recording?')).toBeTruthy();
  });

  it('the empty requesting stage still closes instantly (nothing at risk)', () => {
    const onClose = vi.fn();
    render(<JournalRecordingSheet onSave={() => {}} onClose={onClose} />);
    // Do NOT advance timers — permission unresolved, stage stays 'requesting'
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText('Discard this recording?')).toBeNull();
  });
});

/* journal-3 clause (a) — durable BEFORE preview.
   ─────────────────────────────────────────────────────────────────
   The sheet used to hold a finished recording in memory through the whole
   preview stage and only `put` it when the user tapped Save. Everything
   between native's stop() and that tap — reviewing, retrying, composing —
   was a window in which the process dying lost the take outright, with the
   bytes sitting on disk the whole time (P2).

   The order now inverts: commit with the `unlinked` marker, THEN preview.
   Discarding at preview deletes what was committed, which is an explicit
   user choice rather than a silent drop.

   The trade, deliberately taken: a take the user means to bin is written and
   then deleted, so a crash between those two leaves it in the Hub banner. A
   visible unwanted recording costs one tap; an invisible lost one is gone. */

/** A JournalMediaStore stub that records what it was asked to store. */
function stubMediaStore() {
  const puts = [];
  const deletes = [];
  window.JournalMediaStore = {
    put: vi.fn((rec) => { puts.push(rec); return Promise.resolve('media-1'); }),
    delete: vi.fn((id) => { deletes.push(id); return Promise.resolve(); }),
    markLinked: vi.fn(() => Promise.resolve()),
  };
  return { puts, deletes };
}

/** Mount, grant mic, record ~1.3s, then hand the sheet a finished web Blob. */
async function renderThroughStop(props) {
  const utils = render(<JournalRecordingSheet onSave={() => {}} onClose={() => {}} {...props} />);
  act(() => { vi.advanceTimersByTime(10); });
  act(() => { vi.advanceTimersByTime(1300); });
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
  await act(async () => {
    window.__onNativeRecordingComplete(null, 4000, 'audio/webm', blob);
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

describe('JournalRecordingSheet — durable before preview (journal-3)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete window.JournalMediaStore;
  });

  it('R1: the blob is in the media store, marked unlinked, by the time preview renders', async () => {
    const { puts } = stubMediaStore();
    await renderThroughStop();

    expect(window.JournalMediaStore.put).toHaveBeenCalledTimes(1);
    expect(puts[0].type).toBe('audio');
    expect(puts[0].blob.size).toBe(3);
    // The marker is the whole point: until an entry references this record,
    // the sweep must be able to tell "never linked" from "owner deleted".
    expect(puts[0].unlinked).toBe(true);
    // And it happened BEFORE the user can see or discard anything.
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('R2: discarding at preview deletes the record that was committed', async () => {
    const { deletes } = stubMediaStore();
    await renderThroughStop();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByText('Yes, discard'));
    await act(async () => { await Promise.resolve(); });

    expect(deletes).toEqual(['media-1']);
  });

  it('saving links the record rather than putting it a second time', async () => {
    const onSave = vi.fn();
    stubMediaStore();
    await renderThroughStop({ onSave });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });

    expect(window.JournalMediaStore.put).toHaveBeenCalledTimes(1);   // not twice
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].mediaId).toBe('media-1');
    expect(window.JournalMediaStore.markLinked).toHaveBeenCalledWith('media-1');
  });
});

/* Pause freezes the on-screen timer (owner-reported).
   ─────────────────────────────────────────────────────────────────
   The recorder pauses correctly, but the seconds counter kept climbing while
   paused and "snapped back" on resume — the display tick was left running
   against a stale segment-start, double-counting. Pausing must FREEZE the
   counter; resuming must continue from where it was. */
describe('JournalRecordingSheet pause freezes the timer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const timeText = () => document.querySelector('.jrn-rec-time').textContent;

  it('the seconds counter does not advance while paused, then continues on resume', () => {
    render(<JournalRecordingSheet onSave={() => {}} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(10); });      // permission grant → startCapture
    act(() => { vi.advanceTimersByTime(2000); });    // ~2s recorded
    const atPause = timeText();

    fireEvent.click(screen.getByLabelText('Pause'));
    expect(screen.getByText('Paused')).toBeTruthy();

    // The bug: the tick kept firing here and the counter climbed. It must freeze.
    act(() => { vi.advanceTimersByTime(3000); });
    expect(timeText()).toBe(atPause);

    fireEvent.click(screen.getByLabelText('Resume'));
    expect(screen.getByText('Recording')).toBeTruthy();

    // Resumed → the counter advances again (past the pre-pause value), and the
    // 3s of paused time is NOT counted.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(timeText()).not.toBe(atPause);
  });
});

describe('JournalRecordingSheet audio-session lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('acquires the web audio session before capture and releases it on Finish', () => {
    render(<JournalRecordingSheet onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Voice Recording' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10); });

    expect(MockBridge.startAudioSession).toHaveBeenCalledTimes(1);
    expect(MockBridge.nativeRecordStart).toHaveBeenCalledTimes(1);
    expect(MockBridge.startAudioSession.mock.invocationCallOrder[0])
      .toBeLessThan(MockBridge.nativeRecordStart.mock.invocationCallOrder[0]);

    fireEvent.click(screen.getByLabelText('Finish'));
    expect(MockBridge.endAudioSession).toHaveBeenCalledTimes(1);
  });

  it('leaves Android session acquisition to the atomic native start call', () => {
    MockBridge.isAndroid = true;
    render(<JournalRecordingSheet onSave={() => {}} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(10); });

    expect(MockBridge.startAudioSession).not.toHaveBeenCalled();
    expect(MockBridge.nativeRecordStart).toHaveBeenCalledTimes(1);
  });

  it('releases the audio session when capture fails to start', () => {
    MockBridge.nativeRecordStart.mockReturnValueOnce('error:permission');
    render(<JournalRecordingSheet onSave={() => {}} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(10); });

    expect(screen.getByText(/Microphone permission denied/)).toBeTruthy();
    expect(MockBridge.endAudioSession).toHaveBeenCalledTimes(1);
  });
});

/* P1-6 — Escape / Android-back must route through the discard confirm.
   ─────────────────────────────────────────────────────────────────────
   The editor used to register a bare setShowRec(false) as the modal-registry
   dismiss for this sheet, so hardware back while recording DESTROYED the
   take without the discard confirm that every tap path (backdrop, ×, Cancel)
   already had. The sheet now registers ITSELF (NoteSheet precedent) with
   requestDiscard as the dismiss. Driven through the REAL modalRegistry
   (vitest.setup.js supplies it), exactly like the app-level dispatcher. */
describe('JournalRecordingSheet — registry dismiss routes through requestDiscard (P1-6)', () => {
  beforeEach(() => { vi.useFakeTimers(); modalRegistry._reset(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    modalRegistry._reset();
  });

  it('back/Escape during a real take opens the discard confirm instead of destroying the take', () => {
    const onClose = vi.fn();
    renderRecording(onClose); // permission granted + ~1.3s recorded (seconds > 0)

    expect(modalRegistry.openIds()).toContain('journal-recording-sheet');
    act(() => { modalRegistry.peek().dismiss(); }); // the dispatcher's Escape/back path

    // The bug: the sheet was already gone here, take destroyed, no confirm.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this recording?')).toBeTruthy();

    fireEvent.click(screen.getByText('Yes, discard'));
    expect(onClose).toHaveBeenCalled();
  });

  it('back/Escape with nothing recorded still closes instantly (nothing at risk)', () => {
    const onClose = vi.fn();
    render(<JournalRecordingSheet onSave={() => {}} onClose={onClose} />);
    // Do NOT advance timers — permission unresolved, stage stays 'requesting'.
    act(() => { modalRegistry.peek().dismiss(); });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText('Discard this recording?')).toBeNull();
  });
});

/* journal-3 — the Android fetch bridge (#1) must not lose a finished
   recording to one transient fetch blip.
   ─────────────────────────────────────────────────────────────────────
   NativeAudioRecorder.stop() serves the file and keeps it on disk ~60s;
   AppInterface.postNativeComplete then fires __onNativeRecordingComplete
   with base64=null and a url (its own doc comment: "exactly one of the two
   is non-null on success"). So on this path the `if (b64)` fallback below
   the fetch was dead code — a single rejected fetch had nothing left to
   fall back to and went straight to fail(), destroying the take. The fix
   retries the same url a bounded number of times with a short backoff
   (well inside the 60s window) before giving up; that dead branch is now
   deleted rather than merely documented.

   These cases need a JournalMediaStore stub because finalize() commits
   before preview now (clause (a)) — a successful fetch reaches the store. */
describe('JournalRecordingSheet Android fetch-bridge retry (journal-3)', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
    window.JournalMediaStore = {
      put: vi.fn(() => Promise.resolve('media-1')),
      delete: vi.fn(() => Promise.resolve()),
      markLinked: vi.fn(() => Promise.resolve()),
    };
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    delete window.JournalMediaStore;
  });

  it('retries a transient fetch failure with backoff and still finalizes the recording', async () => {
    MockBridge.isAndroid = true;
    let attempts = 0;
    globalThis.fetch = /** @type {any} */ (vi.fn(() => {
      attempts++;
      if (attempts < 2) return Promise.reject(new Error('network blip'));
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mp4' })) });
    }));
    renderRecording(() => {});

    await act(async () => {
      window.__onNativeRecordingComplete(null, 4000, 'audio/mp4', undefined, 'blob:mock/served-file');
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(attempts).toBeGreaterThan(1); // it actually retried, not one-and-done
    // The recording must survive: no error stage, no lost take.
    expect(screen.queryByText(/could not read the recording/i)).toBeNull();
  });

  it('gives up after a bounded number of retries on a persistent failure — loudly, not silently', async () => {
    MockBridge.isAndroid = true;
    let attempts = 0;
    globalThis.fetch = vi.fn(() => { attempts++; return Promise.reject(new Error('server gone')); });
    renderRecording(() => {});

    await act(async () => {
      window.__onNativeRecordingComplete(null, 4000, 'audio/mp4', undefined, 'blob:mock/served-file');
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(attempts).toBeGreaterThan(1);  // it did retry
    expect(attempts).toBeLessThan(10);    // ...but bounded, not an infinite loop
    // journal-3 reworded this: "Could not process the recording. Please try
    // again." read as an instruction to RECORD IT AGAIN, which is the one
    // thing the user must not do while the finished take is still on disk.
    expect(screen.getByText(/could not read the recording from the device/i)).toBeTruthy(); // surfaced, not swallowed

    // ...and the error stage now offers the real second chance.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  /* The scripture-web-5 shape, checked deliberately rather than assumed: a
     retry that re-awaits a settled promise passes its own test (the transport
     is stubbed) and does nothing whatsoever in the app. Asserting the button
     exists proves nothing about that; asserting that pressing it puts NEW
     calls through the transport does. */
  it('Try again re-issues the fetch instead of re-awaiting the failed one', async () => {
    MockBridge.isAndroid = true;
    let attempts = 0;
    globalThis.fetch = vi.fn(() => { attempts++; return Promise.reject(new Error('server gone')); });
    renderRecording(() => {});

    await act(async () => {
      window.__onNativeRecordingComplete(null, 4000, 'audio/mp4', undefined, 'blob:mock/served-file');
      await vi.advanceTimersByTimeAsync(10000);
    });
    const afterFirst = attempts;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(attempts).toBeGreaterThan(afterFirst);
  });
});
