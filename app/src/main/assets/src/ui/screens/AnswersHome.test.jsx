// @ts-nocheck — free-var globals installed on window, same shape as VolumesHome.counts.test.jsx
/* AnswersHome / AnswersShelf / AnswersMedia — the Answers browse screens on the real corpus and its
   sidecars (AOGCG final design f01-f06, f12, f13; Browse stage 2026-10-22). */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act, within } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersHome, resetAnswersLanding, openAnswersLandingFromSearch } from './AnswersHome.jsx';
import { AnswersShelf } from './AnswersShelf.jsx';
import { AnswersMedia } from './AnswersMedia.jsx';
import { passageCopy } from '../../utils/passage-copy.js';
import { useFocusTrap } from '../../hooks/use-focus-trap.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8') + ';this.SITE=ANSWERS_SITE_META;', ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8') + ';this.META=ANSWERS_META;', ctx);
// What screen-routes hands the browse screens: the whole array, the Main Page (last) included.
const ANSWERS = ctx.ANSWERS;
const SITE = ctx.SITE;

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'SheetHandle', 'useFocusTrap', 'ReactDOM', 'ANSWERS_META'];
let navProps, layoutClass;
beforeEach(() => {
  resetAnswersLanding();
  try { localStorage.clear(); } catch (_e) { /* */ }
  navProps = null;
  window.ScreenLayout = ({ navChildren, children, className }) => { layoutClass = className; return <div>{navChildren}{children}</div>; };
  window.LibraryNav = (p) => { navProps = p; return <div><button type="button" data-testid="nav-back" onClick={p.onBack}>{p.backLabel}</button>{p.leftExtras}</div>; };
  window.SheetHandle = ({ onClose, glyph }) => <button type="button" onClick={onClose} aria-label="Close">{glyph || '‹'}</button>;
  window.useFocusTrap = () => ({ current: null });
  window.ReactDOM = ReactDOM;
  window.ANSWERS_META = ctx.META;
});
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; delete window.__screenBack; delete window.__closeSheet; });

const noop = () => {};
// The mockups' sample state (spec 1.3): seven topics read, Regarding Patience finished last.
const READ = new Set(['god-speaks-about-the-sabbath', 'answers-the-volumes-of-truth', 'the-name-of-the-lord',
  'regarding-the-mistranslation-and-misinterpretation-of-the-scriptures', 'regarding-the-ten-commandments',
  'regarding-hell-and-eternal-torment', 'regarding-patience']);
const base = { entries: ANSWERS, site: SITE, isRead: (id) => READ.has(id), pathOn: true, pathLast: 'regarding-patience',
  onBack: noop, onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop, onOpenTopic: noop };
const texts = (sel, root = document) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const NB = (s) => s.replace(/\u00a0/g, ' ').replace(/ {2,}/g, ' ');
const field = () => screen.getByLabelText('Search Answers');

describe('AnswersHome — the landing (0125: ask, then browse)', () => {
  it('Browse: Start here, the tablets, the thirteen groups closed, then the index, Charts and videos, Saved answers', () => {
    render(<AnswersHome {...base} />);
    const panel = document.querySelector('.ans-landing-b');
    expect(texts('.ans-sechead .ans-h2', panel)).toEqual(['Browse', 'The Ten Commandments', 'Topics']);
    expect(screen.getByRole('button', { name: 'A–Z' }).closest('.ans-browse-head')).toBeTruthy();
    expect(texts('.ans-tablet .ans-num')).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    // the tablet says what it opens
    expect(NB(document.querySelectorAll('.ans-tablet .ans-row-sub')[1].textContent)).toBe('3 topics');
    // the thirteen: the site's Other Topics, then its twelve numbered groups by our short names; no counts, all closed
    expect(texts('.ans-group-row .ans-row-title', panel)).toEqual(['The Lord and His Word', 'Signs of this generation', 'Prophets, witnesses & gifts',
      'The nations', 'The churches', 'Scripture & doctrine', 'Holy Days, cross & resurrection', 'Forgiveness to salvation', 'The end & the Kingdom',
      'Warfare, sin, death & judgment', 'The walk of faith', 'Body, marriage & family', 'People of the Bible & creation']);
    expect(panel.querySelectorAll('.ans-group-row .ans-row-sub').length).toBe(0);
    expect([...panel.querySelectorAll('.ans-group-row')].every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(panel.querySelector('.ans-group-topics')).toBeNull();
    expect(texts('.ans-more-rows .ans-row-title', panel)).toEqual(['False Doctrines Within the Churches (Index)', 'Charts and videos', 'Saved answers']);
    expect(NB(panel.querySelector('.ans-more-rows .ans-row-sub').textContent)).toBe('46 categories, each answered by The Truth');
    expect(NB(screen.getByRole('button', { name: /^Charts and videos/ }).getAttribute('aria-label'))).toBe('Charts and videos, 2 charts, 4 videos, 11 playlists and more');
    // the site's Main Page is Start here, once; no tabs, no jump chips, no Start here card
    expect(texts('.ans-row-title', panel)).not.toContain('Main Page');
    expect(document.querySelector('[role="tab"], .ans-jump-strip, .ans-start, .ans-two')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Most spoken of|Browse by subject|Every Topic, A–Z|The End of This Age|short names are ours|Not in the site’s menu/);
  });

  it('a group opens in place to its topics\' plain names, one at a time; Read all N in order is its last line', () => {
    const onOpenTopic = vi.fn(); const onOpenGroup = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} onOpenGroup={onOpenGroup} />);
    const row = (t) => screen.getByText(t, { selector: '.ans-group-row .ans-row-title' }).closest('button');
    fireEvent.click(row('Scripture & doctrine'));
    expect(row('Scripture & doctrine').getAttribute('aria-expanded')).toBe('true');
    const list = document.getElementById(row('Scripture & doctrine').getAttribute('aria-controls'));
    expect(list.querySelectorAll('.ans-group-topic').length).toBe(9);
    expect(list.querySelectorAll('.ans-group-topic .ans-read').length).toBe(3);          // the read ticks kept
    expect(list.querySelector('.ans-group-topic .ans-lead')).toBeTruthy();              // "Regarding" dimmed
    expect(list.querySelector('.ans-group-topic .ans-row-sub')).toBeNull();             // plain names, no counts
    fireEvent.click(list.querySelector('.ans-group-topic'));
    expect(onOpenTopic).toHaveBeenLastCalledWith(expect.any(String), null, 'Scripture & doctrine');
    fireEvent.click(within(list).getByText('Read all 9 in order'));
    const [first] = onOpenTopic.mock.calls[onOpenTopic.mock.calls.length - 1];
    expect(READ.has(first)).toBe(false);                                                 // some read: the first one not read
    fireEvent.click(row('The nations'));
    expect(document.querySelectorAll('.ans-group-topics').length).toBe(1);
    expect(row('Scripture & doctrine').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row('The nations'));
    expect(document.querySelector('.ans-group-topics')).toBeNull();
    expect(onOpenGroup).not.toHaveBeenCalled();                                          // the group screen stays for deep links only
  });

  it('the open group and the page\'s scroll come back from a topic; entering from Home starts afresh', () => {
    window.ScreenLayout = ({ navChildren, children }) => <div className="screen-scroll">{navChildren}{children}</div>;
    let top = 0;
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
    try {
      const first = render(<AnswersHome {...base} />);
      fireEvent.click(screen.getByText('The churches', { selector: '.ans-group-row .ans-row-title' }));
      top = 900;
      act(() => { document.querySelector('.screen-scroll').dispatchEvent(new Event('scroll')); });
      first.unmount();
      top = 0;
      const second = render(<AnswersHome {...base} />);
      expect(screen.getByText('The churches', { selector: '.ans-group-row .ans-row-title' }).closest('button').getAttribute('aria-expanded')).toBe('true');
      expect(top).toBe(900);
      second.unmount();
      resetAnswersLanding();
      top = 0;
      render(<AnswersHome {...base} />);
      expect(document.querySelector('.ans-group-topics')).toBeNull();
      expect(top).toBe(0);
    } finally {
      if (scrollTop) Object.defineProperty(Element.prototype, 'scrollTop', scrollTop);
    }
  });

  it('the reading path is the first row: Continue in the site\'s order, Start here, or nothing read when it is off', () => {
    const first = render(<AnswersHome {...base} />);
    const path = () => document.querySelector('.ans-start-row');
    expect(path().querySelector('.ans-row-title').textContent).toBe('Continue: Regarding Faith');
    expect(NB(path().querySelector('.ans-row-sub').textContent)).toBe('95 of 120 topics · in the site’s order');
    first.unmount();
    const second = render(<AnswersHome {...base} isRead={() => false} pathLast={null} />);
    expect(path().querySelector('.ans-row-title').textContent).toBe('Start here');
    expect(NB(path().querySelector('.ans-row-sub').textContent)).toBe('introduction · 12 min');
    second.unmount();
    render(<AnswersHome {...base} pathOn={false} />);
    expect(path().querySelector('.ans-row-title').textContent).toBe('Start here');
    expect(document.querySelector('.ans-read')).toBeNull();
  });

  it('three questions in one running line, then More questions; Surprise me is the sheet\'s first row', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    const line = document.querySelector('.ans-ask .ans-qs');
    expect(line.tagName).toBe('P');                                                      // inline text, no flex box (10-21)
    expect(texts('.ans-q', line)).toEqual(['…the Sabbath?', '…the Trinity?', '…hell?', 'More questions']);
    expect(document.querySelector('.ans-ask .ans-chip')).toBeNull();
    fireEvent.click(screen.getByText('…the Trinity?'));
    expect(onOpenTopic).toHaveBeenLastCalledWith('regarding-the-trinity', null, 'Answers');
    expect(document.body.textContent).not.toMatch(/Answer of the day|Read in context/);
    fireEvent.click(screen.getByText('More questions'));
    const rows = [...screen.getByRole('dialog').querySelectorAll('.ans-row')];
    expect(rows.length).toBe(13);
    expect(rows[0].querySelector('.ans-row-title').textContent).toBe('Surprise me');
    fireEvent.click(rows[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
    const [id, para, from] = onOpenTopic.mock.calls[onOpenTopic.mock.calls.length - 1];
    const e = ANSWERS.find((x) => x.id === id);
    expect(e.paragraphs.some((p) => p.text === para && p.align === 'justify')).toBe(true);
    expect(from).toBe('Answers');
  });

  // ANS1: the questions finish "What does The Lord say about…"; when the field falls back, the words stand above them
  it('the lead-in line shows exactly when the field falls back to "Search Answers…"', () => {
    const proto = HTMLCanvasElement.prototype;
    const had = proto.getContext;
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const run = (room) => {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return room; } });
      const r = render(<AnswersHome {...base} />);
      const out = { ph: field().getAttribute('placeholder'), lead: document.querySelector('.ans-ask-lead') };
      const next = out.lead ? out.lead.nextElementSibling : null;
      out.beforeQs = !!(next && next.classList.contains('ans-qs'));
      out.text = out.lead ? out.lead.textContent : null;
      r.unmount();
      return out;
    };
    try {
      proto.getContext = function getContext() { return { font: '', measureText: (t) => ({ width: t.length * 8 }) }; };
      const narrow = run(150);
      expect(narrow.ph).toBe('Search Answers…');
      expect(narrow.text).toBe('What does The Lord say about…');
      expect(narrow.beforeQs).toBe(true);
      const wide = run(600);
      expect(wide.ph).toBe('What does The Lord say about…');
      expect(wide.lead).toBeNull();
    } finally {
      proto.getContext = had;
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw); else delete HTMLElement.prototype.clientWidth;
    }
  });

  // ANS1: the scrolled-in bar title is never cut: whole when it fits at 15 px or more, else "Answers"
  it('the bar title is the whole name, made smaller to fit, or "Answers"; never an ellipsis', () => {
    const proto = HTMLCanvasElement.prototype;
    const had = proto.getContext;
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const title = (room) => {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return room; } });
      const r = render(<AnswersHome {...base} />);
      const inner = navProps.leftExtras && document.querySelector('.ans-bar-title > span');
      const out = { text: inner.textContent, size: inner.style.fontSize };
      r.unmount();
      return out;
    };
    try {
      // the title measures 250 px at the bar's 18 px (a stub canvas; jsdom has no font size, so the bar's is given)
      proto.getContext = function getContext() { const c = { font: '', measureText: (t) => ({ width: t.length * 10 }) }; return c; };
      const gcs = window.getComputedStyle;
      window.getComputedStyle = (el) => { const cs = gcs(el); return new Proxy(cs, { get: (o, k) => (k === 'fontSize' ? '18px' : (typeof o[k] === 'function' ? o[k].bind(o) : o[k])) }); };
      try {
        expect(title(400)).toEqual({ text: 'Answers Only God Can Give', size: '' });
        const small = title(230);
        expect(small.text).toBe('Answers Only God Can Give');
        expect(parseFloat(small.size)).toBeGreaterThanOrEqual(15);
        expect(title(150)).toEqual({ text: 'Answers', size: '' });
      } finally { window.getComputedStyle = gcs; }
    } finally {
      proto.getContext = had;
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw); else delete HTMLElement.prototype.clientWidth;
    }
    expect(document.body.textContent).not.toMatch(/Answers Only God Can …/);
  });

  it('while answers.js loads, the head, title, tagline, questions and tablets paint; the path, groups and A–Z wait', () => {
    window.ANSWERS_META = undefined;
    render(<AnswersHome {...base} entries={null} site={null} />);
    expect(document.querySelector('h1').textContent).toBe('Answers Only God Can Give');
    expect(document.querySelector('.ans-lede').textContent).toBe(SITE.tagline);
    expect(document.querySelectorAll('.ans-q').length).toBe(4);
    expect(document.querySelectorAll('.ans-tablet').length).toBe(10);
    expect(document.querySelector('.ans-start-row, .ans-group-row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'A–Z' })).toBeNull();
  });

  // 10-22 sweep, Discovery views 6: before the sidecar lands the index's row says its sentence less its count
  it('before the sidecar, the index row says its sentence without the count', () => {
    delete window.ANSWERS_META;
    render(<AnswersHome {...base} />);
    const fd = [...document.querySelectorAll('.ans-row')].find((r) => r.querySelector('.ans-row-title').textContent === 'False Doctrines Within the Churches (Index)');
    expect(NB(fd.querySelector('.ans-row-sub').textContent)).toBe('Categories, each answered by The Truth');
  });

  it('Charts and videos and Saved answers open where they say', () => {
    const onOpenMedia = vi.fn(); const onOpenSaved = vi.fn();
    render(<AnswersHome {...base} onOpenMedia={onOpenMedia} onOpenSaved={onOpenSaved} />);
    fireEvent.click(screen.getByText('Charts and videos').closest('button'));
    expect(onOpenMedia).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Saved answers').closest('button'));
    expect(onOpenSaved).toHaveBeenCalled();
    expect(layoutClass).toContain('ans-wide');
  });
});

describe('AnswersHome — A–Z is a mode of the landing (0125 b)', () => {
  it('the Browse head\'s A–Z enters it; Back and By group leave it, and Back then leaves the screen', () => {
    const onBack = vi.fn();
    render(<AnswersHome {...base} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(document.querySelector('.ans-browse-head .ans-h2').textContent).toBe('All topics, A–Z');
    expect(document.querySelectorAll('#ans-panel-az .ans-row').length).toBe(121);
    let r;
    act(() => { r = window.__screenBack(); });
    expect(r).toBe(true);
    expect(document.querySelector('.ans-browse-head .ans-h2').textContent).toBe('Browse');
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    fireEvent.click(screen.getByTestId('nav-back'));                                     // the bar's back leaves A–Z first
    expect(document.querySelector('.ans-group-row')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    fireEvent.click(screen.getByRole('button', { name: 'By group' }));
    expect(document.querySelector('.ans-group-row')).toBeTruthy();
    expect(window.__screenBack == null).toBe(true);
    fireEvent.click(screen.getByTestId('nav-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('AnswersHome — the sheets (f03, f01b, f12)', () => {
  it('a tablet opens its commandment: the site\'s heading, the verse, its topics in the site\'s order', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    fireEvent.click(screen.getByRole('button', { name: /^2\. You Shall Not Commit Idolatry\. 3 topics$/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.ans-k').textContent).toBe('The Second Commandment');
    expect(dialog.querySelector('.ans-sh-m').textContent).toBe('2 of 10');
    expect(dialog.querySelector('.ans-h2').textContent).toBe('You Shall Not Commit Idolatry.');
    expect(dialog.querySelector('.ans-verse').textContent).toMatch(/^You shall not make for yourself a carved image—.*earth;$/);
    expect(texts('.ans-row-title', dialog)).toEqual(['God Speaks About Idolatry', 'God Speaks About Materialism', 'Regarding Another Messiah']);
    fireEvent.click(within(dialog).getByText('Idolatry').closest('button'));
    expect(onOpenTopic).toHaveBeenCalledWith('god-speaks-about-idolatry', null, 'Answers');
    // WA2 (a-cmd): step to the next commandment without closing
    fireEvent.click(screen.getByRole('button', { name: /^Next commandment: III/ }));
    expect(screen.getByRole('dialog').querySelector('.ans-k').textContent).toBe('The Third Commandment');
    act(() => { window.__closeSheet(); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('with the real focus trap, the sheet opens on its × and Back hands focus back to the tablet', () => {
    window.useFocusTrap = useFocusTrap;
    render(<AnswersHome {...base} />);
    const tablet = document.querySelectorAll('.ans-tablet')[5];
    tablet.focus();
    act(() => { fireEvent.click(tablet); });
    const sheet = screen.getByRole('dialog');
    expect(document.activeElement).toBe(within(sheet).getByLabelText('Close'));
    act(() => { window.__closeSheet(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tablet);
  });

  // MERGE8: SHARE1's default for Scripture is the reference alone ("no version number", Corbin 2026-11-11).
  it('a copy of the commandment ends with its reference, once', () => {
    render(<AnswersHome {...base} onGoToRef={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /^6\. You Shall Not Murder\./ }));
    const words = document.createRange();
    words.selectNodeContents(screen.getByRole('dialog').querySelector('.ans-verse'));
    expect(passageCopy(words).text).toBe('"You shall not murder."\n\nExodus 20:13');
  });

  it('the open sheet survives a round trip to a topic (U5)', () => {
    const first = render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByText('More questions'));
    expect(screen.getByRole('dialog').querySelectorAll('.ans-row').length).toBe(13);   // Surprise me, then the twelve
    first.unmount();
    render(<AnswersHome {...base} />);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Start with a question');
  });

  it('About shows the site\'s page, its nine Sister Sites word for word, and which words are ours', () => {
    render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByText('About this collection'));
    const d = screen.getByRole('dialog');
    expect(d.querySelector('.ans-about-t').textContent).toBe('About Answers Only God Can Give');
    // WA2 (a-about): the site's own row first, then the Sister Sites, in one card under their head
    const sister = [...d.querySelectorAll('h3')].find((h) => h.textContent === 'Sister Sites');
    const rows = [...sister.parentNode.nextElementSibling.querySelectorAll('a .ans-row-title')].map((n) => n.textContent).slice(1);
    // ANS1 (mock a-about): the official pages by short names, the address under each; the site's full name stays the label
    expect(rows.slice(0, 4)).toEqual(['TheVolumesofTruth.com', 'YouTube channel', 'Facebook page', 'X page']);
    expect(rows.slice(4)).toEqual(SITE.sisterSites.slice(4).map((s) => s.label));
    const yt = [...sister.parentNode.nextElementSibling.querySelectorAll('a')].find((a) => a.textContent.startsWith('YouTube channel'));
    expect(yt.querySelector('.ans-row-sub').textContent).toBe('youtube.com/AnswersOnlyGodCanGive');
    expect(yt.getAttribute('aria-label')).toBe('Answers Only God Can Give - Official YouTube Channel, youtube.com/AnswersOnlyGodCanGive');
    expect(d.textContent).toContain('Copyright © 2004-2024 ~ All Rights Reserved.');
    expect(d.textContent).toContain('2026-10-19');
    expect(d.textContent).toContain('The words, headings and order are the site’s.');
    // 0125 C: the self-explanations the screens carried, said once here
    expect(d.textContent).toContain('the short names are ours. The site’s “Other Topics” is called The Lord and His Word here.');
    expect(d.textContent).toContain('A–Z files each topic under its first main word');
    for (const a of d.querySelectorAll('a[href^="http"]')) expect(a.getAttribute('target')).toBe('_blank');
  });
});

describe('AnswersHome — search (f06)', () => {
  it('groups by topic, title matches first then the site\'s order; the header is the sum', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    fireEvent.change(field(), { target: { value: 'sabbath' } });
    expect(NB(document.querySelector('.ans-results .ans-sechead .ans-count').textContent)).toBe('73 matches in 22 topics');
    const subs = texts('.ans-results .ans-res .ans-row-sub').map(NB);
    expect(subs[0]).toBe('The Fourth Commandment · 18 of 19 passages match');
    expect(subs[1]).toBe('The Second Commandment · 1 of 18 passages match');
    expect(subs.length).toBe(8);
    expect(document.querySelector('.ans-res mark').textContent).toBe('Sabbath');
    expect(NB(document.querySelector('.ans-hit-src').textContent)).toBe('“You Shall Not Desecrate the Sabbath” · Volume 3 · 3/29/06');
    // the browse column steps aside (CSS: .ans-landing.is-query; on a desktop it stays beside the results)
    expect(document.querySelector('.ans-landing').classList.contains('is-query')).toBe(true);
    expect(document.querySelector('.ans-landing-a .ans-chips')).toBeNull();
    fireEvent.click(screen.getByText('Show 14 more topics'));
    expect(document.querySelectorAll('.ans-results .ans-res').length).toBe(22);
    fireEvent.click(document.querySelector('.ans-res'));
    const [id, anchor, from, section, find] = onOpenTopic.mock.calls[0];
    expect(id).toBe('god-speaks-about-the-sabbath');
    expect(anchor.toLowerCase()).toContain('sabbath');
    expect(from).toBe('Answers');
    // U8: the topic opens on the passage with find-in-topic preset to the query (the words the hit marked)
    expect(section).toBeNull();
    expect(find.label).toBe('sabbath');
    expect(find.terms).toContain('sabbath');
  });

  it('once the main engine\'s index is ready, its order kept to Answers; the box\'s groups before (search200 h8)', async () => {
    const doc = (id) => { const e = ANSWERS.find((x) => x.id === id); return { kind: 'answers', volumeId: 'answers', letterId: id, title: e.title, text: e.paragraphs.map((p) => p.text).join(' ') }; };
    let current = false;
    let answer;
    const search = vi.fn(() => new Promise((res) => { answer = res; }));
    window.VotSearchMini = { isCurrent: () => current, search, matchExcerpt: () => '' };
    try {
      const view = render(<AnswersHome {...base} />);
      // the index is building: the box answers on its own, title matches first
      fireEvent.change(field(), { target: { value: 'sabbath' } });
      expect(search).not.toHaveBeenCalled();
      expect(texts('.ans-results .ans-row-title')[0]).toBe('God Speaks About The Sabbath');
      // ready: the title matches while the engine answers, then the engine's order
      current = true;
      view.rerender(<AnswersHome {...base} />);
      expect(search).toHaveBeenCalledTimes(1);
      fireEvent.change(field(), { target: { value: 'is sunday the sabbath' } });
      expect(search).toHaveBeenCalledTimes(2);
      expect(search.mock.calls[1][0]).toBe('is sunday the sabbath');
      expect(search.mock.calls[1][1].scope).toEqual({ volumeId: 'answers' });
      // the search called off for the query typed over
      expect(search.mock.calls[0][1].signal.aborted).toBe(true);
      expect(document.querySelector('.ans-results .ans-sechead .ans-count').textContent).toBe('Searching…');
      await act(async () => { answer({ results: [doc('regarding-the-holidays-of-men'), doc('god-speaks-about-the-sabbath')].map((d) => ({ doc: d, terms: [] })) }); });
      expect(texts('.ans-results .ans-row-title').slice(0, 2)).toEqual(['Regarding the Holidays of Men', 'God Speaks About The Sabbath']);
      expect(NB(document.querySelector('.ans-results .ans-sechead .ans-count').textContent)).toMatch(/topic/);
    } finally { delete window.VotSearchMini; }
  });

  it('Back with a question typed clears it before leaving the screen', () => {
    const onBack = vi.fn();
    render(<AnswersHome {...base} onBack={onBack} />);
    fireEvent.change(field(), { target: { value: 'pride' } });
    expect(typeof window.__screenBack).toBe('function');
    act(() => { expect(window.__screenBack()).toBe(true); });
    expect(field().value).toBe('');
    expect(window.__screenBack).toBeFalsy();
    fireEvent.click(screen.getByTestId('nav-back'));
    expect(onBack).toHaveBeenCalled();
    expect(navProps.showHome).toBe(true);
  });

  it('remembers the question across a round trip to a topic, until the Home card resets it', () => {
    const first = render(<AnswersHome {...base} />);
    fireEvent.change(field(), { target: { value: 'prayer' } });
    first.unmount();
    render(<AnswersHome {...base} />);
    expect(field().value).toBe('prayer');
    cleanup();
    resetAnswersLanding();
    render(<AnswersHome {...base} />);
    expect(field().value).toBe('');
  });

  it('says so when nothing speaks of it, offers the questions and the whole library', () => {
    const onSearchLibrary = vi.fn();
    render(<AnswersHome {...base} onSearchLibrary={onSearchLibrary} />);
    fireEvent.change(field(), { target: { value: 'xyzzy' } });
    expect(screen.getByText('Nothing in Answers speaks of “xyzzy”.')).toBeTruthy();
    expect(document.querySelectorAll('.ans-results .ans-chip').length).toBe(6);
    fireEvent.click(screen.getByText(/Search the whole library for “xyzzy”/));
    expect(onSearchLibrary).toHaveBeenCalledWith('xyzzy');
  });

  it('a typo finds its closest topics', () => {
    render(<AnswersHome {...base} />);
    fireEvent.change(field(), { target: { value: 'sabath' } });
    expect(screen.getByText('Nothing in Answers speaks of “sabath”.')).toBeTruthy();
    expect(screen.getByText('Closest topics')).toBeTruthy();
    expect(texts('.ans-results .ans-row-title')).toContain('God Speaks About The Sabbath');
  });

  it('recent searches show on an empty focused field, kept on this device, and Clear empties them', () => {
    localStorage.setItem('vot-answers-recent', JSON.stringify(['sabbath', 'holy days']));
    render(<AnswersHome {...base} />);
    fireEvent.focus(field());
    expect(texts('.ans-recent .ans-row-title')).toEqual(['sabbath', 'holy days']);
    fireEvent.click(screen.getByText('Clear'));
    expect(localStorage.getItem('vot-answers-recent')).toBeNull();
  });
});

describe('AnswersHome — opened from the Or ask row of Search (PL-SEARCH 2)', () => {
  it('holds the words typed in Search, and Back goes straight back; an edited box clears first', () => {
    const onBack = vi.fn();
    openAnswersLandingFromSearch('  sabbath ');
    render(<AnswersHome {...base} onBack={onBack} />);
    expect(field().value).toBe('sabbath');
    expect(document.querySelector('.ans-landing').classList.contains('is-query')).toBe(true);
    expect(navProps.backLabel).toBe('Search');
    expect(window.__screenBack || null).toBeNull();
    fireEvent.click(screen.getByTestId('nav-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    // his own words in the Answers box clear first, as they always did; the emptied box then leaves for Search
    fireEvent.change(field(), { target: { value: 'sabbath day' } });
    expect(navProps.backLabel).toBe('Answers');
    expect(typeof window.__screenBack).toBe('function');
    fireEvent.click(screen.getByTestId('nav-back'));
    expect(field().value).toBe('');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(navProps.backLabel).toBe('Search');
  });

  it('entering from Home forgets Search: Back is Home again', () => {
    openAnswersLandingFromSearch('sabbath');
    resetAnswersLanding();
    render(<AnswersHome {...base} />);
    expect(field().value).toBe('');
    expect(navProps.backLabel).toBe('Home');
  });
});

describe('AnswersHome — A–Z (f05)', () => {
  it('files all 121 topics under their letters, with a 27-key strip and the empty letters off', () => {
    render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    const panel = document.getElementById('ans-panel-az');
    expect(panel.querySelectorAll('.ans-row').length).toBe(121);
    const letters = texts('.ans-az-letter', panel);
    expect(letters[0]).toBe('#');
    expect(letters.slice(1)).toEqual([...letters.slice(1)].sort());
    const keys = [...panel.querySelectorAll('.ans-az-key')];
    expect(keys.length).toBe(27);
    expect(keys.filter((k) => k.disabled).map((k) => k.textContent)).toEqual(['Q', 'X', 'Y', 'Z']);
    expect(NB(panel.querySelector('.ans-row .ans-row-sub').textContent)).toBe('Prophets, witnesses & gifts · 22 passages');
  });

  /* The last letter is too short to reach the strip at the end of the list: the scroll reader saw V
     there and took the strip off the W just tapped. Geometry is stubbed: jsdom lays nothing out. */
  it('a tapped last letter stays current through a long travel and at the end, until the reader moves the page', async () => {
    window.ScreenLayout = ({ navChildren, children }) => <div className="screen-scroll">{navChildren}{children}</div>;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    try {
      render(<AnswersHome {...base} />);
      fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
      const scroller = document.querySelector('.screen-scroll');
      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5000 });
      Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 800 });
      let top = 4200;                                              // at its end
      Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
      const rect = (top) => () => ({ top, bottom: top + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: top });
      document.querySelector('.ans-az-strip').getBoundingClientRect = rect(0);
      for (const s of document.querySelectorAll('section[data-az]')) {
        const L = s.getAttribute('data-az');
        s.getBoundingClientRect = rect(L === 'W' ? 300 : (L < 'W' || L === '#' ? -100 : 900)); // V is the last head above the strip
      }
      const key = (L) => [...document.querySelectorAll('.ans-az-key')].find((k) => k.textContent === L);
      fireEvent.click(key('W'));
      expect(into).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
      // The smooth travel from the top takes over a second (12k px on a phone); every frame of it, and the end, read W.
      const t0 = Date.now();
      const clock = vi.spyOn(Date, 'now');
      for (const [t, ms] of [[1000, 400], [3000, 1300], [4200, 1700]]) { clock.mockReturnValue(t0 + ms); top = t; act(() => { scroller.dispatchEvent(new Event('scroll')); }); }
      clock.mockRestore();
      expect(key('W').getAttribute('aria-current')).toBe('true');
      expect(key('V').getAttribute('aria-current')).toBeNull();
      // A finger on the page: its own letter wins again.
      fireEvent.touchStart(scroller);
      top = 3000;
      act(() => { scroller.dispatchEvent(new Event('scroll')); });
      expect(key('V').getAttribute('aria-current')).toBe('true');
    } finally {
      raf.mockRestore();
      delete Element.prototype.scrollIntoView;
    }
  });

  it('a saved A–Z, while answers.js loads, leaves the groups showing', () => {
    const first = render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    first.unmount();                                                // the mode is kept for the next visit
    const second = render(<AnswersHome {...base} entries={null} />);
    expect(document.querySelector('.ans-browse-head .ans-h2').textContent).toBe('Browse');
    expect(document.getElementById('ans-panel-az')).toBeNull();
    second.unmount();
    render(<AnswersHome {...base} />);
    expect(document.getElementById('ans-panel-az')).toBeTruthy();
  });
});

describe('AnswersShelf — a group of the site (f04, f04b)', () => {
  it('a numbered group: the site\'s label, our short name and the note, its topics in the site\'s order', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersShelf {...base} groupKey="5" onOpenTopic={onOpenTopic} />);
    expect(document.querySelector('.ans-hero .ans-label').textContent).toBe('5. Thus Says The Lord...');
    expect(document.querySelector('h1').textContent).toBe('Scripture & doctrine');
    expect(document.body.textContent).not.toContain('short names are ours');   // 0125 C: said once, in About
    expect(NB(document.querySelector('.ans-results-sum .ans-count').textContent)).toBe('9 topics · 3 read');
    const titles = texts('.ans-row .ans-row-title');
    expect(titles[0]).toBe('Regarding the Mistranslation and Misinterpretation of the Scriptures');
    expect(titles[4]).toBe('Regarding The Trinity');
    expect(NB([...document.querySelectorAll('.ans-row .ans-row-sub')][4].textContent)).toBe('6 links');
    fireEvent.click(screen.getByText('Read all 9 in order'));
    expect(onOpenTopic).toHaveBeenCalledWith('regarding-adding-to-or-taking-away-from-the-word-of-god', null, 'Scripture & doctrine');
    expect(navProps.backLabel).toBe('Answers');
  });

  it('Other Topics: no eyebrow, its 16 topics, the page outside the menu last', () => {
    render(<AnswersShelf {...base} groupKey="other" />);
    expect(document.querySelector('.ans-hero .ans-label')).toBeNull();
    expect(document.querySelector('h1').textContent).toBe('The Lord and His Word');
    const rows = document.querySelectorAll('.ans-row');
    expect(rows.length).toBe(16);
    expect(rows[15].textContent).toContain('Not in the site’s menu');
  });
});

describe('AnswersMedia — Charts & videos (f13)', () => {
  it('says Loading… while the sidecars load, says so if they never arrive (no blank page), and Try again loads them', async () => {
    vi.useFakeTimers();
    try {
      const meta = window.ANSWERS_META;
      window.ANSWERS_META = undefined;                               // no loader in this host: the load resolves empty
      render(<AnswersMedia {...base} />);
      const status = () => document.querySelector('.ans-page [role="status"]');
      expect(status().textContent).toBe('Loading…');
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });   // the hook's two tries, 3 s apart
      expect(status().textContent).toBe('Couldn’t load the list of charts and videos. Try again');
      window.ANSWERS_META = meta;
      await act(async () => { fireEvent.click(status().querySelector('button')); await vi.advanceTimersByTimeAsync(0); });
      expect(status()).toBeNull();
      expect(texts('.ans-sechead .ans-h2')[0]).toBe('Charts');
    } finally { vi.useRealTimers(); }
  });
  it('lists every chart, video, playlist, channel, audio and PDF; only charts stay in the app', () => {
    render(<AnswersMedia {...base} />);
    // WA2 (a-media): three eyebrow heads; three videos, then "All 4 videos"; playlists and audio open in place
    expect(texts('.ans-sechead .ans-h2')).toEqual(['Charts', 'Videos', 'Playlists, audio and PDFs']);
    expect(texts('.ans-sechead .ans-count').map(NB)).toEqual(['Open here · pinch to zoom', 'Open in your browser']);
    expect(document.querySelectorAll('.ans-thumb').length).toBe(2);
    expect(document.querySelectorAll('a.ans-media').length).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: /^All 4.videos/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Playlists/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Audio & PDF/ }));
    expect(texts('.ans-media-page .ans-box > .ans-row .ans-row-sub').map(NB)).toEqual(['11 playlists · 2 channels', '7 items · By topic']);
    const links = [...document.querySelectorAll('a.ans-media')];
    expect(links.length).toBe(4 + 13 + 7);
    for (const a of links) { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('href')).toMatch(/^https?:\/\//); }
    expect(document.querySelector('iframe')).toBeNull();
    expect(links[4].querySelector('.ans-row-title').textContent).toBe('OFFICIAL YOUTUBE CHANNEL');
    expect(links[5].querySelector('.ans-row-title').textContent).toBe('The Lord Speaks About The Sabbath (Video-Playlist)');
    fireEvent.click(document.querySelector('.ans-thumb'));
    const viewer = screen.getByRole('dialog');
    expect(viewer.querySelector('img').getAttribute('src')).toBe('answers-chart-chronology.jpg');
    expect(viewer.textContent).toContain('Pinch, double-tap or scroll to zoom');
    // keys and the wheel zoom too (idea audit 10-23, s28.5)
    const stage = viewer.querySelector('.ans-zoom');
    const img = viewer.querySelector('img');
    expect(stage.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(stage, { key: '+' });
    expect(img.style.transform).toContain('scale(1.25)');
    fireEvent.keyDown(stage, { key: '0' });
    expect(img.style.transform).toBe('');
    fireEvent.wheel(stage, { deltaY: -400, clientX: 0, clientY: 0 });
    expect(img.style.transform).toMatch(/scale\(2\.71/);
  });
});
