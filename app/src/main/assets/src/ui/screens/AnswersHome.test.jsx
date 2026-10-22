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
import { AnswersHome, resetAnswersLanding } from './AnswersHome.jsx';
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
  window.LibraryNav = (p) => { navProps = p; return <button type="button" data-testid="nav-back" onClick={p.onBack}>{p.backLabel}</button>; };
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

describe('AnswersHome — the landing (f01, f02)', () => {
  it('lists the site\'s contents in its sidebar order, with nothing of the retired subjects', () => {
    render(<AnswersHome {...base} />);
    const panel = document.querySelector('.ans-landing-b');
    expect(texts('.ans-sechead .ans-h2', panel)).toEqual(['The Ten Commandments', 'Other Topics', 'Thus Says The Lord...', 'Index of False Doctrines Within the Churches of Men']);
    expect(texts('.ans-sechead .ans-count', panel).map(NB)).toEqual(['19 topics', '16 topics', '85 topics']);
    expect(texts('.ans-tablet .ans-num')).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    expect(panel.querySelector('.ans-row .ans-row-title').textContent).toBe('Main Page');
    const groups = [...panel.querySelectorAll('.ans-row')].filter((r) => r.querySelector('.ans-num'));
    expect(groups.map((r) => r.querySelector('.ans-row-title').textContent)).toEqual(['Signs of this generation', 'Prophets, witnesses & gifts',
      'The nations', 'The churches', 'Scripture & doctrine', 'Holy Days, cross & resurrection', 'Forgiveness to salvation', 'The end & the Kingdom',
      'Warfare, sin, death & judgment', 'The walk of faith', 'Body, marriage & family', 'People of the Bible & creation']);
    expect(groups[4].getAttribute('aria-label')).toBe('5. Thus Says The Lord... Scripture & doctrine. 9 topics, 3 read');
    expect(screen.getByText('The site numbers these groups; the short names are ours.')).toBeTruthy();
    expect(screen.getByText('Not in the site’s menu').closest('.ans-row').textContent).toContain('Come Out and Fight Against Me');
    expect(document.body.textContent).not.toMatch(/Most spoken of|Browse by subject|Every Topic, A–Z|The End of This Age/);
  });

  it('subs come from the shared words: size, minutes, media, "✓ Read" in words', () => {
    render(<AnswersHome {...base} />);
    const row = (t) => [...document.querySelectorAll('.ans-row')].find((r) => r.querySelector('.ans-row-title').textContent === t);
    expect(NB(row('Main Page').querySelector('.ans-row-sub').textContent)).toBe('12 passages · ~12 min · video · downloads');
    expect(NB(row('The Volumes of Truth').querySelector('.ans-row-sub').textContent)).toBe('39 passages · ~38 min · video · audio · Read');
    expect(NB(row('False Doctrines Within the Churches (Index)').querySelector('.ans-row-sub').textContent)).toBe('46 categories, each answered by The Truth');
    expect(NB(row('Charts & videos').querySelector('.ans-row-sub').textContent)).toBe('2 charts, 4 videos, 11 playlists and more');
    expect(document.body.textContent).not.toMatch(/\b0 passages/);
  });

  it('the reading path: Continue in the site\'s order, the start, or nothing read when it is off', () => {
    const first = render(<AnswersHome {...base} />);
    const path = () => document.querySelector('.ans-path .ans-row');
    expect(path().querySelector('.ans-row-title').textContent).toBe('Continue: Regarding Faith');
    expect(NB(path().querySelector('.ans-row-sub').textContent)).toBe('95 of 120 topics · in the site’s order');
    first.unmount();
    const second = render(<AnswersHome {...base} isRead={() => false} pathLast={null} />);
    expect(path().querySelector('.ans-row-title').textContent).toBe('Start at the beginning');
    expect(NB(path().querySelector('.ans-row-sub').textContent)).toBe('Main Page · 12 passages · ~12 min');
    second.unmount();
    render(<AnswersHome {...base} pathOn={false} />);
    expect(path().querySelector('.ans-row-title').textContent).toBe('Start at the beginning');
    expect(document.querySelector('.ans-read')).toBeNull();
  });

  it('the Answer of the day is one whole excerpt by the date, and Read in context opens it', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} now={new Date(2026, 4, 17, 12)} />);
    const daily = document.querySelector('.ans-daily');
    expect(daily.querySelector('.ans-metarow').textContent).toContain('7/5/10 From The Lord, Our God and Savior');
    expect(daily.querySelector('.ans-quote').textContent).toMatch(/^"For I am a Great King!.*God Eternal!"$/);
    expect(daily.querySelector('.ans-src-t').getAttribute('data-w')).toBe('Excerpt from');
    expect(daily.querySelector('.ans-src-t').textContent).toBe('“The Alarm of War”');
    fireEvent.click(within(daily).getByText('Read in context'));
    expect(onOpenTopic.mock.calls[0][0]).toBe('there-is-no-other');
    expect(onOpenTopic.mock.calls[0][1]).toMatch(/^"For I am a Great King!/);
  });

  it('while answers.js loads, the head, title, tagline, chips and tablets paint; the path and the day wait', () => {
    window.ANSWERS_META = undefined;
    render(<AnswersHome {...base} entries={null} site={null} />);
    expect(document.querySelector('h1').textContent).toBe('Answers Only God Can Give');
    expect(document.querySelector('.ans-lede').textContent).toBe(SITE.tagline);
    expect(document.querySelectorAll('.ans-chip').length).toBe(6);
    expect(document.querySelectorAll('.ans-tablet').length).toBe(10);
    expect(document.querySelector('.ans-path')).toBeNull();
    expect(document.querySelector('.ans-daily')).toBeNull();
  });

  it('a chip, a group and Charts & videos open where they say', () => {
    const onOpenTopic = vi.fn(); const onOpenGroup = vi.fn(); const onOpenMedia = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} onOpenGroup={onOpenGroup} onOpenMedia={onOpenMedia} />);
    fireEvent.click(screen.getByText('…the Trinity?'));
    expect(onOpenTopic).toHaveBeenCalledWith('regarding-the-trinity', null, 'Answers');
    fireEvent.click(screen.getByText('Scripture & doctrine').closest('button'));
    expect(onOpenGroup).toHaveBeenCalledWith('5');
    fireEvent.click(screen.getByText('Charts & videos').closest('button'));
    expect(onOpenMedia).toHaveBeenCalled();
    expect(layoutClass).toContain('ans-wide');
  });
});

describe('AnswersHome — the sheets (f03, f01b, f12)', () => {
  it('a tablet opens its commandment: the site\'s heading, the verse, its topics in the site\'s order', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    fireEvent.click(screen.getByRole('button', { name: /^2\. You Shall Not Commit Idolatry\. 3 topics$/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.ans-label').textContent).toBe('The Second Commandment');
    expect(dialog.querySelector('.ans-h2').textContent).toBe('2. You Shall Not Commit Idolatry.');
    expect(dialog.querySelector('.ans-verse').textContent).toMatch(/^You shall not make for yourself a carved image—.*earth;$/);
    expect(texts('.ans-row-title', dialog)).toEqual(['God Speaks About Idolatry', 'God Speaks About Materialism', 'Regarding Another Messiah']);
    fireEvent.click(within(dialog).getByText('Idolatry').closest('button'));
    expect(onOpenTopic).toHaveBeenCalledWith('god-speaks-about-idolatry', null, 'Answers');
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

  it('a copy of the commandment ends with its reference, once, in the translation shown', () => {
    render(<AnswersHome {...base} onGoToRef={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /^6\. You Shall Not Murder\./ }));
    const words = document.createRange();
    words.selectNodeContents(screen.getByRole('dialog').querySelector('.ans-verse'));
    expect(passageCopy(words).text).toBe('"You shall not murder."\n\nExodus 20:13 (NKJV)');
  });

  it('the open sheet survives a round trip to a topic (U5)', () => {
    const first = render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByText('More questions'));
    expect(screen.getByRole('dialog').querySelectorAll('.ans-row').length).toBe(12);
    first.unmount();
    render(<AnswersHome {...base} />);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Start with a question');
  });

  it('About shows the site\'s page, its nine Sister Sites word for word, and which words are ours', () => {
    render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByLabelText('About this collection'));
    const d = screen.getByRole('dialog');
    expect(d.querySelector('.ans-h2').textContent).toBe('About Answers Only God Can Give');
    const sister = [...d.querySelectorAll('h3')].find((h) => h.textContent === 'Sister Sites');
    const rows = [];
    for (let n = sister.nextElementSibling; n && n.tagName === 'A'; n = n.nextElementSibling) rows.push(n.querySelector('.ans-row-title').textContent);
    expect(rows).toEqual(SITE.sisterSites.map((s) => s.label));
    expect(d.textContent).toContain('Copyright © 2004-2024 ~ All Rights Reserved.');
    expect(d.textContent).toContain('2026-10-19');
    expect(d.textContent).toContain('The words, headings and order are the site’s.');
    for (const a of d.querySelectorAll('a[href^="http"]')) expect(a.getAttribute('target')).toBe('_blank');
  });
});

describe('AnswersHome — search (f06)', () => {
  it('groups by topic, title matches first then the site\'s order; the header is the sum', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    fireEvent.change(field(), { target: { value: 'sabbath' } });
    expect(NB(document.querySelector('.ans-results-sum .ans-meta').textContent)).toBe('In Answers · 73 matches in 22 topics');
    const subs = texts('.ans-results .ans-row .ans-row-sub').map(NB);
    expect(subs[0]).toBe('18 of 19 passages · The Fourth Commandment');
    expect(subs[1]).toBe('1 of 18 passages · The Second Commandment');
    expect(subs.length).toBe(8);
    expect(document.querySelector('.ans-hit mark').textContent).toBe('Sabbath');
    expect(NB(document.querySelector('.ans-hit-src').textContent)).toBe('“You Shall Not Desecrate the Sabbath” · Volume 3 · 3/29/06');
    // the browse column steps aside (CSS: .ans-landing.is-query; on a desktop it stays beside the results)
    expect(document.querySelector('.ans-landing').classList.contains('is-query')).toBe(true);
    expect(document.querySelector('.ans-landing-a .ans-chips')).toBeNull();
    fireEvent.click(screen.getByText('Show 14 more topics'));
    expect(document.querySelectorAll('.ans-results .ans-row').length).toBe(22);
    fireEvent.click(document.querySelector('.ans-hit'));
    const [id, anchor, from] = onOpenTopic.mock.calls[0];
    expect(id).toBe('god-speaks-about-the-sabbath');
    expect(anchor.toLowerCase()).toContain('sabbath');
    expect(from).toBe('Answers');
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

describe('AnswersHome — A–Z (f05)', () => {
  it('files all 121 topics under their letters, with a 27-key strip and the empty letters off', () => {
    render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByRole('tab', { name: 'A–Z' }));
    const panel = document.getElementById('ans-panel-az');
    expect(panel.querySelectorAll('.ans-row').length).toBe(121);
    const letters = texts('.ans-az-letter', panel);
    expect(letters[0]).toBe('#');
    expect(letters.slice(1)).toEqual([...letters.slice(1)].sort());
    const keys = [...panel.querySelectorAll('.ans-az-key')];
    expect(keys.length).toBe(27);
    expect(keys.filter((k) => k.disabled).map((k) => k.textContent)).toEqual(['Q', 'X', 'Y', 'Z']);
    expect(NB(panel.querySelector('.ans-row .ans-row-sub').textContent)).toBe('2 · Prophets, witnesses & gifts · 22 passages');
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
      fireEvent.click(screen.getByRole('tab', { name: 'A–Z' }));
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

  it('a saved A–Z tab, while answers.js loads, leaves Contents the selected tab', () => {
    const first = render(<AnswersHome {...base} />);
    fireEvent.click(screen.getByRole('tab', { name: 'A–Z' }));
    first.unmount();                                                // the tab is kept for the next visit
    render(<AnswersHome {...base} entries={null} />);
    expect(screen.getByRole('tab', { name: 'Contents' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'A–Z' }).getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('ans-panel-c')).toBeTruthy();
  });
});

describe('AnswersShelf — a group of the site (f04, f04b)', () => {
  it('a numbered group: the site\'s label, our short name and the note, its topics in the site\'s order', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersShelf {...base} groupKey="5" onOpenTopic={onOpenTopic} />);
    expect(document.querySelector('.ans-hero .ans-label').textContent).toBe('5. Thus Says The Lord...');
    expect(document.querySelector('h1').textContent).toBe('Scripture & doctrine');
    expect(screen.getByText('The site numbers these groups; the short names are ours.')).toBeTruthy();
    expect(NB(document.querySelector('.ans-results-sum .ans-count').textContent)).toBe('9 topics · 3 read');
    const titles = texts('.ans-row .ans-row-title');
    expect(titles[0]).toBe('Regarding the Mistranslation and Misinterpretation of the Scriptures');
    expect(titles[4]).toBe('Regarding The Trinity');
    expect(NB([...document.querySelectorAll('.ans-row .ans-row-sub')][4].textContent)).toBe('See: 6 links');
    fireEvent.click(screen.getByText('Read all 9 in order'));
    expect(onOpenTopic).toHaveBeenCalledWith('regarding-adding-to-or-taking-away-from-the-word-of-god', null, 'Scripture & doctrine');
    expect(navProps.backLabel).toBe('Answers');
  });

  it('Other Topics: no eyebrow, its 16 topics, the page outside the menu last', () => {
    render(<AnswersShelf {...base} groupKey="other" />);
    expect(document.querySelector('.ans-hero .ans-label')).toBeNull();
    expect(document.querySelector('h1').textContent).toBe('Other Topics');
    const rows = document.querySelectorAll('.ans-row');
    expect(rows.length).toBe(16);
    expect(rows[15].textContent).toContain('Not in the site’s menu');
  });
});

describe('AnswersMedia — Charts & videos (f13)', () => {
  it('says Loading… while the sidecars load, and says so if they never arrive (no blank page)', async () => {
    window.ANSWERS_META = undefined;                                 // no loader in this host: the load resolves empty
    render(<AnswersMedia {...base} />);
    expect(document.querySelector('.ans-page [role="status"]').textContent).toBe('Loading…');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(document.querySelector('.ans-page [role="status"]').textContent).toBe('Couldn’t load the list of charts and videos.');
  });
  it('lists every chart, video, playlist, channel, audio and PDF; only charts stay in the app', () => {
    render(<AnswersMedia {...base} />);
    expect(texts('.ans-sechead .ans-h2')).toEqual(['Charts', 'Videos', 'Playlists', 'Audio & PDF']);
    expect(texts('.ans-sechead .ans-count').map(NB)).toEqual(['2 charts', '4 videos', '11 playlists · 2 channels', '7 items']);
    expect(document.querySelectorAll('.ans-thumb').length).toBe(2);
    const links = [...document.querySelectorAll('a.ans-media')];
    expect(links.length).toBe(4 + 13 + 7);
    for (const a of links) { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('href')).toMatch(/^https?:\/\//); }
    expect(document.querySelector('iframe')).toBeNull();
    expect(links[4].querySelector('.ans-row-title').textContent).toBe('OFFICIAL YOUTUBE CHANNEL');
    expect(links[5].querySelector('.ans-row-title').textContent).toBe('The Lord Speaks About The Sabbath (Video-Playlist)');
    fireEvent.click(document.querySelector('.ans-thumb'));
    const viewer = screen.getByRole('dialog');
    expect(viewer.querySelector('img').getAttribute('src')).toBe('answers-chart-chronology.jpg');
    expect(viewer.textContent).toContain('Pinch or double-tap to zoom');
  });
});
