// @ts-nocheck — reads main's Answers data from disk (node fs and vm, no node types in this tsconfig).
/* v2 Answers Only God Can Give (mw10; design dz17, pictures 2g-2l): main's AnswersHome, CommandmentSheet,
   AnswersResults, AnswersSubject and AnswersAZ words and counts on the real data/answers.js (read as main's own Answers
   tests read it), and the pages: a commandment's sheet and Back reading "Commandment VI" from its topic, the words typed
   (Back says Answers and clears them first, on the bar and on Android's Back), a hit opening at its passage, nothing found
   handing the words to the Search tab, a subject, A-Z's jump, the collection route turned into this home, and the gates. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { V2App } from './App.jsx';
import { defineStart } from './places.js';
import {
  answersHome, commandmentSheet, commandmentName, answersResults, moreTopicsWords, answersSubject, answersAZ, topicRoute,
} from './answers-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ANSWERS = (() => {
  const ctx = { window: {} };
  runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8').replace(/^(const|let) /gm, 'var '), ctx);
  return ctx.ANSWERS || ctx.window.ANSWERS;
})();
// main's collection record for Answers (scripture-resolution.js)
const COL = { volKey: 'answers', readKey: 'answers', globalName: 'ANSWERS', prefaceGlobal: null, label: 'Answers Only God Can Give', kind: 'wtlb', indexScreen: 'answers-home' };

/** The Answers corpus as sync-loaders publishes it: loaded (the topics on window) or failed. */
function installAnswers({ loaded = true } = {}) {
  g.COLLECTIONS = [COL];
  g.COL_BY_KEY = new Map([['answers', COL]]);
  g.COL_BY_INDEX_SC = new Map([['answers-home', COL]]);
  if (loaded) g.ANSWERS = ANSWERS;
  g.__answersCorpus = { loaded, error: !loaded, subscribe: () => () => {}, getVersion: () => 1 };
  g.__loadAnswersCorpus = vi.fn(() => (loaded ? Promise.resolve() : Promise.reject(new Error('offline'))));
}

const undo = [];
afterEach(() => {
  cleanup();
  while (undo.length) undo.pop()();
  delete html.dataset.gate;
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', 'ANSWERS', '__answersCorpus', '__loadAnswersCorpus',
    'splitCompoundRef', 'findBook', 'handleAndroidBack']) delete g[k];
});

/** Boots V2App on `stack` (a real boot: no gate). */
function boot(stack) {
  installAnswers();
  undo.push(defineStart(() => stack));
  return render(<V2App gateId={null} />);
}
const ANSWERS_HOME = [{ place: 'home' }, { place: 'answers' }];
const barText = (c) => c.querySelector('.tb .title').textContent;
const barBack = (c) => c.querySelector('.tb .ic[aria-label^="Back to"]');
const rowTitles = (root) => [...root.querySelectorAll('.row.ans-t .t')].map((t) => t.textContent);

describe("answers-facts: main's words and counts on main's data", () => {
  it('the home: the commandments in two columns with main\'s aria, the nine subjects as 2g draws them, All 121', () => {
    const h = answersHome(ANSWERS);
    expect(h.left.map((c) => c.numeral + ' ' + c.label)).toEqual(['I No other gods', 'II No idols', 'III His name in vain', 'IV The Sabbath', 'V Honor parents']);
    expect(h.right.map((c) => c.numeral)).toEqual(['VI', 'VII', 'VIII', 'IX', 'X']);
    expect(h.right[0].aria).toBe('Commandment VI: Do not murder. 3 topics');
    expect(h.subjects.map((s) => s.t + ' / ' + s.s)).toEqual([
      'The Lord & His Messiah / 13 topics · The Name of The Lord, The Messiah…',
      'His Word & His Prophets / 10 topics · Spiritual Gifts, The Volumes of Truth…',
      'Sin, Repentance & Salvation / 8 topics · True Repentance, Forgiveness…',
      'Walking With God / 14 topics · Pride, The Holy Days of God…',
      'Churches & Doctrines of Men / 13 topics · I Am Calling You Out, The Churches of Men…',
      'The End of This Age / 17 topics · The Coming of The Lord, The Day of The Lord…',
      'Death, Judgment & The Kingdom / 11 topics · The Kingdom and Heaven, The Second Death…',
      'The Nations & Creation / 10 topics · Creation, Israel…',
      'Marriage, Family & Body / 6 topics · Homosexuality, Marriage…',
    ]);
    expect(h.all).toBe('All 121 in one list');
  });

  it("a commandment's sheet (2i): main's verse without its quote marks, its topics most passages first", () => {
    const s = commandmentSheet(ANSWERS, 6);
    expect([s.overline, s.label, s.verse, s.ref, s.topicsLabel, s.passages])
      .toEqual(['The Sixth Commandment', 'Do not murder', 'You shall not murder.', 'Exodus 20:13', '3 topics', '42 passages']);
    expect(s.rows.map((r) => [r.t, r.s, r.n])).toEqual([
      ['Abortion', 'Thus Says The Lord Regarding Abortion', 33],
      ['Committing Murder Within the Heart', 'God Speaks About Committing Murder Within the Heart', 5],
      ['Capital Punishment and Suicide', 'Thus Says The Lord Regarding Capital Punishment and Suicide', 4],
    ]);
    expect(commandmentSheet(ANSWERS, 11)).toBe(null);
    expect(commandmentName(6)).toBe('Commandment VI');
    // the tenth's verse closes main's quotation: both marks go
    expect(commandmentSheet(ANSWERS, 10).verse).toMatch(/^You shall not covet .*neighbor’s\.$/);
  });

  it('searched (2j): THE TOPIC with its snippet and source, then 11 more passages across 8 topics; under 2 letters nothing', () => {
    const r = answersResults(ANSWERS, 'christmas');
    expect(r.topicsLabel).toBe('The topic');
    const t = r.topics[0];
    expect([t.where, t.t, t.source]).toEqual(['Churches & Doctrines of Men · 21 passages', 'The Holidays of Men', 'From “Transgression” ~ Volume 2']);
    expect(t.snippet.map((x) => x.text).join('')).toMatch(/^…people, a most foolish and deceived generation: These modern holidays called Christmas, Easter/);
    expect(t.snippet.filter((x) => x.hit).map((x) => x.text)).toEqual(['Christmas']);
    expect(t.at).toContain('These modern holidays called Christmas');
    expect([r.mentionsLabel, r.summary]).toEqual(['Also spoken of in', '11 more passages, across 8 topics']);
    expect(r.mentions.map((m) => m.t + ' ' + m.n)).toEqual([
      'What is an Abomination to The Lord 4', 'Another Messiah 1', 'False Doctrines Within the Churches of Men Regarding... 1',
      'I Am Calling You Out 1', 'Idolatry 1', 'Obedience 1', 'Those Who Take His Name in Vain 1', 'Woe to Those Who... 1',
    ]);
    expect(answersResults(ANSWERS, ' c ')).toBe(null);
    expect(answersResults(ANSWERS, 'zzqqx')).toMatchObject({ empty: true, q: 'zzqqx' });
    expect(moreTopicsWords(9)).toBe('1 more topic');
    expect(moreTopicsWords(12)).toBe('4 more topics');
    expect(moreTopicsWords(8)).toBe('');
  });

  it('with no topic named: "Spoken of in" and "n passages" (no "more")', () => {
    const r = answersResults(ANSWERS, 'pharaoh');
    expect(r.topics).toEqual([]);
    expect(r.mentionsLabel).toBe('Spoken of in');
    expect(r.summary).toMatch(/^\d+ passages?, across \d+ topics?$/);
    expect(r.summary).not.toContain('more');
  });

  it('a subject (2k) and Every Topic A-Z (2l) as main counts and orders them; a topic opens as its page', () => {
    const s = answersSubject(ANSWERS, 'the-end-of-this-age');
    expect([s.title, s.lede]).toEqual(['The End of This Age', '17 topics · 315 passages']);
    expect(s.rows.slice(0, 4).map((r) => r.t + ' ' + r.n))
      .toEqual(['The Coming of The Lord 54', 'The Gathering Up (Rapture) 50', 'The One Who Stays, Lets 35', 'The Day of The Lord 29']);
    expect(answersSubject(ANSWERS, 'nope')).toBe(null);
    const az = answersAZ(ANSWERS);
    expect(az.lede).toBe('121 topics · 1636 passages');
    expect(az.groups.map((x) => x.letter).join('')).toBe('#ABCDEFGHIJKLMNOPRSTUVW');
    expect(az.groups[0].rows.map((r) => r.t + ' ' + r.n)).toEqual(['The 144,000 Witnesses 22']);
    expect(az.groups[1].rows.slice(0, 2).map((r) => r.t)).toEqual(['Abortion', 'Adding to or Taking Away From The Word of God']);
    const abortion = ANSWERS.find((e) => /Abortion$/.test(e.title));
    expect(topicRoute(ANSWERS, abortion.id)).toEqual({ place: 'letter', collection: 'answers', n: abortion.num });
  });
});

describe('the Answers pages', () => {
  it("Home's row opens the Answers home; a route naming the collection 'answers' is turned into it", async () => {
    const view = boot([{ place: 'home' }, { place: 'collection', collection: 'answers' }]);
    await waitFor(() => expect(view.container.querySelector('.content.ans h1')).not.toBe(null));
    expect(view.container.querySelector('h1').textContent).toBe('Answers Only God Can Give');
    expect(view.container.querySelector('.lede').textContent).toBe('The Lord sets the record straight');
    expect(view.container.querySelector('input.q').getAttribute('placeholder')).toBe('What does The Lord say about…');
    expect(barText(view.container)).toBe('Home');
  });

  it("a commandment opens its sheet; its topic opens with Back reading 'Commandment VI', and Back returns to the open sheet", async () => {
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('.grid2.cmds')).not.toBe(null));
    const vi6 = container.querySelector('.grid2.cmds button[aria-label="Commandment VI: Do not murder. 3 topics"]');
    expect(vi6.textContent).toBe('Do not murder');
    // the numeral is the label's twin: one control for a screen reader
    expect(container.querySelectorAll('.grid2.cmds button:not([aria-hidden])').length).toBe(10);
    await click(vi6);
    const sheet = document.querySelector('.sheet.cmd[role="dialog"]');
    expect(sheet.querySelector('.ref-h').textContent).toBe('Do not murder');
    expect(rowTitles(sheet)).toEqual(['Abortion', 'Committing Murder Within the Heart', 'Capital Punishment and Suicide']);
    expect(container.querySelector('.grid2.cmds .c.on').textContent).toBe('Do not murder');
    await click(sheet.querySelector('.row.ans-t'));
    await waitFor(() => expect(barText(container)).toBe('Commandment VI'));
    expect(document.querySelector('.sheet.cmd')).toBe(null);
    await click(barBack(container));
    await waitFor(() => expect(document.querySelector('.sheet.cmd .ref-h')).not.toBe(null));
    expect(barText(container)).toBe('Home');
  });

  it("the commandment's reference opens its chapter at the verse, Back reading the commandment", async () => {
    g.splitCompoundRef = (ref) => [{ ref, parsed: { rawBook: 'Exodus', chapter: '20', verse: '13' } }];
    g.findBook = (b) => (b === 'Exodus' ? 'exodus' : null);
    const { container } = boot([{ place: 'home' }, { place: 'answers', cmd: 6 }]);
    await waitFor(() => expect(document.querySelector('.sheet.cmd .cmd-go')).not.toBe(null));
    await click(document.querySelector('.sheet.cmd .cmd-go'));
    await waitFor(() => expect(barText(container)).toBe('Commandment VI'));
  });

  it('words typed: results as you type; Back says Answers and clears them first, on the bar and on Android', async () => {
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('input.q')).not.toBe(null));
    const input = container.querySelector('input.q');
    fireEvent.change(input, { target: { value: 'christmas' } });
    await waitFor(() => expect(container.querySelector('.ans-hit .tt')).not.toBe(null));
    expect(container.querySelector('.ans-hit .tt').textContent).toBe('The Holidays of Men');
    expect(container.querySelector('.ans-hit mark').textContent).toBe('Christmas');
    expect(container.querySelector('.grid2.cmds')).toBe(null);
    expect(barText(container)).toBe('Answers');
    expect(barBack(container).getAttribute('aria-label')).toBe('Back to Answers');
    await click(barBack(container));
    await waitFor(() => expect(container.querySelector('.grid2.cmds')).not.toBe(null));
    expect(input.value).toBe('');
    expect(barText(container)).toBe('Home');
    // Android's Back: the words first, then the page
    fireEvent.change(input, { target: { value: 'sabbath' } });
    await waitFor(() => expect(barText(container)).toBe('Answers'));
    let r;
    await act(async () => { r = g.handleAndroidBack(); });
    expect(r).toBe('true');
    expect(input.value).toBe('');
    await act(async () => { r = g.handleAndroidBack(); });
    await waitFor(() => expect(container.querySelector('.content.ans')).toBe(null));
  });

  it('a hit opens its topic at the passage (the words marked, Find holding them); Back returns to the words', async () => {
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('input.q')).not.toBe(null));
    fireEvent.change(container.querySelector('input.q'), { target: { value: 'christmas' } });
    await waitFor(() => expect(container.querySelector('.ans-hit')).not.toBe(null));
    await click(container.querySelector('.ans-hit'));
    await waitFor(() => expect(barText(container)).toBe('Answers'));
    await waitFor(() => expect(container.querySelector('.fnd input.q')).not.toBe(null));
    expect(container.querySelector('.fnd input.q').value).toBe('christmas');
    await click(barBack(container));
    await waitFor(() => expect(container.querySelector('.content.ans input.q')).not.toBe(null));
    expect(container.querySelector('.content.ans input.q').value).toBe('christmas');
    expect(container.querySelector('.ans-hit .tt').textContent).toBe('The Holidays of Men');
  });

  it('past eight mentions, main\'s "n more topics" shows the rest', async () => {
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('input.q')).not.toBe(null));
    const r = answersResults(ANSWERS, 'faith');
    expect(r.mentions.length).toBeGreaterThan(8);
    fireEvent.change(container.querySelector('input.q'), { target: { value: 'faith' } });
    await waitFor(() => expect(container.querySelector('.ans-res > .more')).not.toBe(null));
    expect(container.querySelectorAll('.ans-res .ans-list .row').length).toBe(8);
    expect(container.querySelector('.ans-res > .more').textContent).toBe(moreTopicsWords(r.mentions.length));
    await click(container.querySelector('.ans-res > .more'));
    expect(container.querySelectorAll('.ans-res .ans-list .row').length).toBe(r.mentions.length);
  });

  it("nothing found: main's words, and the whole library searched for them in the Search tab", async () => {
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('input.q')).not.toBe(null));
    fireEvent.change(container.querySelector('input.q'), { target: { value: 'zzqqx' } });
    await waitFor(() => expect(container.querySelector('.ans-res .empty')).not.toBe(null));
    expect(container.querySelector('.ans-res .empty .t').textContent).toBe('Nothing in Answers speaks of “zzqqx”.');
    const lib = container.querySelector('.ans-res .empty .textbtn');
    expect(lib.textContent).toBe('Search the whole library for “zzqqx”');
    await click(lib);
    await waitFor(() => expect(container.querySelector('.tab.on').textContent).toBe('Search'));
    await waitFor(() => expect(container.querySelector('.field input.q').value).toBe('zzqqx'));
  });

  it("a subject's page says Back to Answers; its topic says Back to the subject", async () => {
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('.sec.ans-subj')).not.toBe(null));
    const subj = [...container.querySelectorAll('.rows .row.ans-t')].find((r) => r.querySelector('.t').textContent === 'The End of This Age');
    await click(subj);
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('The End of This Age'));
    expect(barText(container)).toBe('Answers');
    expect(container.querySelector('.page-head .lede').textContent).toBe('17 topics · 315 passages');
    expect(rowTitles(container).slice(0, 2)).toEqual(['The Coming of The Lord', 'The Gathering Up (Rapture)']);
    await click(container.querySelector('.row.ans-t'));
    await waitFor(() => expect(barText(container)).toBe('The End of This Age'));
  });

  it('Every Topic, A-Z: a jump letter scrolls its group to the top; Numbers reads #', async () => {
    const seen = [];
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function f() { seen.push(this.getAttribute('data-az-letter')); };
    undo.push(() => { Element.prototype.scrollIntoView = was; });
    const { container } = boot(ANSWERS_HOME);
    await waitFor(() => expect(container.querySelector('.sec.ans-subj')).not.toBe(null));
    const az = [...container.querySelectorAll('.rows .row.ans-t')].pop();
    expect(az.textContent).toContain('All 121 in one list');
    await click(az);
    await waitFor(() => expect(container.querySelector('nav.azj')).not.toBe(null));
    expect(container.querySelector('nav.azj button').getAttribute('aria-label')).toBe('Numbers');
    expect(barText(container)).toBe('Answers');
    await click(container.querySelector('nav.azj button[aria-label="M"]'));
    expect(seen).toEqual(['M']);
  });

  it('the topics not loaded (offline before their first fetch): says so, ready, Try again asks again', async () => {
    installAnswers({ loaded: false });
    undo.push(defineStart(() => ANSWERS_HOME));
    const { container } = render(<V2App gateId={null} />);
    await waitFor(() => expect(container.querySelector('.empty .t')).not.toBe(null));
    expect(container.querySelector('.empty .t').textContent).toBe('The topics could not be loaded.');
    const asks = g.__loadAnswersCorpus.mock.calls.length;
    await click(container.querySelector('.empty .textbtn'));
    expect(g.__loadAnswersCorpus.mock.calls.length).toBe(asks + 1);
  });
});

describe('the Answers gates (2g-2l)', () => {
  for (const id of ['2g-answers', '2h-answers-subjects', '2k-answers-subject', '2l-answers-az']) {
    it(id + ' is ready on main\'s data', async () => {
      installAnswers();
      render(<V2App gateId={id} />);
      await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    });
  }

  it('2i draws commandment VI open; 2j draws "christmas" typed, the field lit with its caret, Back saying Answers', async () => {
    installAnswers();
    const a = render(<V2App gateId="2i-commandment" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(document.querySelector('.sheet.cmd .overline').textContent).toBe('The Sixth Commandment');
    expect(barText(a.container)).toBe('Home');
    a.unmount();
    delete html.dataset.gate;
    const b = render(<V2App gateId="2j-answers-search" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(b.container.querySelector('.field.focus input.q').value).toBe('christmas');
    expect(b.container.querySelector('.field .caret')).not.toBe(null);
    expect(barText(b.container)).toBe('Answers');
  });
});
