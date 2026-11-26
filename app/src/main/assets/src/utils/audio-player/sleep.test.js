/* audio-player/sleep — the sleep timer: the countdown, "when this recording
   ends", and the fade into both. Only core.js is mocked: the player's shared
   state is a plain object the cases set, the element is a fake with a volume
   the fade writes, and fake timers drive the countdown. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  el: /** @type {any} */ (null),
  state: /** @type {any} */ ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, loop: null, failed: null }),
  late: /** @type {any} */ ({}),
  notify: vi.fn(),
  toast: vi.fn(),
  toastAction: vi.fn(),
}));

vi.mock('./core.js', () => ({
  get _el() { return h.el; },
  late: h.late,
  _notify: h.notify,
  get _state() { return h.state; },
  _toast: h.toast,
  _toastAction: h.toastAction,
}));

/** @type {typeof import('./sleep.js')} */
let S;

const track = { key: 'vol1:letter1', url: 'https://cdn.example/vol1.mp3', title: 'Letter 1' };

function makeEl() {
  return { volume: 1, pause: vi.fn(), currentTime: 0, duration: 60 };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T08:00:00Z'));
  vi.resetModules();
  vi.clearAllMocks();
  // late is a plain object the mock factory hands out by reference: mutate it
  // in place, never reassign it, or the module keeps the old one.
  Object.keys(h.late).forEach((k) => delete h.late[k]);
  Object.assign(h.late, {
    _extendQueue: vi.fn(),
    _markPaused: vi.fn(),
    toggle: vi.fn(),
  });
  S = await import('./sleep.js');
  h.el = makeEl();
  h.state = {
    status: 'playing', queue: [track], qi: 0, time: 0, duration: 60, rate: 1,
    loop: null, failed: null, sleepEndsAt: 0, sleepMinutes: 0,
    sleepAtTrackEnd: false, sleepAtQueueEnd: false,
  };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('audio-player sleep', () => {
  it('setSleepTimer arms the countdown and the preset', () => {
    expect(S.setSleepTimer(15)).toBe(true);
    expect(h.state.sleepMinutes).toBe(15);
    expect(h.state.sleepEndsAt).toBe(Date.now() + 15 * 60000);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(S.getSleepRemainingSeconds()).toBe(900);
  });

  it('setSleepTimer clamps minutes to 1–120', () => {
    expect(S.setSleepTimer(0)).toBe(true);
    expect(h.state.sleepMinutes).toBe(1);
    expect(S.setSleepTimer(200)).toBe(true);
    expect(h.state.sleepMinutes).toBe(120);
    expect(S.setSleepTimer(NaN)).toBe(true);
    expect(h.state.sleepMinutes).toBe(1);
  });

  it('setSleepTimer refuses an idle bar or an empty queue', () => {
    h.state.status = 'idle';
    expect(S.setSleepTimer(15)).toBe(false);
    h.state.status = 'playing';
    h.state.queue = [];
    expect(S.setSleepTimer(15)).toBe(false);
    expect(h.state.sleepEndsAt).toBe(0);
  });

  it('setSleepTimer re-arm clears the old timeout', () => {
    S.setSleepTimer(15);
    vi.advanceTimersByTime(5 * 60000);
    expect(h.el.pause).not.toHaveBeenCalled();
    S.setSleepTimer(30);
    expect(h.state.sleepMinutes).toBe(30);
    vi.advanceTimersByTime(10 * 60000);
    // The first arm's 15-minute deadline passes: nothing fires.
    expect(h.el.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20 * 60000);
    expect(h.el.pause).toHaveBeenCalledTimes(1);
  });

  it('_sleepTimerFire pauses, marks paused, restores volume, and toasts when live', () => {
    S.setSleepTimer(15);
    h.notify.mockClear();
    h.el.volume = 0.3;
    vi.advanceTimersByTime(15 * 60000);
    expect(h.el.pause).toHaveBeenCalledTimes(1);
    expect(h.late._markPaused).toHaveBeenCalledTimes(1);
    expect(h.el.volume).toBe(1);
    expect(h.toastAction).toHaveBeenCalledWith(
      'Sleep timer ended. Playback paused.', 'Keep listening +15 min', expect.any(Function),
    );
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('_sleepTimerFire when not live notifies instead of toasting, but still pauses', () => {
    S.setSleepTimer(15);
    h.state.status = 'paused';
    h.notify.mockClear();
    vi.advanceTimersByTime(15 * 60000);
    expect(h.el.pause).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.toastAction).not.toHaveBeenCalled();
  });

  it('the sleep-ended toast plays on for another quarter hour only while still paused', () => {
    S.setSleepTimer(15);
    vi.advanceTimersByTime(15 * 60000);
    const cb = h.toastAction.mock.calls[0][2];
    h.state.status = 'paused';
    cb();
    expect(h.late.toggle).toHaveBeenCalledTimes(1);
    expect(h.state.sleepMinutes).toBe(15);
    expect(S.getSleepRemainingSeconds()).toBe(900);
  });

  it('the sleep-ended toast does not toggle when already playing', () => {
    S.setSleepTimer(15);
    vi.advanceTimersByTime(15 * 60000);
    const cb = h.toastAction.mock.calls[0][2];
    h.state.status = 'playing';
    cb();
    expect(h.late.toggle).not.toHaveBeenCalled();
    expect(h.state.sleepMinutes).toBe(15);
  });

  it('setSleepAtTrackEnd replaces the countdown', () => {
    S.setSleepTimer(15);
    expect(S.setSleepAtTrackEnd()).toBe(true);
    expect(h.state.sleepEndsAt).toBe(0);
    expect(h.state.sleepMinutes).toBe(0);
    expect(h.state.sleepAtTrackEnd).toBe(true);
    expect(h.notify).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(16 * 60000);
    expect(h.el.pause).not.toHaveBeenCalled();
  });

  it('setSleepAtTrackEnd refuses an idle bar or an empty queue', () => {
    h.state.status = 'idle';
    expect(S.setSleepAtTrackEnd()).toBe(false);
    h.state.status = 'playing';
    h.state.queue = [];
    expect(S.setSleepAtTrackEnd()).toBe(false);
  });

  it('setSleepAtQueueEnd arms the queue-end flag', () => {
    expect(S.setSleepAtQueueEnd()).toBe(true);
    expect(h.state.sleepAtQueueEnd).toBe(true);
    expect(h.state.sleepEndsAt).toBe(0);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('_sleepAtTrackEndFire pauses at the end, one-shot, and toasts when live', () => {
    S.setSleepAtTrackEnd();
    h.notify.mockClear();
    h.el.volume = 0.2;
    S._sleepAtTrackEndFire();
    expect(h.state.sleepAtTrackEnd).toBe(false);
    expect(h.el.pause).toHaveBeenCalledTimes(1);
    expect(h.late._markPaused).toHaveBeenCalledTimes(1);
    expect(h.el.volume).toBe(1);
    expect(h.toastAction).toHaveBeenCalledTimes(1);
    expect(h.notify).not.toHaveBeenCalled();
    // One-shot: both flags are gone, so the end-of-track path will not fire again.
    expect(h.state.sleepAtTrackEnd).toBe(false);
    expect(h.state.sleepAtQueueEnd).toBe(false);
  });

  it('_sleepAtTrackEndFire when not live notifies and does not pause', () => {
    S.setSleepAtTrackEnd();
    h.notify.mockClear();
    h.state.status = 'paused';
    S._sleepAtTrackEndFire();
    expect(h.el.pause).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.toastAction).not.toHaveBeenCalled();
  });

  it('_sleepAtTrackEndFire lets go of a held run on the last track', () => {
    h.state.queue = [track, track];
    h.state.qi = 1;
    S.setSleepAtQueueEnd();
    S._sleepAtTrackEndFire();
    expect(h.late._extendQueue).toHaveBeenCalledTimes(1);
  });

  it('_sleepsAtThisEnd reads the track flag and the queue-end last track', () => {
    expect(S._sleepsAtThisEnd()).toBe(false);
    h.state.sleepAtTrackEnd = true;
    expect(S._sleepsAtThisEnd()).toBe(true);
    h.state.sleepAtTrackEnd = false;
    h.state.sleepAtQueueEnd = true;
    h.state.queue = [track, track];
    h.state.qi = 0;
    expect(S._sleepsAtThisEnd()).toBe(false);
    h.state.qi = 1;
    expect(S._sleepsAtThisEnd()).toBe(true);
  });

  it('getSleepRemainingSeconds floors, and is 0 unarmed or after firing', () => {
    expect(S.getSleepRemainingSeconds()).toBe(0);
    S.setSleepTimer(15);
    expect(S.getSleepRemainingSeconds()).toBe(900);
    vi.advanceTimersByTime(1500);
    expect(S.getSleepRemainingSeconds()).toBe(898);
    vi.advanceTimersByTime(15 * 60000);
    expect(S.getSleepRemainingSeconds()).toBe(0);
  });

  it('_syncSleepVolume fades linearly in the last 20 seconds of a countdown', () => {
    h.state.sleepEndsAt = Date.now() + 10000;
    S._syncSleepVolume();
    expect(h.el.volume).toBeCloseTo(0.5, 5);
    h.state.sleepEndsAt = Date.now() + 30000;
    h.el.volume = 0.5;
    S._syncSleepVolume();
    expect(h.el.volume).toBe(1);
  });

  it('_syncSleepVolume fades on the recording remaining at the playing rate', () => {
    h.state.sleepAtTrackEnd = true;
    h.state.duration = 100;
    h.state.time = 95;
    h.state.rate = 1;
    S._syncSleepVolume();
    expect(h.el.volume).toBeCloseTo(0.25, 5);
    h.state.time = 90;
    h.state.rate = 2;
    S._syncSleepVolume();
    expect(h.el.volume).toBeCloseTo(0.25, 5);
  });

  it('_syncSleepVolume does not write when the volume already matches', () => {
    let writes = 0;
    let v = 0.5;
    Object.defineProperty(h.el, 'volume', {
      get: () => v, set: (x) => { v = x; writes++; }, configurable: true,
    });
    h.state.sleepEndsAt = Date.now() + 10000;
    S._syncSleepVolume();
    expect(writes).toBe(0);
    expect(h.el.volume).toBe(0.5);
  });

  it('_syncSleepVolume survives a throwing volume and no element', () => {
    Object.defineProperty(h.el, 'volume', {
      get: () => 1, set: () => { throw new Error('no volume'); }, configurable: true,
    });
    h.state.sleepEndsAt = Date.now() + 10000;
    expect(() => S._syncSleepVolume()).not.toThrow();
    h.el = null;
    expect(() => S._syncSleepVolume()).not.toThrow();
  });

  it('_clearSleepTimer clears everything and notifies only when something was armed', () => {
    S.setSleepTimer(15);
    S._clearSleepTimer();
    expect(h.state.sleepEndsAt).toBe(0);
    expect(h.state.sleepMinutes).toBe(0);
    expect(h.notify).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(16 * 60000);
    expect(h.el.pause).not.toHaveBeenCalled();
    h.notify.mockClear();
    S._clearSleepTimer();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('_clearSleepTimer with notify false stays silent', () => {
    S.setSleepTimer(15);
    h.notify.mockClear();
    S._clearSleepTimer(false);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('clearSleepTimer disarms both modes', () => {
    S.setSleepAtTrackEnd();
    S.clearSleepTimer();
    expect(h.state.sleepAtTrackEnd).toBe(false);
  });

  it('_clearSleepTimer lets go of a held run on the last track only', () => {
    h.state.queue = [track, track];
    h.state.qi = 1;
    S.setSleepAtQueueEnd();
    S._clearSleepTimer();
    expect(h.late._extendQueue).toHaveBeenCalledTimes(1);
    h.state.qi = 0;
    S.setSleepAtQueueEnd();
    S._clearSleepTimer();
    expect(h.late._extendQueue).toHaveBeenCalledTimes(1);
  });

  it('setSleepTimer replaces a queue-end sleep and lets go of the held run', () => {
    h.state.queue = [track, track];
    h.state.qi = 1;
    S.setSleepAtQueueEnd();
    expect(S.setSleepTimer(15)).toBe(true);
    expect(h.state.sleepAtQueueEnd).toBe(false);
    expect(h.late._extendQueue).toHaveBeenCalledTimes(1);
  });
});

/* audio-1 (audit 2026-11-23): the end usually comes with the screen off. The "+15 min" offer waits for the
   return, and a Play soon after the end (the lock screen, a headset) arms another quarter hour by itself. */
describe('after a sleep end', () => {
  /* Not vi.stubGlobal('document', ...): in the vmThreads pool (the pre-commit hook's fast run) the global is jsdom's
     window, whose `document` is unforgeable, so replacing it throws "Cannot redefine property: document". A
     configurable getter on the real document works in every pool; the original descriptor is put back after each test. */
  let visibility = 'visible';
  let saved;
  const hidden = (v) => { visibility = v ? 'hidden' : 'visible'; };
  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => {
    if (saved) Object.defineProperty(document, 'visibilityState', saved);
    else Reflect.deleteProperty(document, 'visibilityState');   // jsdom's own getter (on the prototype) answers again
    visibility = 'visible';
  });
  const end = () => { S.setSleepTimer(15); vi.advanceTimersByTime(15 * 60000); h.state.status = 'paused'; };

  it('holds the offer while the screen is off and shows it on the return, if still paused', () => {
    hidden(true);
    end();
    expect(h.toastAction).not.toHaveBeenCalled();
    hidden(false);
    S._sleepOnVisible();
    expect(h.toastAction).toHaveBeenCalledTimes(1);
    expect(h.toastAction.mock.calls[0][1]).toBe('Keep listening +15 min');
    S._sleepOnVisible();
    expect(h.toastAction).toHaveBeenCalledTimes(1);   // once
  });

  it('shows no held offer once playback is going again', () => {
    hidden(true);
    end();
    h.state.status = 'playing';
    hidden(false);
    S._sleepOnVisible();
    expect(h.toastAction).not.toHaveBeenCalled();
  });

  it('a Play within ten minutes of the end arms another 15 minutes, once', () => {
    hidden(true);
    end();
    vi.advanceTimersByTime(9 * 60000);
    h.state.status = 'playing';
    S._sleepOnPlay();
    expect(h.state.sleepMinutes).toBe(15);
    expect(S.getSleepRemainingSeconds()).toBe(900);
    expect(h.toast).not.toHaveBeenCalled();   // hidden: no notice nobody sees
    vi.advanceTimersByTime(15 * 60000);
    expect(h.el.pause).toHaveBeenCalledTimes(2);   // the re-armed timer stopped it again
  });

  it('says so when the re-arm happens with the screen on, once the offer has gone', () => {
    hidden(false);
    end();
    h.state.status = 'playing';
    S._sleepOnPlay();
    expect(h.toast).not.toHaveBeenCalled();   // the offer is still up: its button would add the same 15
    expect(h.state.sleepMinutes).toBe(15);
    S.clearSleepTimer();
    end();
    vi.advanceTimersByTime(9000);
    h.state.status = 'playing';
    S._sleepOnPlay();
    expect(h.toast).toHaveBeenCalledWith('Sleep timer on again: 15 more minutes.');
  });

  it('a Play after the window runs on uncapped, as before', () => {
    hidden(true);
    end();
    vi.advanceTimersByTime(S.SLEEP_REARM_MS + 1000);
    h.state.status = 'playing';
    S._sleepOnPlay();
    expect(h.state.sleepEndsAt).toBe(0);
  });

  it('a Clear after the end cancels the quiet re-arm', () => {
    hidden(true);
    end();
    S.clearSleepTimer();
    h.state.status = 'playing';
    S._sleepOnPlay();
    expect(h.state.sleepEndsAt).toBe(0);
  });

  it('a mode chosen by hand in between is kept, not replaced', () => {
    hidden(true);
    end();
    h.state.status = 'playing';
    S.setSleepAtTrackEnd();
    S._sleepOnPlay();
    expect(h.state.sleepAtTrackEnd).toBe(true);
    expect(h.state.sleepEndsAt).toBe(0);
  });
});
