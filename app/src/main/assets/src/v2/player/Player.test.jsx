/* The v2 player in the shell (rv1): the gate rows 2b, 6a, 6b, 6c and 9b, the mini player, the laptop's bar and panel,
   Android's back, full screen by double-tap, and the real engine reached through bundle-d's globals. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
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
  delete g.OfflineAudio; delete g.PlatformBridge; delete g.DownloadGate; delete g.StateStore;
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

  it('the big number takes a typed speed (v2-gaps 31, main types one too): Enter or leaving sets it, empty or Escape keeps it', () => {
    const { container: c } = render(<V2App gateId="6a-speed" />);
    const type = (value, how) => {
      click(c.querySelector('.spd-now button.v'));
      const input = /** @type {HTMLInputElement} */ (c.querySelector('.spd-now input.v'));
      expect(input.getAttribute('inputmode')).toBe('decimal');
      expect(input.value).toBe('');
      fireEvent.change(input, { target: { value } });
      if (how === 'blur') fireEvent.blur(input); else key(input, how);
    };
    expect(el(c, '.spd-now button.v').getAttribute('aria-label')).toBe('Speed 1.25×, tap to type a value');
    type('1.4', 'Enter');
    expect(c.querySelector('.spd-now input')).toBeNull();
    expect(text(c, '.spd-now .v')).toBe('1.4×');
    expect(text(c, '.np-chips .chip')).toBe('1.4× speed');
    type('0.9', 'blur');
    expect(text(c, '.spd-now .v')).toBe('0.9×');
    expect(text(c, '.spd-s')).toBe('Slower than recorded');
    type('125', 'Enter'); // a whole number past 3 is a percentage
    expect(text(c, '.spd-now .v')).toBe('1.25×');
    expect(text(c, '.spd-chips .chip.on')).toBe('1.25×');
    type('7', 'Enter'); // past the range: the top of it
    expect(text(c, '.spd-now .v')).toBe('3×');
    type('0.2', 'Enter');
    expect(text(c, '.spd-now .v')).toBe('0.5×');
    type('', 'Enter');
    expect(text(c, '.spd-now .v')).toBe('0.5×');
    type('2', 'Escape');
    expect(text(c, '.spd-now .v')).toBe('0.5×');
    expect(c.querySelector('.sheet.spd')).not.toBeNull();
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

  it('with no swipe (keys, a screen reader): Delete on the grip or the Remove button takes a row out; a row plays from Enter', () => {
    const { container: c } = render(<V2App gateId="6c-up-next" />);
    const row = () => [...c.querySelectorAll('.rows.q .num-row')][1];
    expect([...c.querySelectorAll('.rows.q .num-row')][0].querySelector('button.rm')).toBeNull();
    key(row().querySelector('.grip'), 'Delete');
    expect(c.querySelectorAll('.rows.q .num-row')).toHaveLength(28);
    expect(text(row(), '.t')).toBe('Letter 3');
    const rm = row().querySelector('button.rm');
    expect(rm.getAttribute('aria-label')).toBe('Remove Letter 3 from up next');
    pointer(rm, 'pointerdown', { x: 50, y: 300 }); // a finger on it is not also a tap on the row
    pointer(rm, 'pointerup', { x: 50, y: 300 });
    click(rm);
    expect(c.querySelectorAll('.rows.q .num-row')).toHaveLength(27);
    expect(text(c, '.upn-h .cnt')).toBe('1 of 27');
    const play = row().querySelector('.tx');
    expect([play.getAttribute('role'), play.getAttribute('aria-label')]).toEqual(['button', 'Play now: Letter 4']);
    key(play, 'Enter');
    expect(text(c, '.upn-h .cnt')).toBe('2 of 27');
    expect(text(c, '.np-t')).toBe('Letter 4');
  });
});

/** bundle-d's AudioPlayer as far as the ⋮ reads it: Chosen by God has Benjamin's reading and a text-to-speech one. */
const twoVoices = () => {
  g.AudioPlayer = {
    renditionsFor: vi.fn(() => [{ reader: 'B' }, { reader: 'V' }]),
    readerLabel: (r) => ({ B: 'Read by Benjamin', V: 'Text-to-speech' })[r] || null,
  };
};
const voiceRows = (c) => [...c.querySelectorAll('.opts.mv .srow.opt')];

describe('gate 2f-player-more (the ⋮ in Now playing)', () => {
  it('phone: a sheet titled by the recording: Save recording, then Voice with Benjamin ticked, main\'s note, Cancel', async () => {
    twoVoices();
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    const sheet = c.querySelector('.sheet.mor');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-label')).toBe('More');
    expect(c.querySelector('.scrim.light')).not.toBeNull();
    expect(text(sheet, '.sh')).toBe('Chosen by God');
    const save = sheet.querySelector('.srow.act');
    expect(text(save, '.t')).toBe('Save recording');
    expect(save.getAttribute('aria-pressed')).toBe('false');
    expect(save.querySelector('.lead svg')).not.toBeNull();
    expect(text(sheet, '.mlab')).toBe('Voice');
    expect(sheet.querySelector('.opts.mv').getAttribute('role')).toBe('radiogroup');
    const rows = voiceRows(sheet);
    expect(rows.map((r) => r.textContent)).toEqual(['Read by Benjamin', 'Text-to-speech']);
    expect(rows.map((r) => [r.getAttribute('role'), r.getAttribute('aria-checked'), r.classList.contains('on'), !!r.querySelector('.ck')]))
      .toEqual([['radio', 'true', true, true], ['radio', 'false', false, false]]);
    expect(text(sheet, '.fine.mvn')).toBe('Switches this recording — starts it again, and the queue follows.');
    expect(text(sheet, '.textbtn.cancel')).toBe('Cancel');
    const more = c.querySelector('.np-screen .np-tb [aria-label="More"]');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.classList.contains('opn')).toBe(false);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(localStorage.length).toBe(0);
    click(sheet.querySelector('.textbtn.cancel'));
    expect(c.querySelector('.sheet')).toBeNull();
    expect(c.querySelector('.np-screen')).not.toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    click(more);
    expect(c.querySelector('.sheet.mor')).not.toBeNull();
    click(c.querySelector('.scrim'));
    expect(c.querySelector('.sheet')).toBeNull();
  });

  it('Save flips to Remove from saved recordings and keeps the sheet open; Android back closes it', () => {
    twoVoices();
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    click(c.querySelector('.sheet.mor .srow.act'));
    const save = c.querySelector('.sheet.mor .srow.act');
    expect(text(save, '.t')).toBe('Remove from saved recordings');
    expect(save.getAttribute('aria-pressed')).toBe('true');
    expect(save.classList.contains('on')).toBe(true);
    click(save);
    expect(text(c, '.sheet.mor .srow.act .t')).toBe('Save recording');
    expect(androidBack()).toBe('true');
    expect(c.querySelector('.sheet')).toBeNull();
    expect(c.querySelector('.np-screen')).not.toBeNull();
  });

  it('picking Text-to-speech starts the recording again in that voice and closes; the ticked voice only closes', () => {
    twoVoices();
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    click(voiceRows(c)[0]);
    expect(c.querySelector('.sheet')).toBeNull();
    expect(text(c, '.np-s')).toBe('Read by Benjamin·On this phone');
    expect(text(c, '.np-screen .times span')).toBe('3:51');
    click(c.querySelector('.np-tb [aria-label="More"]'));
    click(voiceRows(c)[1]);
    expect(c.querySelector('.sheet')).toBeNull();
    expect(text(c, '.np-t')).toBe('Chosen by God');
    expect(text(c, '.np-s')).toBe('Text-to-speech');
    expect(text(c, '.np-screen .times span')).toBe('0:00');
    expect(c.querySelector('.bigplay').getAttribute('aria-label')).toBe('Pause');
    click(c.querySelector('.np-tb [aria-label="More"]'));
    expect(voiceRows(c).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('with up next changed by hand, a voice asks first (main\'s confirm strip); Yes, switch rebuilds the queue', () => {
    twoVoices();
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    click(c.querySelector('.sheet.mor .textbtn.cancel'));
    click(c.querySelector('.np-tb [aria-label="Up next"]'));
    click([...c.querySelectorAll('.rows.q button.rm')][0]);
    expect(text(c, '.upn-h .cnt')).toBe('1 of 28');
    click(c.querySelector('.scrim'));
    click(c.querySelector('.np-tb [aria-label="More"]'));
    click(voiceRows(c)[1]);
    const sheet = c.querySelector('.sheet.mor');
    expect(sheet).not.toBeNull();
    expect(text(sheet, '.fine.mvn')).toBe('Switching to Text-to-speech rebuilds this queue and drops your changes to it. Continue?');
    const [yes, no] = [...sheet.querySelectorAll('.mvc button')];
    expect([yes.textContent, no.textContent]).toEqual(['Yes, switch', 'Not now']);
    expect(document.activeElement).toBe(yes);
    expect(text(c, '.np-s')).toBe('Read by Benjamin·On this phone');
    click(no);
    expect(text(c, '.sheet.mor .fine.mvn')).toBe('Switches this recording — starts it again, and the queue follows.');
    expect(c.querySelector('.sheet.mor .mvc')).toBeNull();
    click(voiceRows(c)[1]);
    click(c.querySelector('.sheet.mor .mvc button'));
    expect(c.querySelector('.sheet')).toBeNull();
    expect(text(c, '.np-s')).toBe('Text-to-speech');
    click(c.querySelector('.np-tb [aria-label="Up next"]'));
    expect(text(c, '.upn-h .cnt')).toBe('1 of 29');
  });

  it('one voice only: no Voice group, Save alone', () => {
    g.AudioPlayer = { renditionsFor: () => [{ reader: 'B' }], readerLabel: () => 'Read by Benjamin' };
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    expect(text(c, '.sheet.mor .srow.act .t')).toBe('Save recording');
    expect(c.querySelector('.sheet.mor .mlab')).toBeNull();
    expect(c.querySelector('.sheet.mor .opts')).toBeNull();
    expect(c.querySelector('.sheet.mor .mvn')).toBeNull();
  });

  it('laptop (D6): a menu under the ⋮ inside the panel, no scrim, title or Cancel; keys move; Escape or a press outside closes', () => {
    desktop(true);
    twoVoices();
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    const panel = c.querySelector('.pane > aside.panel.anc');
    const menu = () => panel.querySelector(':scope > .menu.np');
    expect(menu().getAttribute('role')).toBe('menu');
    expect(menu().getAttribute('aria-label')).toBe('More');
    expect(menu().getAttribute('data-zone')).toBe('menu');
    expect(c.querySelector('.scrim')).toBeNull();
    expect(c.querySelector('.sheet, .dlg')).toBeNull();
    expect(menu().querySelector('.sh, .cancel, .handle')).toBeNull();
    const more = panel.querySelector('.np-tb [aria-label="More"]');
    expect(more.classList.contains('opn')).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    const items = () => [...menu().querySelectorAll('[role^="menuitem"]')];
    expect(items().map((i) => [i.getAttribute('role'), i.textContent])).toEqual([
      ['menuitem', 'Save recording'], ['menuitemradio', 'Read by Benjamin'], ['menuitemradio', 'Text-to-speech']]);
    expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual([null, 'true', 'false']);
    expect(text(menu(), '.mlab')).toBe('Voice');
    expect(text(menu(), '.fine.mvn')).toBe('Switches this recording — starts it again, and the queue follows.');
    // A gate boot draws it open without moving focus (no ring in the picture); a click on the ⋮ moves it in.
    click(more);
    expect(menu()).toBeNull();
    expect(more.classList.contains('opn')).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    click(more);
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'End');
    expect(document.activeElement).toBe(items()[2]);
    key(items()[2], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    key(items()[2], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    click(items()[0]);
    expect(menu()).not.toBeNull();
    expect(items()[0].textContent).toBe('Remove from saved recordings');
    key(document.activeElement, 'Escape');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(more);
    click(more);
    pointer(panel.querySelector('.np-t'), 'pointerdown');
    expect(menu()).toBeNull();
    expect(panel.isConnected).toBe(true);
    click(more);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(menu()).toBeNull();
    click(more);
    act(() => { panel.querySelector(':scope > .np').dispatchEvent(new Event('scroll')); });
    expect(menu()).toBeNull();
    click(more);
    click(items()[2]);
    expect(menu()).toBeNull();
    expect(text(panel, '.np-s')).toBe('Text-to-speech');
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

  it("a real boot hands bundle-d the saved favourite reader and Download only on Wi-Fi, as main's App did while it rendered", () => {
    const e = fakeEngine();
    const setPreferredReader = vi.fn();
    g.AudioPlayer = { ...e.api, setPreferredReader };
    g.DownloadGate = { setWifiOnly: vi.fn() };
    g.StateStore = { isReady: () => true, get: () => ({ settings: { letterReader: 'T', downloadWifiOnly: true } }), set: vi.fn() };
    render(<V2App gateId={null} />);
    expect(setPreferredReader).toHaveBeenCalledWith('T');
    expect(g.DownloadGate.setWifiOnly).toHaveBeenCalledWith(true);
    expect(g.StateStore.set).not.toHaveBeenCalled();
  });

  it("a gate boot hands bundle-d nothing (its state is the picture's, never the reader's)", () => {
    const setPreferredReader = vi.fn();
    g.AudioPlayer = { setPreferredReader };
    g.DownloadGate = { setWifiOnly: vi.fn() };
    g.StateStore = { isReady: () => true, get: () => ({ settings: { letterReader: 'T', downloadWifiOnly: true } }), set: vi.fn() };
    render(<V2App gateId="7a-listening" />);
    expect(setPreferredReader).not.toHaveBeenCalled();
    expect(g.DownloadGate.setWifiOnly).not.toHaveBeenCalled();
  });

  /** The engine with main's voice calls and bundle-b's AudioLibraryStore. */
  function voicedEngine(over) {
    const e = fakeEngine(over);
    Object.assign(e.api, {
      renditionsFor: vi.fn(() => [{ reader: 'B' }, { reader: 'V' }]),
      readerLabel: (r) => ({ B: 'Read by Benjamin', V: 'Text-to-speech' })[r] || null,
      hasAudio: vi.fn((volKey) => volKey === 'bible-wop-nkjv' || volKey === 'bible-brm-kjv'),
      playCollection: vi.fn(), playLetter: vi.fn(), playBibleBook: vi.fn(),
    });
    g.AudioPlayer = e.api;
    const saved = new Set();
    let v = 0;
    const listeners = new Set();
    g.AudioLibraryStore = {
      subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => v,
      isSaved: (t) => saved.has(t.key),
      toggleSaved: vi.fn((t) => { if (saved.has(t.key)) saved.delete(t.key); else saved.add(t.key); v += 1; listeners.forEach((cb) => cb()); }),
    };
    return e;
  }
  const openMore = (c) => { click(c.querySelector('.mini')); click(c.querySelector('.np-tb [aria-label="More"]')); };

  it('the ⋮: voices from AudioPlayer.renditionsFor; a pick plays the collection from this letter in that voice', () => {
    const e = voicedEngine();
    const items = [{ id: 'chosen-by-god', title: 'Chosen by God' }, { id: 'honor', title: 'Honor' }];
    g.colLetterArr = vi.fn(() => items);
    const { container: c } = render(<V2App gateId={null} />);
    openMore(c);
    expect(e.api.renditionsFor).toHaveBeenCalledWith('one', { id: 'chosen-by-god', title: 'Chosen by God' }, 'Volume One');
    expect(voiceRows(c).map((r) => r.textContent)).toEqual(['Read by Benjamin', 'Text-to-speech']);
    click(voiceRows(c)[1]);
    expect(e.api.playCollection).toHaveBeenCalledWith({ volKey: 'one', items, collectionLabel: 'Volume One',
      startId: 'chosen-by-god', startReader: 'V', noResume: true });
    expect(c.querySelector('.sheet')).toBeNull();
    delete g.colLetterArr; delete g.AudioLibraryStore;
  });

  it('the ⋮: without the collection loaded a pick plays the letter alone; a changed queue asks first', () => {
    const e = voicedEngine({ sourceMode: 'custom', queue: [
      { key: 'one:chosen-by-god', title: 'Chosen by God', sub: 'Volume One', url: 'u1', readerCode: 'B' },
      { key: 'one:honor', title: 'Honor', sub: 'Volume One', url: 'u2', readerCode: 'B' }] });
    const { container: c } = render(<V2App gateId={null} />);
    openMore(c);
    click(voiceRows(c)[1]);
    expect(e.api.playLetter).not.toHaveBeenCalled();
    expect(text(c, '.sheet.mor .fine.mvn')).toBe('Switching to Text-to-speech rebuilds this queue and drops your changes to it. Continue?');
    click(c.querySelector('.sheet.mor .mvc button'));
    expect(e.api.playLetter).toHaveBeenCalledWith({ volKey: 'one', letter: { id: 'chosen-by-god', title: 'Chosen by God' },
      collectionLabel: 'Volume One', reader: 'V', noResume: true });
    delete g.AudioLibraryStore;
  });

  it('the ⋮: a lone changed recording says it becomes a full queue (main\'s words)', () => {
    voicedEngine({ sourceMode: 'custom' });
    const { container: c } = render(<V2App gateId={null} />);
    openMore(c);
    click(voiceRows(c)[1]);
    expect(text(c, '.sheet.mor .fine.mvn')).toBe('Switching to Text-to-speech rebuilds this into a full queue. Continue?');
    delete g.AudioLibraryStore;
  });

  it('the ⋮: Save calls AudioLibraryStore.toggleSaved and follows the store', () => {
    voicedEngine();
    const { container: c } = render(<V2App gateId={null} />);
    openMore(c);
    click(c.querySelector('.sheet.mor .srow.act'));
    expect(g.AudioLibraryStore.toggleSaved).toHaveBeenCalledWith(expect.objectContaining({ key: 'one:chosen-by-god', url: 'u1' }));
    expect(text(c, '.sheet.mor .srow.act .t')).toBe('Remove from saved recordings');
    delete g.AudioLibraryStore;
  });

  it('the ⋮ on a Bible chapter: Audio Bible lists the offered editions that have the book; a pick plays it there and becomes the setting', () => {
    const e = voicedEngine({ queue: [{ key: 'bible-wop-nkjv:john', title: 'John 3', sub: 'NKJV', url: 'b3', readerCode: null,
      partLabel: 'Chapter 3' }] });
    g.__setBibleAudioEdition = vi.fn();
    const { container: c } = render(<V2App gateId={null} />);
    openMore(c);
    expect(text(c, '.sheet.mor .mlab')).toBe('Audio Bible');
    // each edition on two lines (dz30 2m): main's label split at its first " · "
    expect(voiceRows(c).map((r) => [text(r, '.t'), text(r, '.s'), r.getAttribute('aria-checked')])).toEqual([
      ['KJV', 'Biblical Restoration Ministries', 'false'], ['NKJV', 'The Word of Promise (Dramatized)', 'true']]);
    expect(text(c, '.sheet.mor .fine.mvn')).toBe('Switches this chapter — starts it again, and the queue follows.');
    click(voiceRows(c)[0]);
    expect(e.api.playBibleBook).toHaveBeenCalledWith({ volKey: 'bible-brm-kjv', bookId: 'john', chapterNum: 3,
      label: 'KJV · Biblical Restoration Ministries', noResume: true });
    expect(g.__setBibleAudioEdition).toHaveBeenCalledWith('brm-kjv');
    delete g.__setBibleAudioEdition; delete g.AudioLibraryStore;
  });
});
