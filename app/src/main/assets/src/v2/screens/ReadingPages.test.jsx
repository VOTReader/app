/* v2 Settings > Reading and Bible translation (mw7, v2-gaps 14): the gate pictures 7d-reading and 7e-translation (words as
   drawn, from main's own TRANSLATION_OPTIONS in index.html), and real boots over fakes: a switch or a pick writes main's
   key, Auto-scroll's rows appear only while it is on, Clear asks first and empties main's HistoryStore, a translation
   picked goes Back and the shell reads it at once. A gate boot writes nothing. */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
// @ts-ignore: node's own module (vitest runs in node; the project has no @types/node), to read index.html as text
import { readFileSync } from 'node:fs';
import { V2App } from '../App.jsx';
import { ReadingPage, TranslationPage } from './ReadingPages.jsx';
import { translationRow } from '../reading-settings.js';
import { subscribeSettings, settingsVersion, writeSetting } from '../settings-pages.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const rowByTitle = (root, t) => [...root.querySelectorAll('.srow')].find((r) => r.querySelector('.t') && r.querySelector('.t').textContent === t);
const buttonByText = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
const Reading = /** @type {any} */ (ReadingPage);
const Translation = /** @type {any} */ (TranslationPage);

/** main's registry, read from index.html as the page defines it (so a change there shows up here). */
let OPTIONS;
beforeAll(() => {
  const src = readFileSync('app/src/main/assets/index.html', 'utf8');   // vitest runs from the repo root
  const m = src.match(/const TRANSLATION_OPTIONS = (\[[\s\S]*?\]);/);
  OPTIONS = new Function('return ' + m[1])();
});

afterEach(() => {
  cleanup();
  for (const k of ['StateStore', 'HistoryStore', 'TRANSLATION_OPTIONS', 'PlatformBridge', 'BOOKS', 'translateVerse', 'loadTranslation']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

/** A ready StateStore holding `settings`; set() keeps what it was given. */
function fakeStore(settings = {}) {
  const store = { st: { settings }, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  return store;
}
const bare = (Page, props = {}) => render(<Page gate={null} desktop={false} device="phone" onReady={() => {}} go={vi.fn()} pop={vi.fn()} {...props} />);

describe('gate pictures', () => {
  it('7d-reading: five groups as drawn, main\'s defaults (Auto-scroll and Highlight off), 42 places; Back says Settings', async () => {
    g.TRANSLATION_OPTIONS = OPTIONS;
    g.HistoryStore = { isReady: () => true, list: () => [], clear: vi.fn() };
    const { container } = render(<V2App gateId="7d-reading" />);
    expect(container.querySelector('h1.display').textContent).toBe('Reading');
    expect(texts(container, '.settings .label')).toEqual(['The Bible', 'On the page', 'Your reading record', 'Copy and share', 'Search']);
    expect(texts(container, '.settings .srow .t')).toEqual([
      'Bible translation', 'Chapter titles', 'Section headings', 'Restored Names', 'Reference echoes',
      'Double-tap for full screen', 'Keep the screen on', 'Auto-scroll',
      'Mark as read', 'Keep a reading history', 'Clear reading history',
      'Share includes', 'Highlight the passage', 'Similar words', 'Skip filler words',
    ]);
    expect(rowByTitle(container, 'Bible translation').querySelector('.s').textContent).toBe('NKJV · New King James Version');
    expect(rowByTitle(container, 'Clear reading history').querySelector('.s').textContent).toBe('42 places');
    // its words are blocks (a div row: the shell's block rule is for button rows), so "42 places" sits under the title
    expect(rowByTitle(container, 'Clear reading history').querySelector('.s').tagName).toBe('DIV');
    expect(rowByTitle(container, 'Share includes').querySelector('.s').textContent).toBe('The app link · opens in VOTReader, even offline');
    expect(texts(container, '[role="switch"][aria-checked="false"] .t')).toEqual(['Auto-scroll', 'Highlight the passage']);
    expect(container.querySelector('.tb .title').textContent).toBe('Settings');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Home');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    // inert: nothing is written or cleared from a gate boot
    await click(buttonByText(container, 'Clear'));
    expect(container.querySelector('.cfs')).toBe(null);
    expect(g.HistoryStore.clear).not.toHaveBeenCalled();
  });

  it('7e-translation: main\'s eleven as design splits them, English then Español, NKJV checked, the AI note; Back says Reading', async () => {
    g.TRANSLATION_OPTIONS = OPTIONS;
    const { container } = render(<V2App gateId="7e-translation" />);
    expect(container.querySelector('h1.display').textContent).toBe('Bible translation');
    expect(texts(container, '.trn .label')).toEqual(['English', 'Español']);
    expect(texts(container, '.opts.trn .srow .t')).toEqual([
      'New King James VersionNKJV', 'NKJV Restored NameNKJV-R', 'World English BibleWEB', 'Berean Standard BibleBSB',
      'Hebrew Names VersionHNV', 'King James Version 1769KJV', 'KJV Restored NameKJV-R', 'American Standard Version 1901ASV',
      'Literal Standard VersionLSV', 'Young’s Literal Translation 1898YLT', 'Reina-Valera 1960RVR1960',
    ].map((s) => s.replace('’', "'")));
    expect(texts(container, '.opts.trn .srow .s').slice(0, 4)).toEqual([
      'The default', 'His true Name restored in the New Testament: YahuShua HaMashiach',
      'Modern, public domain · ~2% shorter than NKJV', 'Modern literal · ~6% shorter than NKJV',
    ]);
    expect(texts(container, '.opts.trn .srow .s')[10]).toBe('The Spanish Bible most Spanish-speaking churches read · book names, headings and menus stay in English');
    expect(texts(container, '.srow.on .t')).toEqual(['New King James VersionNKJV']);
    expect(container.querySelector('.fine.trf').textContent).toBe('The Restored Name editions were prepared with AI assistance (Claude Fable 5, 2026).');
    expect(container.querySelector('.tb .title').textContent).toBe('Reading');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });
});

describe('translation rows', () => {
  it('split main\'s desc at its dash; the language note leaves the name; a desc with no dash keeps its words as the name', () => {
    expect(translationRow({ id: 'rvr', label: 'RVR1960', lang: 'es', desc: 'Reina-Valera 1960 (Español) — the Spanish Bible' }))
      .toEqual({ id: 'rvr', name: 'Reina-Valera 1960', code: 'RVR1960', s: 'The Spanish Bible', lang: 'es' });
    expect(translationRow({ id: 'x', label: 'X', desc: 'Some Version' })).toEqual({ id: 'x', name: 'Some Version', code: 'X', s: '', lang: 'en' });
  });
});

describe('Reading on a real boot', () => {
  it('a switch writes main\'s key with its touched mark, and the shell hears of it', async () => {
    g.StateStore = fakeStore({ theme: 'dark' });
    const heard = vi.fn();
    const off = subscribeSettings(heard);
    const v0 = settingsVersion();
    const { container } = bare(Reading);
    await click(rowByTitle(container, 'Section headings'));
    off();
    expect(g.StateStore.st.settings).toMatchObject({ showSectionHeadings: false, touched: { showSectionHeadings: true } });
    expect(rowByTitle(container, 'Section headings').getAttribute('aria-checked')).toBe('false');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(settingsVersion()).toBe(v0 + 1);
  });

  it('Auto-scroll\'s speed, Auto-continue and pause rows show only while it is on; a pick writes main\'s string value', async () => {
    g.StateStore = fakeStore({});
    const { container } = bare(Reading, { desktop: false });
    expect(rowByTitle(container, 'Scroll speed')).toBe(undefined);
    await click(rowByTitle(container, 'Auto-scroll'));
    expect(rowByTitle(container, 'Scroll speed').querySelector('.s').textContent).toBe('16 lines/min');
    expect(rowByTitle(container, 'Pause before the next page').querySelector('.s').textContent).toBe('2.5 s');
    await click(rowByTitle(container, 'Scroll speed'));
    await click(rowByTitle(document.body, '24 lines/min'));
    expect(g.StateStore.st.settings.autoScrollLpm).toBe('24');
    expect(rowByTitle(container, 'Scroll speed').querySelector('.s').textContent).toBe('24 lines/min');
    await click(rowByTitle(container, 'Auto-continue'));
    expect(g.StateStore.st.settings.autoScrollNext).toBe(false);
    expect(rowByTitle(container, 'Pause before the next page')).toBe(undefined);
  });

  it('Share includes picks main\'s shareLink; the row says which', async () => {
    g.StateStore = fakeStore({});
    const { container } = bare(Reading);
    await click(rowByTitle(container, 'Share includes'));
    await click(rowByTitle(document.body, 'The website link'));
    expect(g.StateStore.st.settings.shareLink).toBe('site');
    expect(rowByTitle(container, 'Share includes').querySelector('.s').textContent).toBe('The website link · opens the letter on thevolumesoftruth.com');
  });

  it('Clear asks in main\'s strip; Cancel keeps the history, Yes, clear empties main\'s HistoryStore', async () => {
    let list = [{ ts: 1 }, { ts: 2 }];
    g.StateStore = fakeStore({});
    g.HistoryStore = { isReady: () => true, list: () => list, clear: vi.fn(() => { list = []; }) };
    const { container } = bare(Reading);
    expect(rowByTitle(container, 'Clear reading history').querySelector('.s').textContent).toBe('2 places');
    await click(buttonByText(container, 'Clear'));
    expect(container.querySelector('.cfs .fine').textContent).toBe('Clear all reading history?');
    await click(buttonByText(container, 'Cancel'));
    expect(container.querySelector('.cfs')).toBe(null);
    expect(g.HistoryStore.clear).not.toHaveBeenCalled();
    await click(buttonByText(container, 'Clear'));
    await click(buttonByText(container, 'Yes, clear'));
    expect(g.HistoryStore.clear).toHaveBeenCalledTimes(1);
    expect(rowByTitle(container, 'Clear reading history').querySelector('.s').textContent).toBe('Nothing yet');
    expect(buttonByText(container, 'Clear').hasAttribute('disabled')).toBe(true);
  });

  it('Bible translation: a pick saves main\'s translation and goes Back; the one already chosen just goes Back', async () => {
    g.TRANSLATION_OPTIONS = OPTIONS;
    g.StateStore = fakeStore({});
    const pop = vi.fn();
    const { container } = bare(Translation, { pop, facts: { translation: 'nkjv' } });
    await click(rowByTitle(container, 'New King James VersionNKJV'));
    expect(g.StateStore.set).not.toHaveBeenCalled();
    expect(pop).toHaveBeenCalledTimes(1);
    await click(rowByTitle(container, 'King James Version 1769KJV'));
    expect(g.StateStore.st.settings).toMatchObject({ translation: 'kjv', touched: { translation: true } });
    expect(pop).toHaveBeenCalledTimes(2);
  });

  it('the whole path: Settings > Reading > Bible translation > KJV comes Back to Reading and Settings saying KJV', async () => {
    g.TRANSLATION_OPTIONS = OPTIONS;
    g.StateStore = fakeStore({});
    g.HistoryStore = { isReady: () => true, list: () => [] };
    const { container } = render(<V2App gateId={null} />);
    await click(container.querySelector('[aria-label="Settings"]'));
    expect(rowByTitle(container, 'Reading').querySelector('.s').textContent).toMatch(/^NKJV/);
    await click(rowByTitle(container, 'Reading'));
    await click(rowByTitle(container, 'Bible translation'));
    expect(container.querySelector('h1').textContent).toBe('Bible translation');
    await click(rowByTitle(container, 'King James Version 1769KJV'));
    expect(container.querySelector('h1').textContent).toBe('Reading');
    expect(rowByTitle(container, 'Bible translation').querySelector('.s').textContent).toBe('KJV · King James Version 1769');
    await click(container.querySelector('.tb button'));
    expect(rowByTitle(container, 'Reading').querySelector('.s').textContent).toMatch(/^KJV/);
  });
});

describe('Keep the screen on (main\'s use-settings effect)', () => {
  it('a real boot tells the bridge the saved choice, and again when Reading changes it', async () => {
    g.StateStore = fakeStore({});
    g.HistoryStore = { isReady: () => true, list: () => [] };
    g.PlatformBridge = { setKeepScreenOn: vi.fn() };
    render(<V2App gateId={null} />);
    expect(g.PlatformBridge.setKeepScreenOn).toHaveBeenLastCalledWith(true);
    await act(async () => { writeSetting('keepScreenOn', false); });
    expect(g.PlatformBridge.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it('a gate boot never calls it', () => {
    g.PlatformBridge = { setKeepScreenOn: vi.fn() };
    render(<V2App gateId="7d-reading" />);
    expect(g.PlatformBridge.setKeepScreenOn).not.toHaveBeenCalled();
  });
});
