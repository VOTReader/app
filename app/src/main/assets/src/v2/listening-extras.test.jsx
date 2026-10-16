/* v2-gap 31, Listening extras (rv5; design dz30's pictures 6f, 6g, 6h, 2m, 3r, 0c and its written rules): a typed speed
   says what it takes, Up next shows Remove under a swiped row and offers Undo, the Audio Bible's editions are two lines
   and a switch names its pick, Notes > Bookmarks lists the saved recordings first (each plays), Home's Recent opens the
   whole list (x each, Clear recent, Undo), and Previous says Restart when that is what it does. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { V2App } from './App.jsx';
import { recentRows, recentLine } from './home-facts.js';
import { readMarks, metaLine } from './notes-facts.js';
import { UNDO_MS } from './screens/LetterScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const key = (el, k) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const pointer = (el, type, { x = 100, y = 200 } = {}) => act(() => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  el.dispatchEvent(e);
});
const desktop = (on) => { g.matchMedia = () => ({ matches: on, addEventListener() {}, removeEventListener() {} }); };
const text = (c, sel) => { const el = c.querySelector(sel); return el ? el.textContent : null; };
const texts = (c, sel) => [...c.querySelectorAll(sel)].map((e) => e.textContent);
const DAY = 24 * 3600 * 1000;

const COLS = [
  { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', indexScreen: 'vot-one-index', kind: 'letter' },
  { volKey: 'wtlb1', label: 'Words To Live By, Part One', globalName: 'WTLB_ONE', indexScreen: 'wtlb-one-index', kind: 'wtlb' },
];
const TITLES = { 1: 'Chosen by God', 2: 'Honor Not the Day of the Dead... Honor God', 3: 'Christmas', 16: 'Run from the Forest and Loose All That Binds You' };
const LETTERS = Array.from({ length: 29 }, (_x, i) => ({ id: i === 0 ? 'chosen-by-god' : 'one-' + (i + 1), num: i + 1,
  title: TITLES[i + 1] || 'Letter ' + (i + 1), date: '10/' + (i + 1) + '/04', blocks: [] }));
const WTLB = Array.from({ length: 80 }, (_x, i) => ({ id: i === 75 ? 'elect-and-precious' : 'w-' + (i + 1), num: i + 1,
  title: i === 75 ? 'Elect and Precious' : 'Entry ' + (i + 1), blocks: [] }));

beforeEach(() => {
  g.COLLECTIONS = COLS;
  g.COL_BY_KEY = new Map(COLS.map((c) => [c.volKey, c]));
  g.COL_BY_INDEX_SC = new Map(COLS.map((c) => [c.indexScreen, c]));
  g.LETTERS_V1 = LETTERS;
  g.WTLB_ONE = WTLB;
});
afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', 'LETTERS_V1', 'WTLB_ONE', 'matchMedia', 'AudioPlayer', 'AudioLibraryStore',
    'HistoryStore', 'StateStore', 'AudioPositionsStore', 'BIBLE_AUDIO_BOOKS', 'BIBLE_AUDIO_EDITIONS']) delete g[k];
  delete html.dataset.gate;
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('6f: the speed readout, typed', () => {
  it('the gate draws 1.15 typed in the box, the hint under it, the slider and picks still at 1.25x', () => {
    const { container: c } = render(<V2App gateId="6f-speed-typed" />);
    const box = /** @type {HTMLInputElement} */ (c.querySelector('.sheet.spd .spd-now input.v'));
    expect(box.value).toBe('1.15');
    expect(box.getAttribute('inputmode')).toBe('none'); // a gate boot keeps the keyboard closed
    expect(text(c, '.spd-s')).toBe('Type a speed from 0.5 to 3');
    expect(text(c, '.spd-chips .chip.on')).toBe('1.25×');
    key(box, 'Enter');
    expect(text(c, '.spd-now .v')).toBe('1.15×');
    expect(text(c, '.spd-s')).toBe('Faster than recorded');
    expect(c.querySelector('.spd-chips .chip.on')).toBeNull();
  });

  it('a tap on the readout shows the hint while the box is open; Escape puts the words back', () => {
    const { container: c } = render(<V2App gateId="6a-speed" />);
    expect(text(c, '.spd-s')).toBe('Faster than recorded');
    click(c.querySelector('.spd-now button.v'));
    const box = c.querySelector('.spd-now input.v');
    expect(box.getAttribute('inputmode')).toBe('decimal');
    expect(text(c, '.spd-s')).toBe('Type a speed from 0.5 to 3');
    key(box, 'Escape');
    expect(text(c, '.spd-s')).toBe('Faster than recorded');
  });
});

describe('6g, 6h: Remove from Up next, with Undo', () => {
  const rows = (c) => [...c.querySelectorAll('.rows.q .num-row')];

  it('6g: Christmas held 104 px left over the Remove strip (one strip, under that row only)', () => {
    const { container: c } = render(<V2App gateId="6g-up-next-swipe" />);
    const strips = c.querySelectorAll('.rows.q .qsw');
    expect(strips).toHaveLength(1);
    expect(text(strips[0], '.qbk')).toBe('Remove');
    expect(strips[0].querySelector('.qbk svg')).not.toBeNull();
    expect(text(strips[0], '.num-row .t')).toBe('Christmas');
    expect(/** @type {HTMLElement} */ (strips[0].querySelector('.num-row')).style.transform).toBe('translate(-104px,0px)');
  });

  it('a swipe shows the strip as it goes; let go short of 96 px and the row comes back, nothing removed', () => {
    const { container: c } = render(<V2App gateId="6c-up-next" />);
    pointer(rows(c)[2], 'pointerdown', { x: 200, y: 300 });
    pointer(rows(c)[2], 'pointermove', { x: 150, y: 302 });
    expect(c.querySelectorAll('.qsw')).toHaveLength(1);
    expect(text(c, '.qsw .num-row .t')).toBe('Christmas');
    pointer(rows(c)[2], 'pointerup', { x: 150, y: 302 });
    expect(c.querySelector('.qsw')).toBeNull();
    expect(rows(c)).toHaveLength(29);
    expect(c.querySelector('.toast-wrap')).toBeNull();
  });

  it('6h: Christmas gone, the rows renumbered, 1 of 28, the toast with Undo over the sheet; Undo puts it back at 3', () => {
    const { container: c } = render(<V2App gateId="6h-up-next-removed" />);
    expect(text(c, '.upn-h .cnt')).toBe('1 of 28');
    expect(rows(c).slice(0, 4).map((r) => [text(r, '.no'), text(r, '.t')])).toEqual([
      ['1', 'Chosen by God'], ['2', 'Honor Not the Day of the Dead... Honor God'], ['3', 'Letter 4'], ['4', 'Letter 5']]);
    const toast = c.querySelector('.toast-wrap.ovs');
    expect(toast.getAttribute('role')).toBe('status');
    expect(text(toast, '.toast')).toBe('Christmas removed from Up nextUndo');
    click(toast.querySelector('button.act'));
    expect(c.querySelector('.toast-wrap')).toBeNull();
    expect(text(c, '.upn-h .cnt')).toBe('1 of 29');
    expect(rows(c).slice(2, 4).map((r) => [text(r, '.no'), text(r, '.t')])).toEqual([['3', 'Christmas'], ['4', 'Letter 4']]);
  });

  it('every way out says so: a swipe, the grip\'s Delete, the hidden Remove; the toast goes after a while', () => {
    vi.useFakeTimers();
    const { container: c } = render(<V2App gateId="6c-up-next" />);
    pointer(rows(c)[2], 'pointerdown', { x: 250, y: 300 });
    pointer(rows(c)[2], 'pointermove', { x: 130, y: 302 });
    pointer(rows(c)[2], 'pointerup', { x: 130, y: 302 });
    expect(text(c, '.toast-wrap.ovs .toast')).toBe('Christmas removed from Up nextUndo');
    key(rows(c)[2].querySelector('.grip'), 'Delete');
    expect(text(c, '.toast-wrap.ovs .toast')).toBe('Letter 4 removed from Up nextUndo');
    click(rows(c)[2].querySelector('button.rm'));
    expect(text(c, '.toast-wrap.ovs .toast')).toBe('Letter 5 removed from Up nextUndo');
    expect(text(c, '.upn-h .cnt')).toBe('1 of 26');
    act(() => { vi.advanceTimersByTime(UNDO_MS + 10); });
    expect(c.querySelector('.toast-wrap')).toBeNull();
  });

  it('the real engine: Undo hands the removed track back to AudioPlayer.insertUpcoming at its old place', () => {
    const queue = LETTERS.slice(0, 4).map((l) => ({ key: 'one:' + l.id, title: l.title, sub: 'Volume One', url: 'u' + l.num, readerCode: 'B', partLabel: null }));
    let st = { status: 'paused', queue, qi: 0, time: 10, duration: 100, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false };
    const subs = new Set();
    let v = 0;
    const set = (next) => { st = { ...st, ...next }; v += 1; subs.forEach((cb) => cb()); };
    g.AudioPlayer = {
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => v, getState: () => st,
      getSleepRemainingSeconds: () => 0,
      removeUpcoming: vi.fn((i) => { set({ queue: st.queue.filter((_t, j) => j !== i) }); return true; }),
      insertUpcoming: vi.fn((i, t) => { const q = st.queue.slice(); q.splice(i, 0, t); set({ queue: q }); return true; }),
    };
    const { container: c } = render(<V2App gateId={null} />);
    click(c.querySelector('.mini'));
    click(c.querySelector('.np-tb [aria-label="Up next"]'));
    key(rows(c)[2].querySelector('.grip'), 'Delete');
    expect(g.AudioPlayer.removeUpcoming).toHaveBeenCalledWith(2);
    click(c.querySelector('.toast-wrap .act'));
    expect(g.AudioPlayer.insertUpcoming).toHaveBeenCalledWith(2, queue[2]);
    expect(rows(c).map((r) => text(r, '.t'))).toEqual(LETTERS.slice(0, 4).map((l) => l.title));
  });
});

describe('Restart: Previous more than 3 s in (or with one recording) goes back to the start', () => {
  it('names itself Restart then, Previous otherwise', () => {
    const { container: c } = render(<V2App gateId="2b-now-playing" />);
    const prev = () => c.querySelector('.np-screen .ctrls .ic:not(.sk)');
    expect(prev().getAttribute('aria-label')).toBe('Restart'); // 3:51 in
    click(prev());
    expect(text(c, '.times span')).toBe('0:00');
    expect(prev().getAttribute('aria-label')).toBe('Previous');
  });
});

describe('2m: the Audio Bible in the ⋯', () => {
  beforeEach(() => {
    g.BIBLE_AUDIO_BOOKS = [['john', 'John']];
    g.AudioPlayer = { hasAudio: vi.fn((volKey, book) => book === 'john' && ['bible-brm-kjv', 'bible-wop-nkjv', 'bible-web', 'bible-john-film'].includes(volKey)) };
  });

  it('John 3 saved, its four editions on two lines, KJV tapped with the queue changed: named ask, Yes, switch / Not now', () => {
    const { container: c } = render(<V2App gateId="2m-player-edition" />);
    const sheet = c.querySelector('.sheet.mor');
    expect(text(sheet, '.sh')).toBe('John 3');
    expect(text(sheet, '.srow.act .t')).toBe('Remove from saved recordings');
    expect(sheet.querySelector('.srow.act').classList.contains('on')).toBe(true);
    expect(text(sheet, '.mlab')).toBe('Audio Bible');
    const eds = [...sheet.querySelectorAll('.opts.mv .srow.opt')];
    expect(eds.map((r) => [text(r, '.t'), text(r, '.s'), r.getAttribute('aria-checked')])).toEqual([
      ['KJV', 'Biblical Restoration Ministries', 'false'], ['NKJV', 'The Word of Promise (Dramatized)', 'true'],
      ['WEB', 'World English Bible', 'false'], ['John', 'The Gospel of John (film audio, no read-along)', 'false']]);
    expect(eds.every((r) => r.classList.contains('edr'))).toBe(true);
    expect(text(sheet, '.fine.mvn')).toBe('Switching to KJV rebuilds this queue and drops your changes to it. Continue?');
    expect(texts(sheet, '.mvc button')).toEqual(['Yes, switch', 'Not now']);
    click(sheet.querySelector('.mvc .btn2'));
    expect(text(c, '.sheet.mor .fine.mvn')).toBe('Switches this chapter — starts it again, and the queue follows.');
    expect(document.activeElement).toBe(c.querySelectorAll('.opts.mv .srow.opt')[0]);
    expect(c.querySelector('.sheet.mor')).not.toBeNull();
  });

  it('a letter\'s Voice asks the same way, by name (Switching to Text-to-speech ...)', () => {
    g.AudioPlayer = { renditionsFor: vi.fn(() => [{ reader: 'B' }, { reader: 'V' }]),
      readerLabel: (r) => ({ B: 'Read by Benjamin', V: 'Text-to-speech' })[r] || null };
    const { container: c } = render(<V2App gateId="2f-player-more" />);
    click(c.querySelector('.np-tb [aria-label="Up next"]'));
    key([...c.querySelectorAll('.rows.q .num-row')][1].querySelector('.grip'), 'ArrowDown');
    click(c.querySelector('.np-tb [aria-label="More"]'));
    const rows = [...c.querySelectorAll('.opts.mv .srow.opt')];
    expect(rows.map((r) => [text(r, '.t'), r.querySelector('.s')])).toEqual([['Read by Benjamin', null], ['Text-to-speech', null]]);
    click(rows[1]);
    expect(text(c, '.sheet.mor .fine.mvn')).toBe('Switching to Text-to-speech rebuilds this queue and drops your changes to it. Continue?');
  });
});

describe('3r: saved recordings in Notes > Bookmarks', () => {
  it('Saved recordings first, each with Play, then Pages', () => {
    const { container: c } = render(<V2App gateId="3r-notes-saved" />);
    expect(text(c, '.chips.kinds .chip.on')).toBe('Bookmarks');
    const marks = c.querySelector('.marks');
    expect([...marks.children].map((e) => (e.classList.contains('mg') ? '#' + e.textContent : e.classList.contains('srec') ? 'rec' : 'page')))
      .toEqual(['#Saved recordings', 'rec', 'rec', '#Pages', 'page', 'page']);
    const recs = [...marks.querySelectorAll('.mark.srec')];
    expect(recs.map((r) => [text(r, '.mt'), text(r, '.mm'), r.querySelector('.rp').getAttribute('aria-label')])).toEqual([
      ['Chosen by God', 'Recording · Read by Benjamin · Today', 'Play Chosen by God'],
      ['John 3', 'Recording · NKJV, The Word of Promise · Yesterday', 'Play John 3']]);
    expect(texts(marks, '.mark:not(.srec) .mm')).toEqual(['Bookmark · Volume One · Letter 2 · Sunday', 'Bookmark · Volume One · Letter 16 · Oct 6']);
  });

  it('a real boot: the store\'s saved recordings read "Recording · who · when"; Play hands it to main\'s playTrack', async () => {
    const now = Date.now();
    const kept = [
      { key: 'one:chosen-by-god', title: 'Chosen by God', sub: 'Volume One', url: 'u/v1-01.mp3', readerCode: 'B', partLabel: null, savedAt: now },
      { key: 'bible-wop-nkjv:john', title: 'John 3', sub: 'NKJV', url: 'u/john-3.mp3', readerCode: null, partLabel: 'Chapter 3', savedAt: now - DAY },
    ];
    g.AudioLibraryStore = { saved: () => kept.map((t) => ({ ...t })), recent: () => [], isReady: () => true };
    const { marks } = readMarks(g);
    expect(marks.map((m) => metaLine(m, now))).toEqual(['Recording · Read by Benjamin · Today', 'Recording · NKJV, The Word of Promise · Yesterday']);
    g.AudioPlayer = { playTrack: vi.fn() };
    const { container: c } = render(<V2App gateId={null} />);
    await act(async () => {});
    click([...c.querySelectorAll('.tabbar .tab')].find((t) => t.textContent === 'Notes'));
    click([...c.querySelectorAll('.chips.kinds .chip')].find((b) => b.textContent === 'Bookmarks'));
    expect(texts(c, '.marks .label.mg')).toEqual(['Saved recordings']);
    click(c.querySelector('.mark.srec .rp'));
    expect(g.AudioPlayer.playTrack).toHaveBeenCalledWith(expect.objectContaining({ url: 'u/v1-01.mp3' }));
  });
});

describe('0c: Recent, all of it', () => {
  const rows = (c) => [...c.querySelectorAll('.sheet.rct .row.rcr')];

  it('Home\'s Recent label is a button (All recent) with a chevron; the gate opens the whole list, heard or read', () => {
    const { container: c } = render(<V2App gateId="0c-home-recent" />);
    const lab = c.querySelector('.recent .rlab');
    expect([lab.tagName, lab.getAttribute('aria-label'), text(lab, '.label')]).toEqual(['BUTTON', 'All recent', 'Recent']);
    expect(lab.querySelector('svg')).not.toBeNull();
    expect(texts(c, '.recent .chip')).toEqual(['John 3', 'Vol. One, Letter 2']);
    const sheet = c.querySelector('.sheet.rct');
    expect([sheet.getAttribute('role'), sheet.getAttribute('aria-label')]).toEqual(['dialog', 'Recent']);
    expect(text(sheet, '.upn-h .sh')).toBe('Recent');
    expect(text(sheet, '.upn-h .textbtn')).toBe('Clear recent');
    expect(rows(c).map((r) => [r.dataset.heard, text(r, '.t'), text(r, '.s'), r.querySelector('.tx').getAttribute('aria-label'),
      r.querySelector('.rx').getAttribute('aria-label')])).toEqual([
      ['1', 'Chosen by God', 'Volume One · Letter 1 · 6 min left', 'Play on: Chosen by God', 'Remove Chosen by God from Recent'],
      ['0', 'John 3', 'The Scriptures of Truth · Read today', 'Open: John 3', 'Remove John 3 from Recent'],
      ['0', 'Honor Not the Day of the Dead... Honor God', 'Volume One · Letter 2 · Read yesterday', 'Open: Honor Not the Day of the Dead... Honor God',
        'Remove Honor Not the Day of the Dead... Honor God from Recent'],
      ['1', 'Elect and Precious', 'Words To Live By, Part One · Finished', 'Play again: Elect and Precious', 'Remove Elect and Precious from Recent'],
      ['1', 'Christmas', 'Volume One · Letter 3 · 12 min left', 'Play on: Christmas', 'Remove Christmas from Recent']]);
  });

  it('x takes one out at once with Undo; Clear recent empties it (Undo too); emptied, Home\'s Recent line goes', () => {
    const { container: c } = render(<V2App gateId="0c-home-recent" />);
    click(rows(c)[1].querySelector('.rx'));
    expect(rows(c).map((r) => text(r, '.t'))).not.toContain('John 3');
    expect(texts(c, '.recent .chip')).toEqual(['Vol. One, Letter 2']);
    expect(text(c, '.toast-wrap .toast')).toBe('John 3 removed from RecentUndo');
    click(c.querySelector('.toast-wrap .act'));
    expect(rows(c).map((r) => text(r, '.t'))[1]).toBe('John 3');
    expect(texts(c, '.recent .chip')).toEqual(['John 3', 'Vol. One, Letter 2']);
    click(c.querySelector('.sheet.rct .upn-h .textbtn'));
    expect(rows(c)).toHaveLength(0);
    expect(text(c, '.sheet.rct .empty-t')).toBe('Nothing yet. What you read or hear shows up here.');
    expect(/** @type {HTMLButtonElement} */ (c.querySelector('.sheet.rct .upn-h .textbtn')).disabled).toBe(true);
    expect(text(c, '.toast-wrap .toast')).toBe('Recent clearedUndo');
    expect(c.querySelector('.recent')).toBeNull();
    click(c.querySelector('.toast-wrap .act'));
    expect(rows(c)).toHaveLength(5);
    expect(c.querySelector('.recent')).not.toBeNull();
  });

  it('the chevron opens it; a read row opens its place, as Continue does', () => {
    const { container: c } = render(<V2App gateId="0a-home" />);
    expect(c.querySelector('.sheet.rct')).toBeNull();
    click(c.querySelector('.recent .rlab'));
    expect(c.querySelector('.sheet.rct')).not.toBeNull();
    const john = rows(c).find((r) => text(r, '.t') === 'John 3');
    click(john.querySelector('.tx'));
    expect(c.querySelector('.sheet.rct')).toBeNull();
    expect(c.querySelector('.tb.has-back .ic').getAttribute('aria-label')).toBe('Back to John');
  });

  it('the laptop: a dialog over Home (D4)', () => {
    desktop(true);
    const { container: c } = render(<V2App gateId="0c-home-recent" />);
    expect(c.querySelector('.dlg.rct')).not.toBeNull();
    expect(c.querySelector('.sheet.rct')).toBeNull();
  });
});

describe('Recent\'s rows from main\'s stores (a real boot)', () => {
  const rows = (c) => [...c.querySelectorAll('.sheet.rct .row.rcr')];
  const NOW = Date.UTC(2026, 9, 14, 12);
  const hist =(letterNum, ts) => ({ type: 'letter', letterId: LETTERS[letterNum - 1].id, letterNum, volumeScreen: 'vot-one-index', ts });
  const track = (n, playedAt) => ({ key: 'one:' + LETTERS[n - 1].id, title: LETTERS[n - 1].title, sub: 'Volume One', url: 'u' + n, readerCode: 'B', partLabel: null, playedAt });

  it('merges the history and the recordings played newest first, no cap, Continue\'s place too; each says heard or read', () => {
    const entries = Array.from({ length: 12 }, (_x, i) => hist(i + 2, NOW - (i + 1) * 3600e3));
    const played = [track(1, NOW - 60e3), track(2, NOW - 30 * 3600e3)];
    const out = recentRows(entries, g, [], played);
    expect(out).toHaveLength(13);
    expect(out.slice(0, 3).map((r) => { const it = /** @type {any} */ (r.it); return [it.letterId || it.n, r.heard]; })).toEqual([['chosen-by-god', true], ['one-2', false], ['one-3', false]]);
    g.AudioPositionsStore = { getPosition: (t) => (t.url === 'u1' ? { t: 60, d: 600 } : null) };
    expect(recentLine(out[0], NOW, g)).toBe('Volume One · Letter 1 · 9 min left');
    expect(recentLine(out[1], NOW, g)).toBe('Volume One · Letter 2 · Read today');
  });

  it('x removes the place from the history and the recordings played; Undo puts both back; Clear recent clears both', async () => {
    let entries = [hist(2, NOW - 3600e3), hist(3, NOW - 2 * 3600e3), hist(2, NOW - 5 * 3600e3)];
    let recent = [track(2, NOW - 60e3), track(4, NOW - 4 * 3600e3)];
    const bump = new Set();
    const sub = (cb) => { bump.add(cb); return () => bump.delete(cb); };
    const changed = () => bump.forEach((cb) => cb());
    g.HistoryStore = { isReady: () => true, list: () => entries.slice(), subscribe: sub,
      setAll: vi.fn((e) => { entries = e.slice(); changed(); }), clear: vi.fn(() => { entries = []; changed(); }) };
    g.AudioLibraryStore = { isReady: () => true, recent: () => recent.map((t) => ({ ...t })), saved: () => [], subscribe: sub,
      removeRecent: vi.fn((url) => { recent = recent.filter((t) => t.url !== url); changed(); return true; }),
      clearRecent: vi.fn(() => { recent = []; changed(); }),
      restoreRecent: vi.fn((rows) => { recent = recent.concat(rows).sort((a, b) => b.playedAt - a.playedAt); changed(); }) };
    g.StateStore = { isReady: () => true, get: () => ({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'one-9' }, tabs: [] }) };
    const { container: c } = render(<V2App gateId={null} />);
    await act(async () => {});
    click(c.querySelector('.recent .rlab'));
    expect(rows(c).map((r) => text(r, '.t'))).toEqual(['Honor Not the Day of the Dead... Honor God', 'Christmas', 'Letter 4']);
    click(rows(c)[0].querySelector('.rx'));
    expect(g.AudioLibraryStore.removeRecent).toHaveBeenCalledWith('u2');
    expect(entries.map((e) => e.letterNum)).toEqual([3]);
    expect(rows(c).map((r) => text(r, '.t'))).toEqual(['Christmas', 'Letter 4']);
    click(c.querySelector('.toast-wrap .act'));
    expect(entries.map((e) => e.letterNum)).toEqual([2, 3, 2]);
    expect(g.AudioLibraryStore.restoreRecent).toHaveBeenCalledWith([expect.objectContaining({ url: 'u2' })]);
    expect(rows(c).map((r) => text(r, '.t'))[0]).toBe('Honor Not the Day of the Dead... Honor God');
    click(c.querySelector('.sheet.rct .upn-h .textbtn'));
    expect(g.HistoryStore.clear).toHaveBeenCalled();
    expect(g.AudioLibraryStore.clearRecent).toHaveBeenCalled();
    expect(rows(c)).toHaveLength(0);
    click(c.querySelector('.toast-wrap .act'));
    expect(entries).toHaveLength(3);
    expect(rows(c)).toHaveLength(3);
  });

  it('a heard row plays on through main\'s playTrack (its own resume); the sheet closes', async () => {
    g.HistoryStore = { isReady: () => true, list: () => [] };
    g.AudioLibraryStore = { isReady: () => true, recent: () => [track(3, NOW)], saved: () => [] };
    g.AudioPlayer = { playTrack: vi.fn() };
    const { container: c } = render(<V2App gateId={null} />);
    await act(async () => {});
    click(c.querySelector('.recent .rlab'));
    click(rows(c)[0].querySelector('.tx'));
    expect(g.AudioPlayer.playTrack).toHaveBeenCalledWith(expect.objectContaining({ url: 'u3' }));
    expect(c.querySelector('.sheet.rct')).toBeNull();
  });
});

// fireEvent is kept for the typed box's change events in later cases
void fireEvent;
