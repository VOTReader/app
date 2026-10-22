/* A reading page's ... (mw7, v2-gaps 13; design dz15 1h on a letter or entry, 5g on a Bible chapter; main's MoreMenu):
   each row only where it applies, what each row does, the phone sheet and the laptop menu, and the two gate rows.
   Fixtures: wtlb-one.js entry 76 and a Volume One letter as the corpus keeps them; John 3 as main's Bible keeps it. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { placeFor } from './places.js';
import { GATE_STATES } from './gate.js';
import { siteName } from './more-menu.jsx';
import './screens/LetterScreen.jsx';
import './screens/BibleChapterScreen.jsx';
import './screens/CollectionScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);

const WTLB = { volKey: 'wtlb1', readKey: 'wtlb-one', globalName: 'WTLB_ONE', prefaceGlobal: null, label: 'Words To Live By: Part One', kind: 'wtlb', indexScreen: 'wtlb-one-index' };
const ONE = { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' };
const ELECT = { id: 'elect-and-precious', num: 76, title: 'Elect and Precious', paragraphs: [{ align: 'center', text:
  'You are more than the filth that covers you,\n\nMore than the sin that fills you.' }] };
const v = (n, text) => ({ n, text });
const JOHN = { id: 'john', title: 'John', chapters: [
  { num: 3, sections: [{ heading: 'Nicodemus and the New Birth', verses: [v(1, 'There was a man of the Pharisees named Nicodemus.')] }] },
] };
const ELECT_LINK = 'https://www.thevolumesoftruth.com/index.php?title=Words_To_Live_By:_Part_One#Elect_and_Precious';

function installCorpus() {
  g.COLLECTIONS = [WTLB, ONE];
  g.COL_BY_KEY = new Map([['wtlb1', WTLB], ['one', ONE]]);
  g.WTLB_ONE = Array.from({ length: 149 }, (_x, i) => (i === 75 ? ELECT
    : { id: 'w' + (i + 1), num: i + 1, title: 'Entry ' + (i + 1), paragraphs: [{ align: 'left', text: 'x' }] }));
  g.LETTERS_V1 = [{ id: 'the-wide-path', num: 1, title: 'The Wide Path', blocks: [{ type: 'p', text: 'Hear Me.' }] }];
  // main's lookup behind its pageSiteLink (data/scripture-resolution.js)
  g.findEntryContext = (/** @type {string} */ id) => ({
    'elect-and-precious': { title: 'Elect and Precious', collection: 'Words To Live By: Part One', screen: 'wtlb-one-entry' },
  })[id] || null;
}

/** A place's top bar on a live page (no gate), as the shell draws it. */
function Bar({ place, route, open = vi.fn(), go = vi.fn(), desktop = false, facts = {} }) {
  const def = placeFor(place);
  return <div className="tb">{def && def.actions ? def.actions({ route, go, desktop, device: desktop ? 'computer' : 'phone', open, gate: null, facts }) : null}</div>;
}
const more = (root) => /** @type {HTMLElement} */ (root.querySelector('button[aria-label="More"]'));
const rowNamed = (root, t) => [...root.querySelectorAll('.srow.act')].find((r) => r.querySelector('.t').textContent === t);
const ENTRY_76 = { place: 'letter', collection: 'wtlb1', n: 76 };

afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'WTLB_ONE', 'LETTERS_V1', 'findEntryContext', 'SongCatalog', 'AudioPlayer',
    'StateStore', 'BOOKS', 'matchMedia', 'TRANSLATION_OPTIONS']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

describe('the rows (each only where it applies)', () => {
  it('a letter: Find in this letter, Auto-scroll, See this letter’s scriptures (mw13); no song and no page on the site', async () => {
    installCorpus();
    const { container } = render(<Bar place="letter" route={{ place: 'letter', collection: 'one', n: 1 }} />);
    await settle();
    await click(more(container));
    expect(container.querySelector('.sheet.mor .sh').textContent).toBe('The Wide Path');
    expect(texts(container, '.sheet.mor .srow .t')).toEqual(['Find in this letter', 'Auto-scroll', 'See this letter’s scriptures']);
    expect(more(container).getAttribute('aria-expanded')).toBe('true');
  });

  it("an entry the site has: Copy website link under the site's name", async () => {
    installCorpus();
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    await click(more(container));
    expect(texts(container, '.sheet.mor .srow .t')).toEqual(['Find in this entry', 'Auto-scroll', 'Copy website link', 'See this letter’s scriptures']);
    expect(rowNamed(container, 'Copy website link').querySelector('.s').textContent).toBe('thevolumesoftruth.com');
    expect(siteName(ELECT_LINK)).toBe('thevolumesoftruth.com');
  });

  it("Auto-scroll says the reader's own speed (main's autoScrollLpm), 16 by default", async () => {
    installCorpus();
    g.StateStore = { isReady: () => true, get: () => ({ settings: { autoScrollLpm: '24' } }) };
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    await click(more(container));
    expect(rowNamed(container, 'Auto-scroll').querySelector('.s').textContent).toBe('Scrolls the page for you · 24 lines/min');
  });

  it('a Bible chapter: Find in this chapter, Auto-scroll, Bible translation (its edition, a chevron); never a website link', async () => {
    const { container } = render(<Bar place="bible-chapter" route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{ translation: 'nkjv' }} />);
    await click(more(container));
    expect(container.querySelector('.sheet.mor .sh').textContent).toBe('John 3');
    expect(texts(container, '.sheet.mor .srow .t')).toEqual(['Find in this chapter', 'Auto-scroll', 'Bible translation', 'Show in Scripture Web']);
    const tr = rowNamed(container, 'Bible translation');
    expect(tr.querySelector('.s').textContent).toBe('NKJV · New King James Version');
    expect(tr.querySelector('.chev')).toBeTruthy();
  });

  it("Show in Scripture Web opens the web at this chapter, and See this letter's scriptures at the letter's citations (mw13)", async () => {
    const go = vi.fn();
    const r = render(<Bar place="bible-chapter" route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} go={go} />);
    await click(more(r.container));
    await click(rowNamed(r.container, 'Show in Scripture Web'));
    expect(go).toHaveBeenCalledWith({ place: 'scripture-web', start: { book: 'john', chapter: 3 } });
    cleanup();
    installCorpus();
    const go2 = vi.fn();
    const l = render(<Bar place="letter" route={{ place: 'letter', collection: 'one', n: 1 }} go={go2} />);
    await settle();
    await click(more(l.container));
    await click(rowNamed(l.container, 'See this letter’s scriptures'));
    expect(go2).toHaveBeenCalledWith({ place: 'scripture-web', start: { letterKey: expect.stringMatching(/^one\//) } });
  });

  it("names the reader's translation from main's list", async () => {
    g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' },
      { id: 'rvr1960', label: 'RVR1960', desc: 'Reina-Valera 1960 (Español) — the classic Spanish Bible', lang: 'es' }];
    const { container } = render(<Bar place="bible-chapter" route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{ translation: 'rvr1960' }} />);
    await click(more(container));
    expect(rowNamed(container, 'Bible translation').querySelector('.s').textContent).toBe('RVR1960 · Reina-Valera 1960');
  });

  it("a collection's page has no ... at all (design's rule: nothing there would be this page's)", () => {
    expect(placeFor('collection').actions).toBeUndefined();
  });
});

describe('what each row does', () => {
  it('Find and Auto-scroll open their page tools on this page, and the sheet closes', async () => {
    installCorpus();
    const open = vi.fn();
    const { container } = render(<Bar place="letter" route={ENTRY_76} open={open} />);
    await settle();
    await click(more(container));
    await click(rowNamed(container, 'Find in this entry'));
    expect(open).toHaveBeenLastCalledWith('find');
    expect(container.querySelector('.sheet.mor')).toBe(null);
    await click(more(container));
    await click(rowNamed(container, 'Auto-scroll'));
    expect(open).toHaveBeenLastCalledWith('auto-scroll');
  });

  it('Bible translation opens the translation page (7e)', async () => {
    const go = vi.fn();
    const { container } = render(<Bar place="bible-chapter" route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} go={go} />);
    await click(more(container));
    await click(rowNamed(container, 'Bible translation'));
    expect(go).toHaveBeenCalledWith({ place: 'settings/translation' });
  });

  it('Cancel closes the sheet and does nothing', async () => {
    installCorpus();
    const open = vi.fn();
    const { container } = render(<Bar place="letter" route={ENTRY_76} open={open} />);
    await settle();
    await click(more(container));
    await click(container.querySelector('.sheet.mor .cancel'));
    expect(container.querySelector('.sheet.mor')).toBe(null);
    expect(open).not.toHaveBeenCalled();
  });

  it('Copy website link copies the page\'s link and says "Link copied: <reference>"', async () => {
    installCorpus();
    const writeText = vi.fn((/** @type {string} */ _text) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    await click(more(container));
    await click(rowNamed(container, 'Copy website link'));
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(siteName(writeText.mock.calls[0][0])).toBe('thevolumesoftruth.com');
    expect(writeText.mock.calls[0][0]).toContain('Words_To_Live_By');
    expect(container.querySelector('.toast').textContent).toBe('Link copied: Elect and Precious (Words To Live By: Part One)');
  });

  it("a refused clipboard opens main's \"Couldn't copy\" sheet with the link in it; Close takes it away", async () => {
    installCorpus();
    const writeText = vi.fn((/** @type {string} */ _text) => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    await click(more(container));
    await click(rowNamed(container, 'Copy website link'));
    await settle();
    const sheet = container.querySelector('.sheet.cpf');
    expect(sheet.querySelector('.sh').textContent).toBe('Couldn’t copy');
    expect(/** @type {HTMLTextAreaElement} */ (sheet.querySelector('textarea')).value).toContain('Words_To_Live_By');
    expect(texts(sheet, 'button')).toEqual(['Try again', 'Close']);
    await click([...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Close'));
    expect(container.querySelector('.sheet.cpf')).toBe(null);
  });
});

describe('Hear it sung (main\'s song catalog, verbatim songs only)', () => {
  /** main's SongCatalog as the global main's bundle publishes: not loaded until load() resolves. */
  function catalog(songs) {
    const subs = new Set();
    let ver = 0;
    const C = {
      loaded: false, error: false,
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
      getVersion: () => ver,
      load: vi.fn(() => Promise.resolve().then(() => { C.loaded = true; ver += 1; subs.forEach((cb) => cb()); return true; })),
      songsForLetter: vi.fn((key, opts) => (key === 'wtlb1:elect-and-precious' && opts && opts.verbatim ? songs : [])),
    };
    return C;
  }

  it('asks for the catalog once; once in, the row shows and plays the songs as main\'s pill does', async () => {
    installCorpus();
    g.SongCatalog = catalog([{ id: 's1' }, { id: 's2' }]);
    g.AudioPlayer = { playSongs: vi.fn() };
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    expect(g.SongCatalog.load).toHaveBeenCalledTimes(1);
    await click(more(container));
    expect(texts(container, '.sheet.mor .srow .t')).toEqual(['Find in this entry', 'Auto-scroll', 'Hear it sung', 'Copy website link', 'See this letter’s scriptures']);
    expect(rowNamed(container, 'Hear it sung').querySelector('.s').textContent).toBe('Songs that sing its words');
    await click(rowNamed(container, 'Hear it sung'));
    expect(g.AudioPlayer.playSongs).toHaveBeenCalledWith({ ids: ['s1', 's2'], startId: 's1', label: 'Elect and Precious' });
  });

  it('no verbatim song for the page: no row', async () => {
    installCorpus();
    g.SongCatalog = catalog([]);
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    await click(more(container));
    expect(rowNamed(container, 'Hear it sung')).toBeUndefined();
  });

  it("main's Hear it sung setting off: no row, and the catalog is never asked for", async () => {
    installCorpus();
    g.SongCatalog = catalog([{ id: 's1' }]);
    g.StateStore = { isReady: () => true, get: () => ({ settings: { showLetterSongs: false } }) };
    const { container } = render(<Bar place="letter" route={ENTRY_76} />);
    await settle();
    await click(more(container));
    expect(rowNamed(container, 'Hear it sung')).toBeUndefined();
    expect(g.SongCatalog.load).not.toHaveBeenCalled();
  });
});

describe('the laptop (D6)', () => {
  it('a menu under the ... (no title, no Cancel, menu items), the ... lit while open; Escape closes it', async () => {
    installCorpus();
    const { container } = render(<Bar place="letter" route={ENTRY_76} desktop />);
    await settle();
    await click(more(container));
    const menu = container.querySelector('.menu[role="menu"]');
    expect(menu).toBeTruthy();
    expect(container.querySelector('.sheet')).toBe(null);
    expect(menu.querySelector('.sh')).toBe(null);
    expect(menu.querySelector('.cancel')).toBe(null);
    expect([...menu.querySelectorAll('.srow')].every((r) => r.getAttribute('role') === 'menuitem')).toBe(true);
    expect(more(container).classList.contains('opn')).toBe(true);
    expect(more(container).getAttribute('aria-haspopup')).toBe('menu');
    await act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(container.querySelector('.menu')).toBe(null);
  });
});

describe('gate rows 1h-entry-more and 5g-chapter-more', () => {
  it('names the rows', () => {
    expect(GATE_STATES['1h-entry-more'].stack[2]).toEqual(ENTRY_76);
    expect(GATE_STATES['1h-entry-more'].open).toEqual({ sheet: 'more', songs: true });
    expect(GATE_STATES['5g-chapter-more'].stack[3]).toEqual({ place: 'bible-chapter', book: 'john', chapter: 3 });
    expect(GATE_STATES['5g-chapter-more'].open).toEqual({ sheet: 'more' });
  });

  it('1h draws entry 76 with its sheet open: four rows, no focus ring, and touches no catalog', async () => {
    installCorpus();
    g.SongCatalog = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0, load: vi.fn(), songsForLetter: vi.fn() };
    const { container } = render(<V2App gateId="1h-entry-more" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle();
    expect(container.querySelector('.sheet.mor .sh').textContent).toBe('Elect and Precious');
    expect(texts(container, '.sheet.mor .srow .t')).toEqual(['Find in this entry', 'Auto-scroll', 'Hear it sung', 'Copy website link']);
    expect(texts(container, '.sheet.mor .srow .s')).toEqual(['Scrolls the page for you · 16 lines/min', 'Songs that sing its words', 'thevolumesoftruth.com']);
    expect(g.SongCatalog.load).not.toHaveBeenCalled();
    expect(document.activeElement && document.activeElement.closest('.sheet')).toBeFalsy();
  });

  it('1h on the laptop: the menu hangs in the column (.col.anc), the ... lit', async () => {
    installCorpus();
    g.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<V2App gateId="1h-entry-more" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle();
    const menu = container.querySelector('.menu');
    expect(menu.closest('.col.anc')).toBeTruthy();
    expect(texts(menu, '.srow .t')).toEqual(['Find in this entry', 'Auto-scroll', 'Hear it sung', 'Copy website link']);
    expect(container.querySelector('.tb .ic.opn[aria-label="More"]')).toBeTruthy();
  });

  it('5g draws John 3 with its sheet open: Find, Auto-scroll, Bible translation NKJV', async () => {
    g.BOOKS = { john: JOHN };
    const { container } = render(<V2App gateId="5g-chapter-more" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.sheet.mor .sh').textContent).toBe('John 3');
    expect(texts(container, '.sheet.mor .srow .t')).toEqual(['Find in this chapter', 'Auto-scroll', 'Bible translation']);
    expect(rowNamed(container, 'Bible translation').querySelector('.s').textContent).toBe('NKJV · New King James Version');
  });
});
