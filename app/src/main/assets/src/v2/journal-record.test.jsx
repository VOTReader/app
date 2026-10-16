/* journal-record.test.jsx - Insert's Voice memo (mw9c, design dz20 3p): main's JournalRecordingSheet ported, driven
   through a stand-in for main's PlatformBridge: the mic asked first, the take with its clock, level, pause, cap and
   finish, main's commit-then-review order, Save linking it, and the asks before a take is lost. */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { JournalRecord, downsampleWave, levelBars, clock, MAX_RECORDING_SECONDS } from './screens/JournalRecord.jsx';

const g = /** @type {any} */ (globalThis);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const sheet = () => document.querySelector('[role="dialog"][aria-label="Voice memo"]');
const button = (label) => [...sheet().querySelectorAll('button')].find((b) => b.textContent === label);
const flush = () => act(() => Promise.resolve().then(() => undefined));
const GLOBALS = ['PlatformBridge', 'JournalMediaStore', 'AudioPlayer', 'holdUpdateReload', 'StorageHealth', 'fetch',
  '__onMicPermissionResult', '__onNativeRecordingComplete', '__onNativeRecordingPaused'];

/** main's PlatformBridge as the sheet calls it: a web take, the level a quarter up. */
function bridge(extra = {}) {
  return {
    isAndroid: false,
    requestMicPermission: vi.fn(), startAudioSession: vi.fn(), endAudioSession: vi.fn(),
    nativeRecordStart: vi.fn(() => 'ok'), nativeRecordAmplitude: vi.fn(() => 32767 / 16),
    nativeRecordPause: vi.fn(() => 'ok'), nativeRecordResume: vi.fn(() => 'ok'),
    nativeRecordStop: vi.fn(), nativeRecordCancel: vi.fn(),
    nativeDeleteRecording: vi.fn(), nativeReadRecording: vi.fn(() => null), nativeListRecordings: vi.fn(() => '[]'),
    ...extra,
  };
}

let order;
let release;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 15, 22));
  order = [];
  release = vi.fn();
  g.PlatformBridge = bridge();
  g.JournalMediaStore = { put: vi.fn(async () => { order.push('put'); return 'm1'; }), delete: vi.fn(), markLinked: vi.fn(() => order.push('linked')) };
  g.AudioPlayer = { pauseIfPlaying: vi.fn() };
  g.holdUpdateReload = vi.fn(() => release);
});
afterEach(() => {
  cleanup();
  for (const k of GLOBALS) delete g[k];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The sheet open with the mic allowed and `s` seconds taken. */
function recording(s = 0, props = {}) {
  const onSave = vi.fn((m) => order.push('saved:' + m.mediaId));
  const onClose = vi.fn();
  render(<JournalRecord onSave={onSave} onClose={onClose} {...props} />);
  act(() => { g.__onMicPermissionResult(true); });
  if (s) act(() => { vi.advanceTimersByTime(s * 1000); });
  return { onSave, onClose };
}

describe('the helpers (main\'s)', () => {
  it('downsampleWave keeps each bucket\'s peak and leaves a short take alone; the clock; the level\'s bars', () => {
    expect(downsampleWave([0.1, 0.9, 0.2, 0.3, 0.8, 0.1], 3)).toEqual([0.9, 0.3, 0.8]);
    expect(downsampleWave([0.5], 48)).toEqual([0.5]);
    expect(downsampleWave(null, 48)).toBe(null);
    expect([clock(42), clock(258), clock(300)]).toEqual(['0:42', '4:18', '5:00']);
    expect(levelBars([], 0.05)).toEqual(Array(40).fill(4));
    expect(levelBars([1, 0.5], 0.05).slice(18, 22)).toEqual([44, 44, 22, 22]);
  });
});

describe('Voice memo (3p)', () => {
  it('asks for the mic first (main\'s words, Cancel closes at once); nothing starts before the answer', async () => {
    const onClose = vi.fn();
    render(<JournalRecord onSave={vi.fn()} onClose={onClose} />);
    expect(sheet().className).toBe('sheet rec');
    expect(texts(sheet(), '.sh, .recq')).toEqual(['Voice memo', 'Requesting microphone access…']);
    expect(g.PlatformBridge.requestMicPermission).toHaveBeenCalled();
    expect(g.PlatformBridge.nativeRecordStart).not.toHaveBeenCalled();
    await click(button('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(g.PlatformBridge.nativeRecordCancel).toHaveBeenCalled();
  });

  it('records: a playing letter paused, the clock, the level, 4:18 left at 0:42; Pause holds the clock; Resume goes on', async () => {
    recording(42);
    expect(g.AudioPlayer.pauseIfPlaying).toHaveBeenCalled();
    expect(g.holdUpdateReload).toHaveBeenCalledWith('recording');
    expect(texts(sheet(), '.recst, .rect, .recn')).toEqual(['Recording', '0:42', 'Up to 5 minutes · 4:18 left']);
    expect(texts(sheet(), '.recb .rb')).toEqual(['Cancel', 'Pause', 'Finish']);
    const bars = [...sheet().querySelectorAll('.recw span.p')].map((s) => /** @type {HTMLElement} */ (s).style.height);
    expect(bars).toHaveLength(40);
    expect(new Set(bars)).toEqual(new Set(['20px']));   // main's curve: sqrt(1/16) x 1.8 = 0.45 of 44 px
    await click(button('Pause'));
    expect(sheet().querySelector('.recst').className).toBe('recst is-paused');
    expect(texts(sheet(), '.recst, .recb .rb')).toEqual(['Paused', 'Cancel', 'Resume', 'Finish']);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(sheet().querySelector('.rect').textContent).toBe('0:42');
    await click(button('Resume'));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(sheet().querySelector('.rect').textContent).toBe('0:45');
    expect(g.PlatformBridge.nativeRecordResume).toHaveBeenCalled();
  });

  it('the phone\'s own pause (the screen locked) shows Paused', () => {
    recording(5);
    act(() => { g.__onNativeRecordingPaused(); });
    expect(sheet().querySelector('.recst').textContent).toBe('Paused');
  });

  it('Finish: the review at once; the take committed unlinked BEFORE it can be saved; Save links it after the editor has it', async () => {
    const { onSave } = recording(45);
    await click(button('Finish'));
    expect(g.PlatformBridge.nativeRecordStop).toHaveBeenCalled();
    expect(g.PlatformBridge.endAudioSession).toHaveBeenCalled();
    expect(texts(sheet(), '.recst, .rect, .recb .rb')).toEqual(['Review', '0:00 / 0:45', 'Discard', 'Play', 'Save']);
    expect(sheet().querySelector('.recw.scrub').getAttribute('aria-valuetext')).toBe('0:00 of 0:45');
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await act(async () => { g.__onNativeRecordingComplete(null, 45200, 'audio/webm', blob); });
    expect(g.JournalMediaStore.put).toHaveBeenCalledWith({ type: 'audio', blob, mime: 'audio/webm', duration: 45, unlinked: true });
    await click(button('Save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const memo = onSave.mock.calls[0][0];
    expect(memo).toMatchObject({ mediaId: 'm1', duration: 45 });
    expect(memo.samples).toHaveLength(48);
    expect(order).toEqual(['put', 'saved:m1', 'linked']);
  });

  it('Save tapped while the take is still stopping saves it the moment it arrives', async () => {
    const { onSave } = recording(8);
    await click(button('Finish'));
    await click(button('Save'));
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { g.__onNativeRecordingComplete(null, 8000, 'audio/webm', new Blob(['x'], { type: 'audio/webm' })); });
    await flush();
    expect(order).toEqual(['put', 'saved:m1', 'linked']);
  });

  it('stops itself at main\'s 5 minutes', () => {
    recording(MAX_RECORDING_SECONDS);
    expect(g.PlatformBridge.nativeRecordStop).toHaveBeenCalledTimes(1);
    expect(texts(sheet(), '.recst, .rect')).toEqual(['Review', '0:00 / 5:00']);
  });

  it('Cancel with seconds recorded asks first; Escape answers the question, not the sheet; Yes, discard lets go of the mic', async () => {
    const { onClose } = recording(2);
    await click(button('Cancel'));
    expect(texts(sheet(), '.recc .fine, .recc button')).toEqual(['Discard this recording?', 'Cancel', 'Yes, discard']);
    expect(sheet().querySelector('.recb')).toBe(null);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(sheet().querySelector('.recc')).toBe(null);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });   // Back asks, as Cancel does
    expect(sheet().querySelector('.recc')).not.toBe(null);
    await click(button('Yes, discard'));
    expect(onClose).toHaveBeenCalled();
    expect(g.PlatformBridge.nativeRecordCancel).toHaveBeenCalled();
    expect(g.JournalMediaStore.delete).not.toHaveBeenCalled();
  });

  it('Discard in the review deletes the take it had committed (main\'s journal-3)', async () => {
    const { onClose, onSave } = recording(5);
    await click(button('Finish'));
    await act(async () => { g.__onNativeRecordingComplete(null, 5000, 'audio/webm', new Blob(['x'])); });
    await click(button('Discard'));
    await click(button('Yes, discard'));
    expect(g.JournalMediaStore.delete).toHaveBeenCalledWith('m1');
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('main\'s failures in its words: the mic refused; nothing recorded (no Try again); the store full', async () => {
    render(<JournalRecord onSave={vi.fn()} onClose={vi.fn()} />);
    act(() => { g.__onMicPermissionResult(false); });
    expect(sheet().querySelector('.recq').textContent).toBe('Microphone permission denied. Enable mic access for this app, then try again.');
    expect(texts(sheet(), '.stack button')).toEqual(['Close']);
    cleanup();
    recording(3);
    await click(button('Finish'));
    await act(async () => { g.__onNativeRecordingComplete(null, 3000, 'audio/webm', new Blob([])); });
    expect(sheet().querySelector('.recq').textContent).toBe('Nothing was recorded. Close this and record again, speaking after the timer starts.');
    expect(g.JournalMediaStore.put).not.toHaveBeenCalled();
    cleanup();
    g.StorageHealth = { checkBeforeWrite: () => ({ ok: false }), onWriteFailure: vi.fn() };
    recording(0);
    expect(sheet().querySelector('.recq').textContent).toBe('Storage is full. Free up space before recording.');
    expect(g.PlatformBridge.nativeRecordStart).toHaveBeenCalledTimes(1);   // the second sheet's only
  });

  it('a prompt that never settles times out after 20 s (main\'s watchdog)', () => {
    render(<JournalRecord onSave={vi.fn()} onClose={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(sheet().querySelector('.recq').textContent).toBe('Microphone request timed out. If a permission prompt appeared, please try again.');
  });

  it('Android: the served file fetched with retries; the store has it, then native lets go of it, by name', async () => {
    g.PlatformBridge = bridge({ isAndroid: true });
    const file = new Blob(['m4a'], { type: 'audio/mp4' });
    g.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce({ ok: true, blob: async () => file });
    recording(6);
    expect(g.PlatformBridge.startAudioSession).not.toHaveBeenCalled();   // Android takes focus in nativeRecordStart
    await click(button('Finish'));
    await act(async () => { g.__onNativeRecordingComplete(null, 6000, 'audio/mp4', undefined, 'https://appassets.androidplatform.net/recordings/abc.m4a'); });
    await act(() => vi.advanceTimersByTimeAsync(500));
    await flush();
    expect(g.fetch).toHaveBeenCalledTimes(2);
    expect(g.JournalMediaStore.put).toHaveBeenCalledWith(expect.objectContaining({ sourceName: 'abc.m4a', duration: 6, unlinked: true }));
    expect(g.PlatformBridge.nativeDeleteRecording).toHaveBeenCalledWith('abc.m4a');
    expect(g.JournalMediaStore.put.mock.invocationCallOrder[0]).toBeLessThan(g.PlatformBridge.nativeDeleteRecording.mock.invocationCallOrder[0]);
  });

  it('Android: a fetch that keeps failing offers Try again; when that fails too, the file read by name, and an empty one said so', async () => {
    g.PlatformBridge = bridge({ isAndroid: true, nativeListRecordings: vi.fn(() => '[{"name":"abc.m4a","size":0}]') });
    g.fetch = vi.fn(async () => { throw new Error('down'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    recording(4);
    await click(button('Finish'));
    await act(async () => { g.__onNativeRecordingComplete(null, 4000, 'audio/mp4', undefined, 'https://x/recordings/abc.m4a'); });
    await act(() => vi.advanceTimersByTimeAsync(500));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    await flush();
    expect(sheet().querySelector('.recq').textContent).toBe('Could not read the recording from the device.');
    expect(texts(sheet(), '.stack button')).toEqual(['Try again', 'Close']);
    await click(button('Try again'));
    expect(sheet().querySelector('.recq').textContent).toBe('Getting your recording…');
    await act(() => vi.advanceTimersByTimeAsync(500));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    await flush();
    expect(g.fetch).toHaveBeenCalledTimes(6);
    expect(g.PlatformBridge.nativeReadRecording).toHaveBeenCalledWith('abc.m4a');
    expect(sheet().querySelector('.recq').textContent).toBe('That recording is empty — nothing was captured. Close this and record again, speaking after the timer starts.');
    expect(texts(sheet(), '.stack button')).toEqual(['Close']);
    expect(g.JournalMediaStore.put).not.toHaveBeenCalled();
  });

  it('a gate boot draws its state and never touches the mic', () => {
    render(<JournalRecord gate={{ state: 'recording', at: 42, level: [0.5] }} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(texts(sheet(), '.recst, .rect, .recn')).toEqual(['Recording', '0:42', 'Up to 5 minutes · 4:18 left']);
    expect(g.PlatformBridge.requestMicPermission).not.toHaveBeenCalled();
    expect(g.holdUpdateReload).not.toHaveBeenCalled();
    expect(g.__onNativeRecordingComplete).toBeUndefined();
  });

  it('on the laptop: a dialog with its x, which asks as Cancel does', async () => {
    const { onClose } = recording(0, { desktop: true });
    expect(sheet().className).toBe('dlg rec');
    await click(sheet().querySelector('.ic.x'));
    expect(onClose).toHaveBeenCalled();
  });
});
