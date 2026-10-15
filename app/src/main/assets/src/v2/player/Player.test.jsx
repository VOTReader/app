/* The v2 player in the shell (rv1): the gate rows 2b, 6a, 6b, 6c and 9b, the mini player, the laptop's bar and panel,
   Android's back, full screen by double-tap, and the real engine reached through bundle-d's globals. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { resetHints, HINT } from './full-screen.jsx';
import { FULLSCREEN_GESTURE_EVENT } from '../../utils/fullscreen-gesture-event.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const key = (el, k) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
/** A pointer event jsdom can send (stamped: vmThreads' jsdom clock never reaches a Date.now spy, ra3 lesson). */
const pointer = (el, type, { x = 100, y = 200, t = 0 } = {}) => act(() => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'isPrimary', { value: true });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
});
const tap = (el, t, x) => { pointer(el, 'pointerdown', { t, x }); pointer(el, 'pointerup', { t: t + 60, x }); };
/** Android's back button (MainActivity calls window.handleAndroidBack). */
const androidBack = () => { let r; act(() => { r = g.handleAndroidBack(); }); return r; };
const desktop = (on) => { g.matchMedia = () => ({ matches: on, addEventListener() {}, removeEventListener() {} }); };
/** @returns {HTMLElement} */
const el = (c, sel) => /** @type {HTMLElement} */ (c.querySelector(sel));
const text = (c, sel) => { const el = c.querySelector(sel); return el ? el.textContent : null; };

const LETTERS = Array.from({ length: 29 }, (_, i) => ({ id: 'letter-' + (i + 1), num: i + 1, title: 'Letter ' + (i + 1),
  date: '10/' + (i + 1) + '/04', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Paragraph of letter ' + (i + 1) + '.' }] }] }));
LETTERS[0] = { ...LETTERS[0], id: 'chosen-by-god', title: 'Chosen by God', date: '8/31/04' };
LETTERS[1] = { ...LETTERS[1], id: 'honor', title: 'Honor Not the Day of the Dead... Honor God', date: '10/6/04' };

beforeEach(() => {
  g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }]]);
  g.LETTERS_V1 = [{ id: 'a-word-of-warning', title: 'A Word of Warning' }].concat(LETTERS);
  resetHints();
});
afterEach(() => {
  cleanup();
  delete g.COL_BY_KEY; delete g.LETTERS_V1; delete g.__loadVotCorpus; delete g.__votCorpus; delete g.matchMedia; delete g.AudioPlayer;
  delete g.OfflineAudio; delete g.PlatformBridge;
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('gate 2b-now-playing (phone)', () => {
  it('Now playing over Volume One: Letter 1 at 3:51 of 10:08, Benjamin, on this phone; nothing stored', async () => {
    const { container: c } = render(<V2App gateId="2b-now-playing" />);
    const np = c.querySelector('.np-screen');
    expect(np).not.toBeNull();
    expect(text(np, '.np-title')).toBe('Now playing');
    expect(text(np, '.cover.np-art .cn')).toBe('I');
    expect(text(np, '.cover.np-art .cl')).toBe('Volume One');
    expect(text(np, '.np-meta .overline')).toBe('Volume One · Letter 1');
    expect(text(np, '.np-t')).toBe('Chosen by God');
    expect(text(np, '.np-s')).toBe('Read by Benjamin·On this phone');
    expect([...np.querySelectorAll('.times span')].map((s) => s.textContent)).toEqual(['3:51', '−6:17']);
    expect(el(np, '.scrub .fi').style.width).toBe('37.99%');
    expect(np.querySelector('.bigplay').getAttribute('aria-label')).toBe('Pause');
    expect([...np.querySelectorAll('.np-chips .chip')].map((s) => s.textContent)).toEqual(['1× speed', 'Sleep timer']);
    expect(text(np, '.np-ra .t')).toBe('Read along');
    expect(c.querySelector('.sheet')).toBeNull();
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(localStorage.length).toBe(0);
  });

  it('the gate waits for the lazy volume before it says ready', async () => {
    delete g.LETTERS_V1;
    let finish = () => {};
    // like index.html's loader: one promise while a load is in flight, whoever asks
    let inFlight = null;
    g.__votCorpus = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0 };
    g.__loadVotCorpus = () => inFlight || (inFlight = new Promise((res) => { finish = () => { g.LETTERS_V1 = LETTERS; g.__votCorpus.loaded = true; res(undefined); }; }));
    const { container: c } = render(<V2App gateId="2b-now-playing" />);
    await waitFor(() => expect(html.dataset.gate).toBe('waiting'));
    expect(c.querySelector('.np-screen')).toBeNull();
    await act(async () => { finish(); });
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(text(c, '.np-t')).toBe('Chosen by God');
  });

  it('a volume that fails to load leaves nothing playing, and the gate still says ready', async () => {
    delete g.LETTERS_V1;
    g.__votCorpus = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0 };
    g.__loadVotCorpus = vi.fn(() => Promise.reject(new Error('offline')));
    const { container: c } = render(<V2App gateId="2b-now-playing" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(c.querySelector('.np-screen')).toBeNull();
    expect(c.querySelector('.mini')).toBeNull();
  });

  it('Read along opens the letter and closes the player; the controls drive the engine', async () => {
    const { container: c } = render(<V2App gateId="2b-now-playing" />);
    click(c.querySelector('[aria-label="Forward 15 seconds"]'));
    expect([...c.querySelectorAll('.np-screen .times span')].map((s) => s.textContent)).toEqual(['4:06', '−6:02']);
    click(c.querySelector('.bigplay'));
    expect(c.querySelector('.bigplay').getAttribute('aria-label')).toBe('Play');
    click(c.querySelector('.np-ra'));
    expect(c.querySelector('.np-screen')).toBeNull();
    expect(text(c, '.tb .title')).toBe('Volume One');
    await waitFor(() => expect(c.querySelector('.reader-head h1').textContent).toBe('Chosen by God'));
    expect(text(c, '.mini .t')).toBe('Chosen by God');
    expect(text(c, '.mini .s')).toBe('Volume One · Benjamin · 6 min left');
  });
});

describe('gate 6a-speed', () => {
  it('1.25x, faster than recorded, the 1.25x pick lit; 1 % steps; Done closes', () => {
    const { container: c } = render(<V2App gateId="6a-speed" />);
    const sheet = c.querySelector('.sheet.spd');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(text(sheet, '.spd-now .v')).toBe('1.25×');
    expect(text(sheet, '.spd-s')).toBe('Faster than recorded');
    expect(el(sheet, '.spd-sl .fi').style.width).toBe('30%');
    expect([...sheet.querySelectorAll('.spd-chips .chip')].map((s) => s.textContent)).toEqual(['0.75×', '1×', '1.25×', '1.5×', '1.75×', '2×']);
    expect(text(sheet, '.spd-chips .chip.on')).toBe('1.25×');
    expect(text(c, '.np-chips .chip')).toBe('1.25× speed');
    click(sheet.querySelector('[aria-label="Faster by 1 %"]'));
    expect(text(c, '.spd-now .v')).toBe('1.26×');
    expect(c.querySelector('.spd-chips .chip.on')).toBeNull();
    click([...c.querySelectorAll('.spd-chips .chip')][1]);
    expect(text(c, '.spd-s')).toBe('Normal speed');
    click(c.querySelector('.sheet .done'));
    expect(c.querySelector('.sheet')).toBeNull();
    expect(c.querySelector('.np-screen')).not.toBeNull();
  });
});

describe('gate 6b-sleep', () => {
  it('30 minutes ticked with 24 min left, the chip says 24 min; Off clears it', () => {
    const { container: c } = render(<V2App gateId="6b-sleep" />);
    const rows = [...c.querySelectorAll('.sheet.slp .srow.opt')];
    expect(rows.map((r) => r.querySelector('.t').textContent)).toEqual(['Off', '15 minutes', '30 minutes', '1 hour', 'When this recording ends']);
    expect(rows.map((r) => r.classList.contains('on'))).toEqual([false, false, true, false, false]);
    expect(text(rows[2], '.s')).toBe('24 min left');
    expect(rows[2].querySelector('.ck')).not.toBeNull();
    expect(text(c, '.sheet .fine')).toBe('When it runs out, playback pauses and a note says so.');
    expect(text(c, '.np-chips .chip:nth-child(2)')).toBe('24 min');
    click(rows[0]);
    expect(c.querySelector('.sheet')).toBeNull();
    expect(text(c, '.np-chips .chip:nth-child(2)')).toBe('Sleep timer');
    click(c.querySelector('.np-chips .chip:nth-child(2)'));
    click([...c.querySelectorAll('.srow.opt')][4]);
    expect(text(c, '.np-chips .chip:nth-child(2)')).toBe('End of recording');
  });
});

describe('gate 6c-up-next', () => {
  it('1 of 29: the playing letter, then the rest by date; reorder by grip keys, clear upcoming', () => {
    const { container: c } = render(<V2App gateId="6c-up-next" />);
    const sheet = c.querySelector('.sheet.tall.upn');
    expect(text(sheet, '.upn-h .sh')).toBe('Up next');
    expect(text(sheet, '.upn-h .cnt')).toBe('1 of 29');
    const rows = [...sheet.querySelectorAll('.rows.q .num-row')];
    expect(rows).toHaveLength(29);
    expect(rows[0].classList.contains('qcur')).toBe(true);
    expect(text(rows[0], '.s')).toBe('Playing now · Benjamin');
    expect(rows[0].querySelector('.eq')).not.toBeNull();
    expect(rows[0].querySelector('.grip')).toBeNull();
    expect([text(rows[1], '.no'), text(rows[1], '.t'), text(rows[1], '.s')]).toEqual(['2', 'Honor Not the Day of the Dead... Honor God', '10/6/04']);
    expect(rows[1].querySelector('.grip').getAttribute('aria-label')).toBe('Move Honor Not the Day of the Dead... Honor God');
    key(rows[1].querySelector('.grip'), 'ArrowDown');
    expect([...c.querySelectorAll('.rows.q .num-row .t')].slice(1, 3).map((t) => t.textContent)).toEqual(['Letter 3', 'Honor Not the Day of the Dead... Honor God']);
    click(c.querySelector('.upn-h .textbtn'));
    expect(c.querySelectorAll('.rows.q .num-row')).toHaveLength(1);
    expect(text(c, '.upn-h .cnt')).toBe('1 of 1');
  });

  it('a sideways swipe removes a row; a tap plays it', () => {
    const { container: c } = render(<V2App gateId="6c-up-next" />);
    const row = () => [...c.querySelectorAll('.rows.q .num-row')][1];
    pointer(row(), 'pointerdown', { x: 50, y: 300 });
    pointer(row(), 'pointermove', { x: 170, y: 302 });
    pointer(row(), 'pointerup', { x: 170, y: 302 });
    expect(c.querySelectorAll('.rows.q .num-row')).toHaveLength(28);
    expect(text(row(), '.t')).toBe('Letter 3');
    pointer(row(), 'pointerdown', { x: 50, y: 300 });
    pointer(row(), 'pointerup', { x: 52, y: 301 });
    expect(text(c, '.upn-h .cnt')).toBe('2 of 28');
    expect(text(c, '.np-t')).toBe('Letter 3');
  });
});

describe('the mini player and Android back', () => {
  it('opens Now playing; back closes the sheet, then the player, then the page', () => {
    const { container: c } = render(<V2App gateId="6a-speed" />);
    expect(androidBack()).toBe('true');
    expect(c.querySelector('.sheet')).toBeNull();
    expect(androidBack()).toBe('true');
    expect(c.querySelector('.np-screen')).toBeNull();
    const mini = c.querySelector('.mini');
    expect(text(mini, '.t')).toBe('Chosen by God');
    expect(text(mini, '.s')).toBe('Volume One · Benjamin');
    expect(text(mini, '.cover.s40 .cn')).toBe('I');
    expect(el(mini, '.prog').style.width).toBe('37.99%');
    expect(mini.nextElementSibling.classList.contains('tabbar')).toBe(true);
    click(mini.querySelector('button'));
    expect(mini.querySelector('button').getAttribute('aria-label')).toBe('Play');
    expect(c.querySelector('.np-screen')).toBeNull();
    click(mini);
    expect(c.querySelector('.np-screen')).not.toBeNull();
    androidBack();
    expect(androidBack()).toBe('true');
    expect(text(c, '.tb .title')).toBeNull();
  });

  it('a gate row with nothing playing shows no player', () => {
    const { container: c } = render(<V2App gateId="1a-letter" />);
    expect(c.querySelector('.mini')).toBeNull();
    expect(c.querySelector('.np-screen')).toBeNull();
  });
});

describe('the laptop (D3, D4)', () => {
  it('2b docks Now playing on the right over the page, no bar; closing it brings the bar', () => {
    desktop(true);
    const { container: c } = render(<V2App gateId="2b-now-playing" />);
    const panel = c.querySelector('.pane > aside.panel');
    expect(panel).not.toBeNull();
    expect(text(panel, '.np-s')).toBe('Read by Benjamin·On this computer');
    expect(c.querySelector('.pbar')).toBeNull();
    click(panel.querySelector('[aria-label="Close the player"]'));
    const bar = c.querySelector('.pane > .pbar');
    expect(text(bar, '.now .t')).toBe('Chosen by God');
    expect(text(bar, '.now .s')).toBe('Volume One · Benjamin');
    expect(text(bar, '.xt .tm')).toBe('3:51 / 10:08');
    expect(text(bar, '.xt .chip')).toBe('1×');
    click(bar.querySelector('[aria-label="Up next"]'));
    expect(c.querySelector('.v2.dk > .dlg.upn')).not.toBeNull();
    expect(c.querySelector('.dlg .handle')).toBeNull();
    click(c.querySelector('.v2.dk > .scrim'));
    expect(c.querySelector('.dlg')).toBeNull();
  });
});

describe('full screen', () => {
  it('gate 9b: Letter 2, every bar hidden, the hint showing', async () => {
    const { container: c } = render(<V2App gateId="9b-full-screen" />);
    const root = c.querySelector('.v2-phone');
    expect(root.classList.contains('full')).toBe(true);
    expect(c.querySelector('.tb')).toBeNull();
    expect(c.querySelector('.tabbar')).toBeNull();
    expect(c.querySelector('.content.reader.full')).not.toBeNull();
    expect(text(c, '.content.reader .toast-wrap.hi .toast')).toBe(HINT);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('a double-tap on the text toggles it: immersive, the event read-along listens for, the hint at most 3 times', () => {
    const setImmersiveMode = vi.fn();
    g.PlatformBridge = { setImmersiveMode };
    const heard = vi.fn();
    document.addEventListener(FULLSCREEN_GESTURE_EVENT, heard);
    const { container: c } = render(<V2App gateId="1a-letter" />);
    const p = () => c.querySelector('.body p');
    tap(p(), 1000);
    expect(c.querySelector('.v2-phone.full')).toBeNull();
    tap(p(), 1200);
    expect(c.querySelector('.v2-phone.full')).not.toBeNull();
    expect(setImmersiveMode).toHaveBeenLastCalledWith(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(text(c, '.toast')).toBe(HINT);
    tap(p(), 3000); tap(p(), 3200);
    expect(c.querySelector('.v2-phone.full')).toBeNull();
    expect(c.querySelector('.tb')).not.toBeNull();
    expect(setImmersiveMode).toHaveBeenLastCalledWith(false);
    tap(p(), 5000); tap(p(), 5200); tap(p(), 6000); tap(p(), 6200);
    tap(p(), 7000); tap(p(), 7200); tap(p(), 8000); tap(p(), 8200);
    expect(c.querySelector('.v2-phone.full')).toBeNull();
    tap(p(), 9000); tap(p(), 9200);
    expect(c.querySelector('.v2-phone.full')).not.toBeNull();
    expect(c.querySelector('.toast')).toBeNull();
    expect(androidBack()).toBe('true');
    expect(c.querySelector('.v2-phone.full')).toBeNull();
    document.removeEventListener(FULLSCREEN_GESTURE_EVENT, heard);
  });

  it('two slow taps, two far apart, or taps on a control do nothing', () => {
    const { container: c } = render(<V2App gateId="1a-letter" />);
    const p = c.querySelector('.body p');
    tap(p, 1000); tap(p, 2000);
    tap(p, 3000, 20); tap(p, 3100, 200);
    const pill = c.querySelector('.pill.play');
    tap(pill, 4000); tap(pill, 4100);
    expect(c.querySelector('.v2-phone.full')).toBeNull();
  });
});

describe('the real engine (bundle-d globals)', () => {
  function fakeEngine(over = {}) {
    const listeners = new Set();
    const state = { status: 'playing', queue: [{ key: 'one:chosen-by-god', title: 'Chosen by God', sub: 'Volume One', url: 'u1', readerCode: 'B' }],
      qi: 0, time: 10, duration: 608, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, ...over };
    let v = 0;
    return {
      state,
      emit() { v += 1; listeners.forEach((cb) => cb()); },
      api: {
        subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => v, getState: () => state,
        getSleepRemainingSeconds: () => 0, toggle: vi.fn(), prev: vi.fn(), next: vi.fn(), skip: vi.fn(), seek: vi.fn(),
        setPlaybackRate: vi.fn(), setSleepTimer: vi.fn(), setSleepAtTrackEnd: vi.fn(), clearSleepTimer: vi.fn(), playAt: vi.fn(),
        moveUpcoming: vi.fn(), removeUpcoming: vi.fn(), clearUpcoming: vi.fn(),
      },
    };
  }

  it('the mini player follows AudioPlayer; its controls call it; idle hides it', () => {
    const e = fakeEngine();
    g.AudioPlayer = e.api;
    g.OfflineAudio = { subscribe: () => () => {}, getVersion: () => 0, isSaved: (u) => u === 'u1' };
    const { container: c } = render(<V2App gateId={null} />);
    expect(text(c, '.mini .t')).toBe('Chosen by God');
    click(c.querySelector('.mini button'));
    expect(e.api.toggle).toHaveBeenCalledTimes(1);
    click(c.querySelector('.mini'));
    expect(text(c, '.np-s')).toBe('Read by Benjamin·On this phone');
    click(c.querySelector('[aria-label="Back 15 seconds"]'));
    expect(e.api.skip).toHaveBeenCalledWith(-15);
    act(() => { e.state.time = 231; e.emit(); });
    expect(text(c, '.np-screen .times span')).toBe('3:51');
    act(() => { e.state.status = 'idle'; e.emit(); });
    expect(c.querySelector('.np-screen')).toBeNull();
    expect(c.querySelector('.mini')).toBeNull();
  });
});
