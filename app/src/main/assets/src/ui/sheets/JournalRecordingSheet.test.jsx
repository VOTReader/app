/* JRNL-3 — downsampleWave bounds the stored voice-memo waveform.
   The amplitude poll accumulates ~3750 floats over a 5-min clip, but only ~48
   bars render; storing the full array inflated every journal autosave + export.
   These pin the max-pool downsample (peaks survive; result is a fixed size). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { downsampleWave, JournalRecordingSheet } from './JournalRecordingSheet.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

vi.mock('../../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    requestMicPermission: () => {
      setTimeout(() => { if (window.__onMicPermissionResult) window.__onMicPermissionResult(true); }, 0);
    },
    nativeRecordStart: () => 'ok',
    nativeRecordAmplitude: () => 8000,
    nativeRecordStop: vi.fn(),
    nativeRecordCancel: vi.fn(),
    nativeRecordPause: vi.fn(() => 'ok'),
    nativeRecordResume: vi.fn(() => 'ok'),
    startAudioSession: vi.fn(),
    endAudioSession: vi.fn(),
  },
}));

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
