/* Today's reading on Home and the plan's month (zones dz24, pictures 9h, 9i, 9a redrawn): todayView and monthView over
   main's own plan maths; the 9h / 9i / 9a gates as drawn (the card under Recent, before the Volumes; October under the
   plan's actions); a real boot over a fake StateStore (no plan, no card; one plan's Read / Listen / Plans; two plans' rows,
   Listen to today and the days behind; Mark as read off; the card turning over at midnight). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { todayView, monthView, gateToday, gateIsRead, gatePlans } from './plans-facts.js';
import { localDateKey } from '../data/reading-plans.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const text = (el) => (el ? el.textContent : null);

/** A Volumes sequence as main's volumeSequence builds it: the preface, then letters 1..n, one collection. */
const seqOf = (n) => [{ bid: 'volume-one', cid: 'p1', title: 'A Word of Warning', volKey: 'one', short: 'Volume One' }]
  .concat(Array.from({ length: n }, (_x, i) => ({ bid: 'volume-one', cid: 'l' + (i + 1), title: 'L' + (i + 1), volKey: 'one', short: 'Volume One' })));

describe('todayView', () => {
  const now = new Date('2026-10-15T12:00:00');
  const BIBLE = { id: 'bible-year', start: '2026-09-06' };
  const VOLS = { id: 'volumes', start: '2026-10-02', pace: 1 };

  it('no plan, no card', () => {
    expect(todayView({ plans: [], now, isRead: () => false, seq: [] })).toBe(null);
  });

  it('one plan: day 40, Numbers 11-13, a day to catch up, main’s 10 %; Listen / Read from Numbers 11', () => {
    const v = todayView({ plans: [BIBLE], now, isRead: gateIsRead([BIBLE], []), seq: [] });
    expect(v.running).toHaveLength(1);
    expect(v.running[0]).toMatchObject({
      overline: 'Today · Day 40 of 365', title: 'Numbers 11–13', sub: 'Bible in a Year · 1 day to catch up', percent: 10,
      next: { bid: 'numbers', cid: 11 }, done: false, behind: 1,
    });
    expect(v.first).toEqual({ bid: 'numbers', cid: 11 });
    expect(v.behind).toBe(1);
  });

  it('two plans: Listen to today plays the first plan not done; the days behind are summed', () => {
    const seq = seqOf(30);
    const v = todayView({ plans: [VOLS, BIBLE], now, isRead: gateIsRead([VOLS, BIBLE], seq), seq });
    expect(v.running.map((r) => [r.title, r.name, r.done])).toEqual([
      ['Volume One: L13', 'The Volumes in Order', true], ['Numbers 11–13', 'Bible in a Year', false]]);
    expect(v.first).toEqual({ bid: 'numbers', cid: 11 });
    expect(v.behind).toBe(1);
    // every plan done today: Listen to today plays the first one's portion again (main's fallback)
    const all = (bid, cid) => (bid === 'volume-one' ? cid === 'p1' || Number(String(cid).slice(1)) <= 13
      : !(bid === 'numbers' && cid >= 8 && cid <= 10));
    const done = todayView({ plans: [VOLS, BIBLE], now, isRead: all, seq });
    expect(done.running.every((r) => r.done)).toBe(true);
    expect(done.first).toEqual({ bid: 'volume-one', cid: 'l13' });
    expect(done.behind).toBe(1);
  });

  it('the Volumes before they load: main’s words, nothing to tap, no line; Listen to today skips it', () => {
    const v = todayView({ plans: [VOLS, BIBLE], now, isRead: () => false, seq: [] });
    expect(v.running[0]).toMatchObject({ overline: 'Today', title: 'Loading the Volumes…', loading: true, next: null, month: null });
    expect(v.first).toEqual({ bid: 'numbers', cid: 11 });
  });
});

describe('monthView (9a: October under the running plan)', () => {
  it('main’s monthDays: 4 blanks before Thursday the 1st; 1-13 read, 14 missed, 15 today, 16-31 ahead', () => {
    const plan = { id: 'bible-year', start: '2026-09-06' };
    const m = monthView(plan, new Date('2026-10-15T12:00:00'), gateIsRead([plan], []), []);
    expect(m.name).toBe('October');
    expect(m.lead).toBe(4);
    expect(m.days).toHaveLength(31);
    const states = m.days.map((d) => d.state);
    expect(states.slice(0, 13).every((s) => s === 'done')).toBe(true);
    expect(states.slice(13, 15)).toEqual(['missed', 'today']);
    expect(states.slice(15).every((s) => s === 'ahead')).toBe(true);
    expect(m.days[14].label).toBe('15, today');
    expect(m.days[13].label).toBe('14, missed');
  });

  it('days before a plan starts are the number alone; today read is "today, done"', () => {
    const plan = { id: 'bible-year', start: '2026-10-10' };
    const now = new Date('2026-10-12T12:00:00');
    const m = monthView(plan, now, () => true, []);
    expect(m.days.slice(0, 9).map((d) => d.state).every((s) => s === 'none')).toBe(true);
    expect(m.days[8].label).toBe('9');
    expect(m.days[11]).toMatchObject({ state: 'today', done: true, label: '12, today, done' });
  });
});

describe('the gates', () => {
  afterEach(() => { cleanup(); delete html.dataset.gate; });

  it('9a: October under the plan’s actions after its hairline, ticks on read days, a ring on the 14th, today boxed', async () => {
    const { container } = render(<V2App gateId="9a-plans" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const on = container.querySelector('.plans .plan.on');
    const pmo = on.querySelector('.actions + .pmo');
    expect(pmo).not.toBe(null);
    expect(pmo.getAttribute('aria-label')).toBe('October');
    expect(text(pmo.querySelector('.pmo-n'))).toBe('October');
    expect([...pmo.querySelectorAll('.pmo-w')].map(text).join('')).toBe('SMTWTFS');
    const cells = [...pmo.querySelectorAll('.pmo-d')];
    expect(cells.slice(0, 4).every((c) => c.className === 'pmo-d none' && !c.textContent)).toBe(true);
    const day = (n) => cells[3 + n];
    expect(day(1).className).toBe('pmo-d done');
    expect(day(1).querySelector('.mk svg')).not.toBe(null);
    expect(day(14).className).toBe('pmo-d missed');
    expect(day(14).querySelector('.mk .ring')).not.toBe(null);
    expect(day(15).className).toBe('pmo-d today');
    expect(day(15).querySelector('.mk').childNodes).toHaveLength(0);
    expect(day(16).className).toBe('pmo-d ahead');
    expect(text(day(31).querySelector('.num'))).toBe('31');
    expect(gatePlans().view.running[0].percent).toBe(10);
  });

  it('9h: one plan, under Recent and before the Volumes, as drawn', async () => {
    const { container } = render(<V2App gateId="9h-home-today" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const card = container.querySelector('.page-head.home .recent + .tdy');
    expect(card).not.toBe(null);
    expect(card.closest('.page-head').nextElementSibling.textContent).toBe('The Volumes of Truth');
    expect(text(card.querySelector('.tdy-h .overline'))).toBe('Today · Day 40 of 365');
    expect(text(card.querySelector('.tdy-h .textbtn'))).toBe('Plans');
    expect(text(card.querySelector('.tdy-t'))).toBe('Numbers 11–13');
    expect(text(card.querySelector('.tdy-s'))).toBe('Bible in a Year · 1 day to catch up');
    expect(/** @type {HTMLElement} */ (card.querySelector('.tdy-p .dl-prog i')).style.width).toBe('10%');
    expect(text(card.querySelector('.tdy-p .num'))).toBe('10 %');
    expect([...card.querySelectorAll('.actions button')].map(text)).toEqual(['Listen', 'Read']);
    expect(card.querySelector('.actions .pill svg')).not.toBe(null);
    expect(card.querySelector('.fine')).toBe(null);
  });

  it('0a stays card-less: its facts hold no plan', async () => {
    const { container } = render(<V2App gateId="0a-home" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tdy')).toBe(null);
  });

  it('gateToday: 9h one plan, 9i two (the Volumes one a day from Oct 2)', () => {
    expect(gateToday(1).plans.map((p) => p.id)).toEqual(['bible-year']);
    expect(gateToday(2).plans).toEqual([{ id: 'bible-year', start: '2026-09-06' }, { id: 'volumes', start: '2026-10-02', pace: 1 }]);
  });
});

describe('a real boot', () => {
  /** @type {any} */ let state;
  const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: 'PREFACE_V1', label: 'Volume One',
    short: 'Volume One', letterScreen: true };
  const today = () => localDateKey(new Date());
  const ago = (d) => localDateKey(new Date(Date.now() - d * 86400000));

  beforeEach(() => {
    state = { settings: {}, readItems: {} };
    g.StateStore = { isReady: () => true, get: () => state, set: (next) => { state = next; } };
    g.COLLECTIONS = [ONE];
    g.LETTERS_V1 = [{ id: 'l1', num: 1, title: 'Chosen by God' }, { id: 'l2', num: 2, title: 'Honor God' }];
    g.PREFACE_V1 = { id: 'p1', title: 'A Word of Warning' };
    g.READING_CHAIN = ['one'];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.colLetterArr = () => g.LETTERS_V1;
    g.colPreface = () => g.PREFACE_V1;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    for (const k of ['StateStore', 'COLLECTIONS', 'LETTERS_V1', 'PREFACE_V1', 'AudioPlayer', 'READING_CHAIN', 'COL_BY_KEY', 'colLetterArr', 'colPreface']) delete g[k];
  });

  it('no plan, no card (Home’s Reading plans row is the way in)', () => {
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.tdy')).toBe(null);
    expect([...container.querySelectorAll('.home-rows .row .t')].map(text)).toContain('Reading plans');
  });

  it('one plan: Read opens today’s first chapter not read; Plans opens Reading plans; Listen with no player opens it', () => {
    state.settings.readingPlans = [{ id: 'bible-year', start: today() }];
    state.readItems = { 'v1:genesis:1': 1 };
    const { container } = render(<V2App gateId={null} />);
    const card = container.querySelector('.tdy');
    expect(text(card.querySelector('.tdy-t'))).toBe('Genesis 1–3');
    expect(text(card.querySelector('.overline'))).toBe('Today · Day 1 of 365');
    click(card.querySelector('[aria-label="Read Genesis 1–3"]'));
    expect(container.querySelector('.tdy')).toBe(null);
    expect(text(container.querySelector('.tb .title'))).toBe('Home');
  });

  it('Plans opens Reading plans with the month under the plan', () => {
    state.settings.readingPlans = [{ id: 'bible-year', start: ago(3) }];
    const { container } = render(<V2App gateId={null} />);
    click(container.querySelector('.tdy .tdy-h .textbtn'));
    expect(text(container.querySelector('.page-head h1'))).toBe('Reading plans');
    const m = container.querySelector('.plan.on .pmo');
    expect(text(m.querySelector('.pmo-n'))).toBe(new Date().toLocaleString('en-US', { month: 'long' }));
    expect(m.querySelector('.pmo-d.today .num').textContent).toBe(String(new Date().getDate()));
  });

  it('two plans: a row each with main’s check, Listen to today plays the first not done, the days behind link to Reading plans', () => {
    state.settings.readingPlans = [{ id: 'volumes', start: today(), pace: 1 }, { id: 'bible-year', start: ago(1) }];
    state.readItems = { 'v1:volume-one:p1': 1 };
    const playCollection = vi.fn(() => true);
    g.AudioPlayer = { collectionHasAudio: () => true, playCollection, playBibleBook: vi.fn() };
    const { container } = render(<V2App gateId={null} />);
    const card = container.querySelector('.tdy.two');
    expect(text(card.querySelector('.tdy-h .overline'))).toBe('Today');
    const rows = [...card.querySelectorAll('button.tdy-r')];
    expect(rows.map((r) => [text(r.querySelector('.t')), text(r.querySelector('.s')), r.querySelector('.tdy-c').className])).toEqual([
      ['Volume One: A Word of Warning', 'The Volumes in Order', 'tdy-c on'],
      ['Genesis 4–7', 'Bible in a Year', 'tdy-c']]);
    expect(rows[0].getAttribute('aria-label')).toBe('Read Volume One: A Word of Warning, The Volumes in Order, done');
    expect(text(card.querySelector('.tdy-b'))).toBe('1 day to catch up');
    click(card.querySelector('.tdy-b'));
    expect(text(container.querySelector('.page-head h1'))).toBe('Reading plans');
  });

  it('Listen to today plays the first plan not done (the Volumes from its preface); a done plan is passed over', () => {
    state.settings.readingPlans = [{ id: 'volumes', start: today(), pace: 1 }, { id: 'bible-year', start: today() }];
    const playCollection = vi.fn(() => true);
    g.AudioPlayer = { collectionHasAudio: () => true, playCollection, playBibleBook: vi.fn() };
    const first = render(<V2App gateId={null} />);
    click(first.container.querySelector('.tdy .tdy-l'));
    expect(playCollection).toHaveBeenCalledWith(expect.objectContaining({ volKey: 'one', startId: 'p1', collectionLabel: 'Volume One' }));
    first.unmount();
    // the Volumes done today: Listen to today goes to the Bible, whose audio is off here, so it opens Genesis 1
    state.readItems = { 'v1:volume-one:p1': 1 };
    playCollection.mockClear();
    const { container } = render(<V2App gateId={null} />);
    click(container.querySelector('.tdy .tdy-l'));
    expect(playCollection).not.toHaveBeenCalled();
    expect(container.querySelector('.tdy')).toBe(null);
  });

  it('a Volumes row before the letters load is not a button that does anything', () => {
    for (const k of ['READING_CHAIN', 'COL_BY_KEY']) delete g[k];
    state.settings.readingPlans = [{ id: 'volumes', start: today(), pace: 1 }, { id: 'bible-year', start: today() }];
    const { container } = render(<V2App gateId={null} />);
    const rows = /** @type {HTMLButtonElement[]} */ ([...container.querySelectorAll('.tdy button.tdy-r')]);
    expect(text(rows[0].querySelector('.t'))).toBe('Loading the Volumes…');
    expect(rows[0].disabled).toBe(true);
    expect(rows[1].disabled).toBe(false);
  });

  it('Mark as read off: main’s line at the card’s foot', () => {
    state.settings.readingPlans = [{ id: 'bible-year', start: today() }];
    state.settings.markAsRead = false;
    const { container } = render(<V2App gateId={null} />);
    expect(text(container.querySelector('.tdy > .fine'))).toBe('Mark as read is off, so days don’t tick. Turn it on in Settings.');
  });

  it('the card turns over at local midnight while Home stays open', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 59, 500));
    state.settings.readingPlans = [{ id: 'bible-year', start: '2026-10-15' }];
    const { container } = render(<V2App gateId={null} />);
    expect(text(container.querySelector('.tdy .overline'))).toBe('Today · Day 1 of 365');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(text(container.querySelector('.tdy .overline'))).toBe('Today · Day 2 of 365');
    expect(text(container.querySelector('.tdy .tdy-t'))).toBe('Genesis 4–7');
  });
});
