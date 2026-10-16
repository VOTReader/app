/* Reading plans (zv1, group 10, picture 9a-plans): plansView over main's own plan maths (a running plan's day, portion,
   catch-up and progress; the plans not started, the Volumes' days at its pace); the gate picture; a real boot over a fake
   StateStore (Start and Stop write settings.readingPlans as main does, Read opens the day's first unread chapter, Listen
   plays it or opens it when there is no recording). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { plansView, gatePlans, dashed, itemRoute, listenItem, liveIsRead } from './plans-facts.js';
import { localDateKey } from '../data/reading-plans.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const DAY = 86400000;

/** A start date `d` days before `now` (local), as main writes it. */
const startedAgo = (now, d) => localDateKey(new Date(now.getTime() - d * DAY));

describe('plansView', () => {
  const now = new Date(2026, 9, 14, 12);

  it('day 40 of Bible in a Year with the day before unread: Numbers 11-13, a day to catch up from Numbers 8', () => {
    const read = new Set();
    // every chapter of days 1-38 read (Genesis 1 - Numbers 7: the first 124 chapters); day 39 (Numbers 8-10) not
    /** @type {Array<[string, number]>} */ const BOOKS = [['genesis', 50], ['exodus', 40], ['leviticus', 27], ['numbers', 7]];
    for (const [b, n] of BOOKS) for (let c = 1; c <= n; c++) read.add(b + ':' + c);
    const isRead = (bid, cid) => read.has(bid + ':' + cid);
    const v = plansView({ plans: [{ id: 'bible-year', start: startedAgo(now, 39) }], now, isRead, seq: [], pace: 1 });
    expect(v.running).toHaveLength(1);
    expect(v.running[0]).toMatchObject({
      id: 'bible-year', name: 'Bible in a Year', overline: 'Today · Day 40 of 365', title: 'Numbers 11–13',
      sub: 'Bible in a Year · 1 day to catch up', percent: 10,
      next: { bid: 'numbers', cid: 11 }, catchUp: { bid: 'numbers', cid: 8 }, loading: false, done: false, behind: 1,
    });
    expect(v.offers.map((o) => o.id)).toEqual(['volumes']);
  });

  it('a day done says so; the plans not started offer Start, the Volumes its days at the pace', () => {
    const seq = Array.from({ length: 730 }, (_x, i) => ({ bid: 'volume-one', cid: 'l' + i, title: 'L' + i, volKey: 'one', short: 'Vol. One' }));
    const isRead = (bid, cid) => bid === 'genesis' && cid <= 4;
    const v = plansView({ plans: [{ id: 'bible-year', start: localDateKey(now) }], now, isRead, seq, pace: 2 });
    expect(v.running[0].sub).toBe('Bible in a Year · Done for today');
    expect(v.running[0].catchUp).toBe(null);
    expect(v.offers).toEqual([{ id: 'volumes', name: 'The Volumes in Order', sub: 'Every letter in site order · 365 days', paces: true }]);
    const none = plansView({ plans: [], now, isRead, seq: [], pace: 1 });
    expect(none.running).toEqual([]);
    expect(none.offers.map((o) => o.sub)).toEqual(['1,189 chapters · 365 days', 'Every letter in site order']);
  });

  it('a Volumes plan before the letters load says so, with nothing to tap', () => {
    const v = plansView({ plans: [{ id: 'volumes', start: localDateKey(now), pace: 1 }], now, isRead: () => false, seq: [], pace: 1 });
    expect(v.running[0]).toMatchObject({ title: 'Loading the Volumes…', next: null, catchUp: null });
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
  const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: 'PREFACE_V1', label: 'Volume One' };

  beforeEach(() => {
    state = { settings: {}, readItems: {} };
    g.StateStore = { isReady: () => true, get: () => state, set: (next) => { state = next; } };
    g.COLLECTIONS = [ONE];
    g.LETTERS_V1 = [{ id: 'l1', num: 1, title: 'Chosen by God' }, { id: 'l2', num: 2, title: 'Honor God' }];
    g.PREFACE_V1 = { id: 'p1', title: 'A Word of Warning' };
  });
  afterEach(() => {
    cleanup();
    for (const k of ['StateStore', 'COLLECTIONS', 'LETTERS_V1', 'PREFACE_V1', 'AudioPlayer']) delete g[k];
  });

  /** opens Reading plans from Home's row */
  const openPlans = () => {
    const out = render(<V2App gateId={null} />);
    const row = [...out.container.querySelectorAll('button')].find((b) => /Reading plans/.test(b.textContent || ''));
    click(row);
    return out;
  };

  it('Start keeps the plan in settings.readingPlans (touched), and the card runs; Stop takes it out', () => {
    const { container } = openPlans();
    expect([...container.querySelectorAll('.plan .pt')].map((e) => e.textContent)).toEqual(['Bible in a Year', 'The Volumes in Order']);
    click(container.querySelector('[aria-label="Start Bible in a Year"]'));
    expect(state.settings.readingPlans).toEqual([{ id: 'bible-year', start: localDateKey(new Date()) }]);
    expect(state.settings.touched.readingPlans).toBe(true);
    const on = container.querySelector('.plan.on');
    expect(on.querySelector('.pt').textContent).toBe('Genesis 1–3');
    expect(on.querySelector('.overline').textContent).toBe('Today · Day 1 of 365');

    click(container.querySelector('.plans .stop'));
    const sheet = document.querySelector('[role="dialog"][aria-label="Stop a plan"]');
    click([...sheet.querySelectorAll('button')].find((b) => /Stop Bible in a Year/.test(b.textContent || '')));
    expect(state.settings.readingPlans).toEqual([]);
    expect(container.querySelector('.plan.on')).toBe(null);
  });

  it('the Volumes start at the pace chosen', () => {
    const { container } = openPlans();
    click([...container.querySelectorAll('.chips.pace .chip')][2]);
    click(container.querySelector('[aria-label="Start The Volumes in Order"]'));
    expect(state.settings.readingPlans).toEqual([{ id: 'volumes', start: localDateKey(new Date()), pace: 3 }]);
  });

  it('Read opens the first chapter of the day not read; Back says Reading plans', () => {
    state.settings.readingPlans = [{ id: 'bible-year', start: localDateKey(new Date()) }];
    state.readItems = { 'v1:genesis:1': true };
    const { container } = openPlans();
    click([...container.querySelectorAll('.plan.on button')].find((b) => b.textContent === 'Read'));
    expect(container.querySelector('.tb .title').textContent).toBe('Reading plans');
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
