/* Reading plans (zv1, group 10, picture 9a-plans): the page over main's plan runs (mw18 port, call 10A: a run's day,
   portion, catch-up and progress from runRow; the offers not running, the Volumes' days at its pace); the gate picture
   (rp1 maths over its seeded plan, unchanged); a real boot over ReadingPlanStore and a fake StateStore (Start puts a run,
   Stop leaves it stopped, Read opens the day's first item not read, Listen plays it or opens it when there is no
   recording, an rp1 settings plan moves into a run and settings let go of it after the save). */
import 'fake-indexeddb/auto';   // the runs are really saved: the rp1 move waits for that save
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { runPlan, runsPlansView, gatePlans, dashed, itemRoute, listenItem, liveIsRead, startOptions } from './plans-facts.js';
import { recordRead } from './reading-record.js';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { startCatalogPlan } from '../data/plan-catalog.js';
import { dayItems, tickItem, todayKey, dateOf, dayNum } from '../data/plan-engine.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; };

/** Bible in a Year from `start`, each of its first `n` days read on its own date. */
function bibleRead(start, n) {
  let run = startCatalogPlan('bible-year', null, at(start));
  const s0 = /** @type {number} */ (dayNum(start));
  for (let d = 0; d < n; d++) for (const it of dayItems(run, d)) run = tickItem(run, it.k, dateOf(s0 + d), 0);
  return run;
}

describe('the page over main’s runs', () => {
  const now = at('2026-10-15');

  it('day 39 of Bible in a Year with the day before unread: its portion, a day to catch up from the same chapter', () => {
    const run = bibleRead('2026-09-06', 38);
    const p = runPlan(run, now);
    const first = dayItems(run, 38)[0].k.split(':');
    expect(p).toMatchObject({
      id: run.id, name: 'Bible in a Year', overline: 'Today · Day 39 of 365', sub: 'Bible in a Year · 1 day to catch up',
      next: { bid: first[0], cid: Number(first[1]) }, done: false, behind: 1, loading: false,
    });
    expect(p.catchUp).toEqual(p.next);
    expect(p.title).toMatch(/^Numbers \d+–\d+$/);
    expect(p.percent).toBe(Math.floor(run.ticks ? Object.keys(run.ticks).length * 100 / 1189 : 0));
  });

  it('a day done says so; the offers not running are v2’s two, the Volumes counted at the pace', () => {
    let run = startCatalogPlan('bible-year', null, now);
    for (const it of dayItems(run, 0)) run = tickItem(run, it.k, todayKey(now), 0);
    const v = runsPlansView({ runs: [run], now, pace: 2, letters: 730 });
    expect(v.running[0].sub).toBe('Bible in a Year · Done for today');
    expect(v.running[0].catchUp).toBe(null);
    expect(v.offers).toEqual([{ id: 'volumes', name: 'Every letter, in order', sub: 'Every letter in site order · 365 days', paces: true }]);
    const none = runsPlansView({ runs: [], now, pace: 1, letters: 0 });
    expect(none.running).toEqual([]);
    expect(none.offers.map((o) => o.sub)).toEqual(['1,189 chapters · 365 days', 'Every letter in site order']);
  });

  it('Start hands main’s catalog the Volumes’ letters a day', () => {
    expect(startOptions('volumes', 3)).toEqual({ pace: { mode: 'items', n: 3 } });
    expect(startOptions('bible-year', 3)).toEqual({});
  });

  it('runs read as the picture prints them', () => {
    expect(dashed('Numbers 11-13')).toBe('Numbers 11–13');
    expect(dashed('Genesis 50 - Exodus 3')).toBe('Genesis 50 – Exodus 3');
    expect(dashed('Vol. One: Chosen by God')).toBe('Vol. One: Chosen by God');
  });
});

describe('the 9a gate', () => {
  afterEach(() => { cleanup(); delete html.dataset.gate; });

  it('draws the picture: one running card, the Volumes offered at 2 a day, Back to Home, Home lit', async () => {
    const { container } = render(<V2App gateId="9a-plans" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    expect(container.querySelector('.tabbar .tab.on').textContent).toBe('Home');
    const [on, off] = container.querySelectorAll('.plans .plan');
    expect(on.className).toBe('plan on');
    expect(on.querySelector('.overline').textContent).toBe('Today · Day 40 of 365');
    expect(on.querySelector('.pt').textContent).toBe('Numbers 11–13');
    expect(on.querySelector('.ps').textContent).toBe('Bible in a Year · 1 day to catch up');
    expect(/** @type {HTMLElement} */ (on.querySelector('.dl-prog i')).style.width).toBe('10%');
    expect([...on.querySelectorAll('.actions button')].map((b) => b.textContent)).toEqual(['Listen', 'Read', 'Catch up']);
    expect(off.querySelector('.pt').textContent).toBe('The Volumes in Order');
    expect(off.querySelector('.chip.on').textContent).toBe('2 a day');
    expect(off.querySelector('.start').textContent).toBe('Start');
    expect(gatePlans().view.running[0].title).toBe('Numbers 11–13');
  });
});

describe('a real boot', () => {
  /** @type {any} */ let state;
  const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: 'PREFACE_V1', label: 'Volume One',
    short: 'Volume One', letterScreen: true };
  const runs = () => ReadingPlanStore.active();

  beforeEach(() => {
    state = { settings: {}, readItems: {} };
    g.StateStore = { isReady: () => true, get: () => state, set: (next) => { state = next; } };
    g.COLLECTIONS = [ONE];
    g.LETTERS_V1 = [{ id: 'l1', num: 1, title: 'Chosen by God' }, { id: 'l2', num: 2, title: 'Honor God' }];
    g.PREFACE_V1 = { id: 'p1', title: 'A Word of Warning' };
    localStorage.clear();
    ReadingPlanStore._resetForTests({ forceLoaded: true });
    g.ReadingPlanStore = ReadingPlanStore;
  });
  afterEach(() => {
    cleanup();
    for (const k of ['StateStore', 'COLLECTIONS', 'LETTERS_V1', 'PREFACE_V1', 'AudioPlayer', 'ReadingPlanStore', 'READING_CHAIN',
      'COL_BY_KEY', 'colLetterArr', 'colPreface']) delete g[k];
  });

  /** opens Reading plans from Home's row */
  const openPlans = () => {
    const out = render(<V2App gateId={null} />);
    const row = [...out.container.querySelectorAll('button')].find((b) => /Reading plans/.test(b.textContent || ''));
    click(row);
    return out;
  };

  it('Start puts a run in ReadingPlanStore and the card runs; Stop leaves it there, stopped', () => {
    const { container } = openPlans();
    expect([...container.querySelectorAll('.plan .pt')].map((e) => e.textContent)).toEqual(['Bible in a Year', 'Every letter, in order']);
    click(container.querySelector('[aria-label="Start Bible in a Year"]'));
    expect(runs().map((r) => [r.plan, r.start, r.status])).toEqual([['bible-year', todayKey(new Date()), 'running']]);
    expect(state.settings.readingPlans).toBe(undefined);
    const on = container.querySelector('.plan.on');
    expect(on.querySelector('.pt').textContent).toBe('Genesis 1–3');
    expect(on.querySelector('.overline').textContent).toBe('Today · Day 1 of 365');
    expect(on.querySelector('.pmo')).not.toBe(null);

    const id = runs()[0].id;
    click(container.querySelector('.plans .stop'));
    const sheet = document.querySelector('[role="dialog"][aria-label="Stop a plan"]');
    click([...sheet.querySelectorAll('button')].find((b) => /Stop Bible in a Year/.test(b.textContent || '')));
    expect(runs()).toEqual([]);
    expect(ReadingPlanStore.get(id)).toMatchObject({ status: 'stopped', stopped: todayKey(new Date()) });
    expect(container.querySelector('.plan.on')).toBe(null);
  });

  it('the Volumes start at the pace chosen, over the letters loaded', () => {
    g.READING_CHAIN = ['one'];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.colLetterArr = () => g.LETTERS_V1;
    g.colPreface = () => g.PREFACE_V1;
    const { container } = openPlans();
    click([...container.querySelectorAll('.chips.pace .chip')][2]);
    const offer = container.querySelector('[aria-label="Every letter, in order"]');
    expect(offer.querySelector('.ps').textContent).toBe('Every letter in site order · 1 days');
    click(container.querySelector('[aria-label="Start Every letter, in order"]'));
    expect(runs().map((r) => [r.plan, r.pace])).toEqual([['volumes', { mode: 'items', n: 3 }]]);
    expect(runs()[0].tracks[0].items.map((it) => it.k)).toEqual(['volume-one:p1', 'volume-one:l1', 'volume-one:l2']);
  });

  it('Read opens the first chapter of the day not read; Back says Reading plans', () => {
    let run = startCatalogPlan('bible-year', null, new Date());
    run = tickItem(run, 'genesis:1', todayKey(new Date()), 0);
    ReadingPlanStore.put(run);
    expect(runPlan(run, new Date()).next).toEqual({ bid: 'genesis', cid: 2 });
    const { container } = openPlans();
    click([...container.querySelectorAll('.plan.on button')].find((b) => b.textContent === 'Read'));
    expect(container.querySelector('.tb .title').textContent).toBe('Reading plans');
  });

  it('an rp1 settings plan moves into a run with what was read, and settings let go of it after the save', async () => {
    const start = todayKey(daysAgo(2));
    state.settings.readingPlans = [{ id: 'bible-year', start }];
    state.readItems = { 'v1:genesis:1': 1, 'v1:genesis:2': 1 };
    const { container } = openPlans();
    await waitFor(() => expect(state.settings.readingPlans).toEqual([]));
    expect(runs().map((r) => [r.id, r.plan, r.start, r.from])).toEqual([['rp1_bible-year_' + start, 'bible-year', start, 'rp1']]);
    expect(runs()[0].ticks).toEqual({ 'genesis:1': '', 'genesis:2': '' });
    expect(container.querySelector('.plan.on .pt').textContent).toBe('Genesis 1–3');
  });

  it('a read ticks the plans that hold it, even with Mark as read off', () => {
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(run);
    state.settings.markAsRead = false;
    expect(recordRead('v1:genesis:1', null)).toBe(false);
    expect(state.readItems).toEqual({});
    expect(ReadingPlanStore.get(run.id).ticks).toEqual({ 'genesis:1': todayKey(new Date()) });
  });

  it('a run’s letter before the Volumes load opens nothing (no Bible book of that name)', () => {
    delete g.COLLECTIONS;
    expect(itemRoute({ bid: 'volume-one', cid: 'p1' })).toBe(null);
  });

  it('Listen plays a chapter on through its book; with no player it opens the chapter instead', () => {
    expect(itemRoute({ bid: 'genesis', cid: 2 })).toEqual({ place: 'bible-chapter', book: 'genesis', chapter: 2 });
    expect(listenItem({ bid: 'genesis', cid: 2 })).toBe(false);
    const playBibleBook = vi.fn();
    g.AudioPlayer = { playBibleBook };
    state.settings.bibleAudio = 'brm-kjv';
    g.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:genesis': ['a'] };
    try {
      expect(listenItem({ bid: 'genesis', cid: 2 })).toBe(true);
      expect(playBibleBook).toHaveBeenCalledWith({ volKey: 'bible-brm-kjv', bookId: 'genesis', label: 'KJV · Biblical Restoration Ministries', chapterNum: 2 });
      g.BIBLE_AUDIO_MANIFEST = {};
      expect(listenItem({ bid: 'genesis', cid: 2 })).toBe(false);
    } finally {
      delete g.BIBLE_AUDIO_MANIFEST;
    }
  });

  it('a letter item opens its letter (or the preface); Listen plays the collection from it', () => {
    expect(itemRoute({ bid: 'volume-one', cid: 'l2' })).toEqual({ place: 'letter', collection: 'one', n: 2 });
    expect(itemRoute({ bid: 'volume-one', cid: 'p1' })).toEqual({ place: 'letter', collection: 'one', preface: true });
    const playCollection = vi.fn(() => true);
    g.AudioPlayer = { collectionHasAudio: () => true, playCollection };
    g.colPreface = () => g.PREFACE_V1;
    g.colLetterArr = () => g.LETTERS_V1;
    try {
      expect(listenItem({ bid: 'volume-one', cid: 'l2' })).toBe(true);
      expect(playCollection).toHaveBeenCalledWith({ volKey: 'one', items: [g.PREFACE_V1, ...g.LETTERS_V1], collectionLabel: 'Volume One', startId: 'l2' });
      g.AudioPlayer.collectionHasAudio = () => false;
      expect(listenItem({ bid: 'volume-one', cid: 'l2' })).toBe(false);
    } finally {
      delete g.colPreface;
      delete g.colLetterArr;
    }
  });

  it('the read record is main’s key', () => {
    state.readItems = { 'v1:genesis:3': true };
    const isRead = liveIsRead();
    expect(isRead('genesis', 3)).toBe(true);
    expect(isRead('genesis', 4)).toBe(false);
  });
});
