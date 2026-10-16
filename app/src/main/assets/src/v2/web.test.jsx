// @ts-nocheck — main's screen and stores, installed by hand as bundle-d / bundle-b publish them.
/* v2's Scripture Web (zones v2p8; design dz14 picture 5e): main's ScriptureWebScreen hosted whole. Here main's screen is
   a stand-in that records the props v2 hands it and keeps main's Escape rule (its own tests prove main's screen): the
   settings it reads and writes, where a passage it opens goes (web-facts), Back and Android's Back (main's panels first),
   main's corpora loads, the bare phone place and the laptop's rail, and the pinned gate picture, which writes, loads and
   opens nothing and is ready only once the web has drawn. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { V2App } from './App.jsx';
import { placeFor } from './places.js';
import { GATE_STATES } from './gate.js';
import { webRoute, GATE_WEB_SETTINGS } from './web-facts.js';
import './screens/WebScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const row = (root, t) => [...root.querySelectorAll('button.row')].find((b) => b.textContent.includes(t)) || null;
const GLOBALS = ['ReactDOM', 'StateStore', 'ScriptureWebScreen', '__loadBibleCorpus', '__loadVotCorpus', 'matchMedia', 'JournalStore'];

/** The last props v2 handed main's screen. */
let seen = null;
/** Main's screen, standing in: "Weaving the web…" for a moment, then the web with a panel open (the guide); main's
 *  Escape closes the panel first, then calls onBack. */
function StandIn(props) {
  seen = props;
  const [loading, setLoading] = React.useState(true);
  const [panel, setPanel] = React.useState(true);
  React.useEffect(() => { const t = setTimeout(() => setLoading(false), StandIn.loadMs); return () => clearTimeout(t); }, []);
  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    if (panel) setPanel(false); else props.onBack();
  };
  return (
    <div className="sw-root" tabIndex={0} onKeyDown={onKeyDown}>
      {loading && <div className="sw-loading">Weaving the web…</div>}
      {panel && <div className="sw-guide">How to read this web</div>}
    </div>
  );
}

StandIn.loadMs = 40;

let store;
function install({ settings = {} } = {}) {
  g.ReactDOM = ReactDOM;
  store = { st: { settings }, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  g.StateStore = store;
  g.ScriptureWebScreen = StandIn;
  g.__loadBibleCorpus = vi.fn();
  g.__loadVotCorpus = vi.fn();
}
beforeEach(() => { seen = null; StandIn.loadMs = 40; install(); });
afterEach(() => {
  cleanup();
  for (const k of GLOBALS) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

/** A real boot opened on the web from Home's row. */
async function openWeb() {
  const r = render(<V2App gateId={null} />);
  await waitFor(() => expect(row(r.container, 'The Scripture Web')).not.toBe(null));
  await click(row(r.container, 'The Scripture Web'));
  await waitFor(() => expect(r.container.querySelector('.sw-root')).not.toBe(null));
  return r;
}

describe('webRoute: where a passage the web opens goes in v2', () => {
  it('a verse by its key or its fields opens its chapter at the verse; a study chapter its study place', () => {
    expect(webRoute({ type: 'bible', key: 'bible:john:3:16' }, { BIBLE_BOOKS: [] })).toEqual({ place: 'bible-chapter', book: 'john', chapter: 3, verse: 16 });
    expect(webRoute({ type: 'bible', bookId: 'romans', chapter: 8, verse: 28 })).toEqual({ place: 'bible-chapter', book: 'romans', chapter: 8, verse: 28 });
    expect(webRoute({ type: 'bible', bookId: 'romans', chapter: '8' })).toEqual({ place: 'bible-chapter', book: 'romans', chapter: 8, verse: null });
    // main's curated study end: its key is 'study:<study>:<chapter>', not the Matthew note key placeOfKey reads
    expect(webRoute({ type: 'study-letter', key: 'study:more-than-a-man:more-than-a-man-ch2', studyId: 'more-than-a-man', studyChapterId: 'more-than-a-man-ch2' }))
      .toEqual({ place: 'study-chapter', study: 'more-than-a-man', chapter: 'more-than-a-man-ch2' });
  });

  it("one of the reader's own link ends (a journal entry) by its key; nothing v2 can show is null", () => {
    const env = { JournalStore: { get: (id) => (id === 'j1' ? { id: 'j1', title: 'Morning' } : null) } };
    expect(webRoute({ type: 'journal', key: 'journal:j1:0' }, env)).toEqual({ place: 'journal-entry', id: 'j1' });
    expect(webRoute({ type: 'journal', key: 'journal:gone:0' }, env)).toBe(null);
    expect(webRoute({ type: 'study-letter', studyId: 'x' })).toBe(null);
    expect(webRoute(null)).toBe(null);
    expect(webRoute({ type: 'mystery', key: 'mystery:1' })).toBe(null);
  });
});

describe('the place', () => {
  it("bare on the phone (main's screen covers the window), the laptop keeps its rail", () => {
    const def = placeFor('scripture-web');
    expect(def.bare).toBe(true);
    expect(def.rail).toBe(true);
  });
});

describe('a real boot', () => {
  it("hands main's screen the saved settings, keeps them current as it writes them, and loads both corpora as main does", async () => {
    install({ settings: { swGuideSeen: false, webDensity: 'essential', translation: 'kjv' } });
    const { container } = await openWeb();
    expect(seen.settings).toMatchObject({ swGuideSeen: false, webDensity: 'essential' });
    expect(g.__loadBibleCorpus).toHaveBeenCalled();
    expect(g.__loadVotCorpus).toHaveBeenCalled();
    act(() => { seen.updateSetting('swGuideSeen', true); });
    expect(store.set).toHaveBeenCalled();
    expect(store.st.settings).toMatchObject({ swGuideSeen: true, webDensity: 'essential', translation: 'kjv' });
    expect(seen.settings.swGuideSeen).toBe(true);
    // the phone: nothing of v2's shell over main's screen
    expect(container.querySelector('.tb, .tabbar, .rail, .mini')).toBe(null);
  });

  it("a passage the web opens goes to v2's place for it; Back leaves the web for Home", async () => {
    const { container } = await openWeb();
    act(() => { seen.navigateToLink({ type: 'bible', key: 'bible:john:3:16', bookId: 'john', chapter: 3, verse: 16 }, { sourceLetterTitle: 'The Scripture Web' }); });
    await waitFor(() => expect(container.querySelector('.sw-root')).toBe(null));
    act(() => { g.handleAndroidBack(); });
    await waitFor(() => expect(container.querySelector('.sw-root')).not.toBe(null));
    act(() => { seen.onBack(); });
    await waitFor(() => expect(row(container, 'The Scripture Web')).not.toBe(null));
    expect(container.querySelector('.sw-root')).toBe(null);
  });

  it("Android's Back runs main's own rule: the open panel closes first, then the web leaves", async () => {
    const { container } = await openWeb();
    expect(container.querySelector('.sw-guide')).not.toBe(null);
    let r;
    act(() => { r = g.handleAndroidBack(); });
    expect(r).toBe('true');
    expect(container.querySelector('.sw-guide')).toBe(null);
    expect(container.querySelector('.sw-root')).not.toBe(null);
    act(() => { r = g.handleAndroidBack(); });
    expect(r).toBe('true');
    await waitFor(() => expect(row(container, 'The Scripture Web')).not.toBe(null));
    expect(container.querySelector('.sw-root')).toBe(null);
  });

  it("the laptop: the rail stays beside the web, and no top bar or player bar of v2's", async () => {
    g.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const { container } = await openWeb();
    const root = container.querySelector('.v2');
    expect(root.className).toBe('v2 dk');
    expect(container.querySelector('nav.rail')).not.toBe(null);
    expect(container.querySelector('.tb, .pbar')).toBe(null);
  });
});

describe('gate 5e', () => {
  it("main's web with the picture's settings; ready only once it has drawn; it writes, loads and opens nothing", async () => {
    expect(GATE_STATES['5e-scripture-web'].stack).toEqual([{ place: 'home' }, { place: 'scripture-web' }]);
    StandIn.loadMs = 400;
    const { container } = render(<V2App gateId="5e-scripture-web" />);
    await waitFor(() => expect(container.querySelector('.sw-loading')).not.toBe(null));
    await act(() => new Promise((r) => { setTimeout(r, 200); }));
    expect(container.querySelector('.sw-loading'), 'still weaving').not.toBe(null);
    expect(html.dataset.gate).not.toBe('ready');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.sw-loading')).toBe(null);
    expect(seen.settings).toEqual(GATE_WEB_SETTINGS);
    act(() => { seen.updateSetting('webDensity', 'essential'); });
    expect(store.set).not.toHaveBeenCalled();
    expect(g.__loadBibleCorpus).not.toHaveBeenCalled();
    expect(g.__loadVotCorpus).not.toHaveBeenCalled();
    act(() => { seen.navigateToLink({ type: 'bible', bookId: 'john', chapter: 3, verse: 16 }); });
    expect(container.querySelector('.sw-root')).not.toBe(null);
  });
});
