// @ts-nocheck — reads main's Answers data from disk (node fs and vm, no node types in this tsconfig).
/* v2 Answers Only God Can Give (mw14): main's redesign hosted whole. bundle-d puts main's screens on window; here
   stand-ins in their place record the props v2 hands them, so these tests pin v2's side: a topic opens on v2's letter
   page with main's AnswersTopic as its body (a hit at its passage with Find holding its words, a link at its section),
   a group, Charts & videos and Saved answers are v2 places whose Back says Answers, the words typed make Back say
   Answers and clear them first (main's __screenBack), the whole-library search is the Search tab, the landing starts
   afresh only on a new way in, the topic page's hand-offs (Next reads on with no new Back step, a cite opens v2's
   reference sheet, an attribution its letter on the passage), and the collection route turned into this home. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { V2App } from './App.jsx';
import { defineStart } from './places.js';
import { topicRoute, attributionCollection, answersRead } from './screens/AnswersScreens.jsx';

const g = /** @type {any} */ (globalThis);

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ANSWERS = (() => {
  const ctx = { window: {} };
  runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8').replace(/^(const|let) /gm, 'var '), ctx);
  return ctx.ANSWERS || ctx.window.ANSWERS;
})();
const SABBATH = ANSWERS.find((e) => e.id === 'god-speaks-about-the-sabbath');
// main's collection record for Answers (scripture-resolution.js)
const COL = { volKey: 'answers', readKey: 'answers', globalName: 'ANSWERS', prefaceGlobal: null, label: 'Answers Only God Can Give', kind: 'wtlb', indexScreen: 'answers-home' };
const VOL2 = { volKey: 'two', readKey: 'volume-two', globalName: 'LETTERS_V2', prefaceGlobal: null, label: 'Volume Two', registryLabel: 'Volume Two', kind: 'letter' };

/** The props each stand-in last drew with, by name. */
let seen = {};
const stand = (name, cls) => function Stand(props) { seen[name] = props; return <div className={cls}>{name}</div>; };

function install() {
  g.COLLECTIONS = [COL, VOL2];
  g.COL_BY_KEY = new Map([['answers', COL], ['two', VOL2]]);
  g.COL_BY_INDEX_SC = new Map([['answers-home', COL]]);
  g.ANSWERS = ANSWERS;
  g.LETTERS_V2 = [{ id: 'v2-3', num: 3, title: 'Hearts Changed', blocks: [{ type: 'p', text: 'x' }] }];
  g.__answersCorpus = { loaded: true, error: false, subscribe: () => () => {}, getVersion: () => 1 };
  g.__loadAnswersCorpus = vi.fn(() => Promise.resolve());
  g.AnswersHome = stand('AnswersHome', 'ans-page ans-landing');
  g.AnswersShelf = stand('AnswersShelf', 'ans-page');
  g.AnswersMedia = stand('AnswersMedia', 'ans-page');
  g.AnswersSaved = stand('AnswersSaved', 'ans-page');
  g.AnswersTopic = stand('AnswersTopic', 'ans-reading');
  g.resetAnswersLanding = vi.fn();
  g.useAnswersMetaState = () => [{}, false];
  g.answersLayoutClass = () => 'ans-wide';
}

const undo = [];
afterEach(() => {
  cleanup();
  seen = {};
  while (undo.length) undo.pop()();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', 'ANSWERS', 'LETTERS_V2', '__answersCorpus', '__loadAnswersCorpus',
    'AnswersHome', 'AnswersShelf', 'AnswersMedia', 'AnswersSaved', 'AnswersTopic', 'resetAnswersLanding', 'useAnswersMetaState',
    'answersLayoutClass', 'handleAndroidBack', '__screenBack', 'StateStore']) delete g[k];
});

/** Boots V2App on `stack` (a real boot: no gate). */
function boot(stack) {
  install();
  undo.push(defineStart(() => stack));
  return render(<V2App gateId={null} />);
}
const HOME = [{ place: 'home' }, { place: 'answers' }];
const barText = (c) => c.querySelector('.tb').textContent;
const run = (fn) => act(async () => { fn(); });

describe('topicRoute: a topic as the route that opens it on the letter page', () => {
  it('names the topic by its number; the Main Page is 0', () => {
    expect(topicRoute(ANSWERS, SABBATH.id)).toEqual({ place: 'letter', collection: 'answers', n: SABBATH.num });
    expect(topicRoute(ANSWERS, 'answers-main-page')).toEqual({ place: 'letter', collection: 'answers', n: 0 });
    expect(topicRoute(ANSWERS, 'no-such-topic')).toBe(null);
  });

  it("a hit carries its passage and main's words ({ terms, label }); a section link its fragment, over a passage", () => {
    expect(topicRoute(ANSWERS, SABBATH.id, { excerpt: 'the seventh day', find: { terms: ['seventh', 'day'], label: 'Seventh day' } }))
      .toEqual({ place: 'letter', collection: 'answers', n: SABBATH.num, excerpt: 'the seventh day', match: ['seventh', 'day'], label: 'Seventh day' });
    expect(topicRoute(ANSWERS, SABBATH.id, { excerpt: 'x', section: 'Here_is_Wisdom' }))
      .toEqual({ place: 'letter', collection: 'answers', n: SABBATH.num, section: 'Here_is_Wisdom' });
    expect(topicRoute(ANSWERS, SABBATH.id, { find: ' holy  days ' })).toMatchObject({ match: ['holy', 'days'], label: 'holy  days' });
  });
});

describe('attributionCollection: the volume an attribution names, as v2 letter links read it', () => {
  it('numbers and words are volumes; a registry label is its collection', () => {
    g.COLLECTIONS = [VOL2, { label: "The Lord's Rebuke", registryLabel: 'Rebuke' }];
    expect(attributionCollection('2')).toBe('Volume Two');
    expect(attributionCollection('Volume seven')).toBe('Volume Seven');
    expect(attributionCollection('rebuke')).toBe("The Lord's Rebuke");
    expect(attributionCollection('Somewhere Else')).toBe('Somewhere Else');
  });
});

describe("the hosted screens: main's Answers in v2's shell", () => {
  it("the home is main's AnswersHome with the topics, Back says Home, and it starts afresh once per way in", async () => {
    const { container } = boot(HOME);
    await waitFor(() => expect(seen.AnswersHome).toBeTruthy());
    expect(container.querySelector('.ans-host .ans-landing')).not.toBe(null);
    expect(seen.AnswersHome.entries).toBe(ANSWERS);
    expect(barText(container)).toContain('Home');
    expect(g.resetAnswersLanding).toHaveBeenCalledTimes(1);
    // a topic and Back: the same way in, so main's results, tab and sheet are kept
    await run(() => seen.AnswersHome.onOpenTopic(SABBATH.id, null, 'Answers'));
    await waitFor(() => expect(seen.AnswersTopic).toBeTruthy());
    await run(() => g.handleAndroidBack());
    await waitFor(() => expect(container.querySelector('.ans-landing')).not.toBe(null));
    expect(g.resetAnswersLanding).toHaveBeenCalledTimes(1);
  });

  it('a hit opens its topic at the passage, the words handed to the page; the topic is main\'s, in v2\'s letter body', async () => {
    const { container } = boot(HOME);
    await waitFor(() => expect(seen.AnswersHome).toBeTruthy());
    const at = SABBATH.paragraphs[5].text;
    await run(() => seen.AnswersHome.onOpenTopic(SABBATH.id, at, 'Answers', null, { terms: ['sabbath'], label: 'sabbath' }));
    await waitFor(() => expect(seen.AnswersTopic).toBeTruthy());
    const t = seen.AnswersTopic;
    expect(t.entry).toBe(SABBATH);
    expect(t.findOn).toBe(true);
    expect(t.mainRef.current).toBe(container.querySelector('.body.ans-body'));
    expect(container.querySelector('.body.ans-body .ans-topic-host .ans-reading')).not.toBe(null);
    expect(barText(container)).toContain('Answers');
  });

  it('a group, Charts & videos and Saved answers are v2 places; Back from each says Answers', async () => {
    const { container } = boot(HOME);
    await waitFor(() => expect(seen.AnswersHome).toBeTruthy());
    await run(() => seen.AnswersHome.onOpenGroup(1));
    await waitFor(() => expect(seen.AnswersShelf).toBeTruthy());
    expect(seen.AnswersShelf.groupKey).toBe('1');
    expect(barText(container)).toContain('Answers');
    await run(() => g.handleAndroidBack());
    await waitFor(() => expect(container.querySelector('.ans-landing')).not.toBe(null));
    await run(() => seen.AnswersHome.onOpenMedia());
    await waitFor(() => expect(seen.AnswersMedia).toBeTruthy());
    await run(() => g.handleAndroidBack());
    await waitFor(() => expect(container.querySelector('.ans-landing')).not.toBe(null));
    await run(() => seen.AnswersHome.onOpenSaved());
    await waitFor(() => expect(seen.AnswersSaved).toBeTruthy());
    expect(barText(container)).toContain('Answers');
  });

  it("words typed: Back says Answers and clears them first (main's __screenBack), then leaves", async () => {
    const { container } = boot(HOME);
    await waitFor(() => expect(seen.AnswersHome).toBeTruthy());
    const clear = vi.fn(() => { g.__screenBack = null; return true; });
    await run(() => { g.__screenBack = clear; });
    await waitFor(() => expect(barText(container)).toContain('Answers'));
    await run(() => g.handleAndroidBack());
    expect(clear).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(barText(container)).toContain('Home'));
    expect(container.querySelector('.ans-landing')).not.toBe(null);
  });

  it('the whole-library search is the Search tab with the words', async () => {
    const { container } = boot(HOME);
    await waitFor(() => expect(seen.AnswersHome).toBeTruthy());
    await run(() => seen.AnswersHome.onSearchLibrary('zzqqx'));
    await waitFor(() => expect(container.querySelector('.tab.on').textContent).toBe('Search'));
    await waitFor(() => expect(container.querySelector('.field input.q').value).toBe('zzqqx'));
  });

  it("a topic's Next reads on with no new Back step; an attribution opens its letter on the passage", async () => {
    const { container } = boot(HOME);
    await waitFor(() => expect(seen.AnswersHome).toBeTruthy());
    await run(() => seen.AnswersHome.onOpenTopic(SABBATH.id, null, 'Answers'));
    await waitFor(() => expect(seen.AnswersTopic && seen.AnswersTopic.entry).toBe(SABBATH));
    const next = ANSWERS.find((e) => e.num === SABBATH.num + 1);
    await run(() => seen.AnswersTopic.nav.go(next.id));
    await waitFor(() => expect(seen.AnswersTopic.entry).toBe(next));
    await run(() => g.handleAndroidBack());
    await waitFor(() => expect(container.querySelector('.ans-landing')).not.toBe(null));
    // an attribution: its letter, landing on the passage
    await run(() => seen.AnswersHome.onOpenTopic(SABBATH.id, null, 'Answers'));
    await waitFor(() => expect(seen.AnswersTopic).toBeTruthy());
    await run(() => seen.AnswersTopic.act.letter({ collection: '2', letterTitle: 'Hearts Changed', excerpt: 'x' }));
    await waitFor(() => expect(container.querySelector('h1') && container.querySelector('h1').textContent).toBe('Hearts Changed'));
  });

  it("the collection route ('answers', from Home Recent or Search's Go to) is this home", async () => {
    const { container } = boot([{ place: 'home' }, { place: 'collection', collection: 'answers' }]);
    await waitFor(() => expect(container.querySelector('.ans-host .ans-landing')).not.toBe(null));
  });
});

describe('answersRead: a topic is read when vot-state counts it (main\'s isRead)', () => {
  it("reads readItems['v1:answers:<id>']", () => {
    g.StateStore = { get: () => ({ readItems: { ['v1:answers:' + SABBATH.id]: 2 } }) };
    expect(answersRead(SABBATH.id)).toBe(true);
    expect(answersRead('regarding-the-trinity')).toBe(false);
  });
});
