/* Opening a shared passage at boot (A8, 2026-09-22): read ?p=, take it off the
   address so a reload or Back cannot replay it, wait for the corpus that knows
   the key, and hand navigateToLink a silent jump. A key that names nothing
   leaves the reader where the app restored them. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { openSharedPassage, installSharedPassageHook, useSharedPassageLink, _resetSharedPassagePark } from './use-shared-passage-link.js';
import { storesNotLoaded } from '../stores/cached-store.js';
import { StateStore } from '../stores/state-store.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../stores/cached-store.js', async (importOriginal) => ({ ...(/** @type {any} */ (await importOriginal())), storesNotLoaded: vi.fn(() => []) }));
vi.mock('../utils/toast.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get showToast() { return /** @type {any} */ (globalThis).showToast; } }; });

function fakeWin(search, extra) {
  const replaced = [];
  const win = {
    location: { search, href: 'https://votreader.github.io/app/' + search + '#top' },
    history: { state: { s: 1 }, replaceState: (st, _t, url) => replaced.push({ st, url }) },
    ...extra,
  };
  return { win, replaced };
}
const JOHN = { john: { id: 'john', title: 'John', chapters: [{ num: 1 }, { num: 2 }, { num: 3 }] } };
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete /** @type {any} */ (globalThis).BOOKS;
  delete /** @type {any} */ (globalThis).findEntryContext;
  _resetSharedPassagePark();
});

describe('openSharedPassage', () => {
  it('opens a shared verse at that verse, silently, and takes ?p= off the address', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const nav = vi.fn();
    const { win, replaced } = fakeWin('?p=bible%3Ajohn%3A3%3A16', { __loadBibleCorpus: () => Promise.resolve() });
    expect(openSharedPassage(win, nav)).toBe('bible:john:3:16');
    expect(replaced).toEqual([{ st: { s: 1 }, url: '/app/#top' }]);
    await flush();
    expect(nav).toHaveBeenCalledTimes(1);
    const [ep, meta] = nav.mock.calls[0];
    expect(ep).toMatchObject({ type: 'bible', bookId: 'john', chapter: 3, verse: 16, key: 'bible:john:3:16' });
    expect(meta).toMatchObject({ silent: true });
  });

  it('keeps any other query parameter on the address', () => {
    const { win, replaced } = fakeWin('?utm=x&p=bible%3Ajohn%3A3%3A16', { __loadBibleCorpus: () => Promise.resolve() });
    openSharedPassage(win, vi.fn());
    expect(replaced[0].url).toBe('/app/?utm=x#top');
  });

  it('ignores a verse in a book or chapter the Bible does not have', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const nav = vi.fn();
    openSharedPassage(fakeWin('?p=bible%3Anotabook%3A1%3A1', { __loadBibleCorpus: () => Promise.resolve() }).win, nav);
    openSharedPassage(fakeWin('?p=bible%3Ajohn%3A99%3A1', { __loadBibleCorpus: () => Promise.resolve() }).win, nav);
    await flush();
    expect(nav).not.toHaveBeenCalled();
  });

  it('waits for the letters before it opens a letter, and opens it on its block', async () => {
    let release;
    const loaded = new Promise((r) => { release = r; });
    const nav = vi.fn();
    /** @type {any} */ (globalThis).findEntryContext = () => null;
    openSharedPassage(fakeWin('?p=letter%3Athe-wide-path%3A3', { __loadVotCorpus: () => loaded }).win, nav);
    await flush();
    expect(nav).not.toHaveBeenCalled();
    /** @type {any} */ (globalThis).findEntryContext = (id) => (id === 'the-wide-path'
      ? { kind: 'letter', screen: 'vot-one-letter', collection: 'one', title: 'The Wide Path' } : null);
    release();
    await flush();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][0]).toMatchObject({ type: 'letter', letterId: 'the-wide-path', screen: 'vot-one-letter', key: 'letter:the-wide-path:3' });
  });

  /* n6-01: a Bible or Letter Study chapter reads as LetterView, so it shares as
     letter:<chapterId>:<n>. findEntryContext knows study chapters only once the
     studies are loaded, which a fresh recipient's boot never did: the link
     opened nothing. */
  it('(n6-01) opens a shared study chapter once the studies are loaded, not just the Volumes', async () => {
    const nav = vi.fn();
    let studiesIn = false;
    let releaseStudies;
    const studies = new Promise((r) => { releaseStudies = () => { studiesIn = true; r(undefined); }; });
    /** @type {any} */ (globalThis).findEntryContext = (id) => (studiesIn && id === 'lamb-of-god-1'
      ? { kind: 'study-letter', screen: 'bible-study-chapter', collection: 'Bible Studies', title: 'The Lamb of God', studyId: 'lamb-of-god', studyChapterId: 'lamb-of-god-1' }
      : null);
    openSharedPassage(fakeWin('?p=letter%3Alamb-of-god-1%3A3', {
      __loadVotCorpus: () => Promise.resolve(),
      loadBibleStudies: () => studies,
    }).win, nav);
    await flush();
    expect(nav, 'waits for the studies').not.toHaveBeenCalled();
    releaseStudies();
    await flush();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][0]).toMatchObject({ type: 'study-letter', screen: 'bible-study-chapter', studyChapterId: 'lamb-of-god-1', key: 'letter:lamb-of-god-1:3' });
  });

  /* n6-03: a first-time visitor's first screen is the About welcome, and the jump
     waited silently for the corpus: the passage replaced About seconds later
     with nothing said. It now says so at once, and says so when it cannot open. */
  it('(n6-03) says it is opening the shared passage at once, and says so when it cannot', async () => {
    const toasts = [];
    const showToast = (o) => toasts.push(o.text);
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const nav = vi.fn();
    let release;
    const corpus = new Promise((r) => { release = r; });
    openSharedPassage(fakeWin('?p=bible%3Ajohn%3A3%3A16', { __loadBibleCorpus: () => corpus, showToast }).win, nav);
    expect(toasts).toEqual(['Opening the shared passage…']);
    release();
    await flush();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(toasts).toHaveLength(1);

    toasts.length = 0;
    openSharedPassage(fakeWin('?p=bible%3Ajohn%3A30%3A1', { __loadBibleCorpus: () => Promise.resolve(), showToast }).win, vi.fn());
    await flush();
    expect(toasts).toEqual(['Opening the shared passage…', 'That shared passage could not be found.']);
  });

  it('opens nothing for a letter the corpus does not know', async () => {
    const nav = vi.fn();
    /** @type {any} */ (globalThis).findEntryContext = () => null;
    openSharedPassage(fakeWin('?p=letter%3Anope%3A0', { __loadVotCorpus: () => Promise.resolve() }).win, nav);
    await flush();
    expect(nav).not.toHaveBeenCalled();
  });

  it('never reads the reader’s own writing from an address, and leaves such an address alone', () => {
    const nav = vi.fn();
    const { win, replaced } = fakeWin('?p=journal%3Aabc%3A0', {});
    expect(openSharedPassage(win, nav)).toBeNull();
    expect(replaced).toEqual([]);
    expect(nav).not.toHaveBeenCalled();
  });
});

/* n6-15: the installed app opens a shared link itself. At a cold start the APK
   boots index.html?p=<key> (openSharedPassage above); when the app is already
   open it asks the running page through window.__votOpenSharedPassage(key). */
describe('installSharedPassageHook (the APK, app already open)', () => {
  it('opens a key handed in by the app, and says it took it', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const nav = vi.fn();
    const { win, replaced } = fakeWin('', { __loadBibleCorpus: () => Promise.resolve() });
    installSharedPassageHook(win, nav);
    expect(typeof win.__votOpenSharedPassage).toBe('function');
    expect(win.__votOpenSharedPassage('bible:john:3:16')).toBe(true);
    expect(replaced).toEqual([]);                  // nothing on the address to take off
    await flush();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][0]).toMatchObject({ type: 'bible', bookId: 'john', chapter: 3, verse: 16 });
    expect(nav.mock.calls[0][1]).toMatchObject({ silent: true });
  });

  it('refuses what is not a public passage key (true only when it opens something)', async () => {
    const nav = vi.fn();
    const { win } = fakeWin('', { __loadBibleCorpus: () => Promise.resolve(), __loadVotCorpus: () => Promise.resolve() });
    installSharedPassageHook(win, nav);
    expect(win.__votOpenSharedPassage('journal:abc:1')).toBe(false);
    expect(win.__votOpenSharedPassage(42)).toBe(false);
    expect(win.__votOpenSharedPassage("bible:john:3:16');x(")).toBe(false);
    await flush();
    expect(nav).not.toHaveBeenCalled();
  });
});
/* W41 (sweep 2026-10-13): on a slow start HydrationGate lets App in before every
   store has loaded and remounts it as the late ones land, putting the reader back where
   the saved record says. The first mount took ?p= off the address and opened it, so the
   link was lost with that mount. Now the key stays parked until a FINAL mount (every
   store loaded at its first render, so nothing replaces it) has made the jump. */
describe('openSharedPassage — W41: the key outlives every mount that is replaced', () => {
  afterEach(() => { vi.mocked(storesNotLoaded).mockReset(); vi.mocked(storesNotLoaded).mockReturnValue([]); });

  it('a replaced mount opens it, every later mount opens it again, a final mount settles it', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const nav1 = vi.fn();
    const a = fakeWin('?p=bible%3Ajohn%3A3%3A16', { __loadBibleCorpus: () => Promise.resolve() });
    expect(openSharedPassage(a.win, nav1, false)).toBe('bible:john:3:16');
    expect(a.replaced).toHaveLength(1);                 // a reload must not replay it
    await flush();
    expect(nav1).toHaveBeenCalledTimes(1);              // the stores may never load: it opens now
    const nav2 = vi.fn();                                // vot-state landed, another store has not
    expect(openSharedPassage(fakeWin('', { __loadBibleCorpus: () => Promise.resolve() }).win, nav2, false)).toBe('bible:john:3:16');
    await flush();
    expect(nav2).toHaveBeenCalledTimes(1);
    const nav3 = vi.fn();                                // the last store landed: the final mount
    expect(openSharedPassage(fakeWin('', { __loadBibleCorpus: () => Promise.resolve() }).win, nav3, true)).toBe('bible:john:3:16');
    await flush();
    expect(nav3).toHaveBeenCalledTimes(1);
    expect(nav3.mock.calls[0][0]).toMatchObject({ type: 'bible', bookId: 'john', chapter: 3, verse: 16 });
    expect(openSharedPassage(fakeWin('', {}).win, vi.fn(), true)).toBeNull(); // settled: nothing left to replay
  });

  it('a replaced mount whose corpus lands late never settles the key for the mount after it', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    let land;
    const slow = new Promise((r) => { land = r; });
    openSharedPassage(fakeWin('?p=bible%3Ajohn%3A3%3A16', { __loadBibleCorpus: () => slow }).win, vi.fn(), false);
    const nav2 = vi.fn();
    openSharedPassage(fakeWin('', { __loadBibleCorpus: () => slow }).win, nav2, false);
    land();
    await flush();
    expect(openSharedPassage(fakeWin('', { __loadBibleCorpus: () => Promise.resolve() }).win, vi.fn(), true)).toBe('bible:john:3:16');
  });

  it('a final mount on a normal boot opens it once and leaves nothing parked', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const nav = vi.fn();
    openSharedPassage(fakeWin('?p=bible%3Ajohn%3A3%3A16', { __loadBibleCorpus: () => Promise.resolve() }).win, nav, true);
    await flush();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(openSharedPassage(fakeWin('', {}).win, vi.fn(), true)).toBeNull();
  });

  it('a key that opens nothing is settled by a final mount too', async () => {
    openSharedPassage(fakeWin('?p=bible%3Anotabook%3A1%3A1', { __loadBibleCorpus: () => Promise.resolve() }).win, vi.fn(), true);
    await flush();
    expect(openSharedPassage(fakeWin('', {}).win, vi.fn(), true)).toBeNull();
  });

  it('the APK hand-off to a mount that is then replaced is parked for the next one', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    const { win } = fakeWin('', { __loadBibleCorpus: () => Promise.resolve() });
    installSharedPassageHook(win, vi.fn(), false);
    expect(win.__votOpenSharedPassage('bible:john:3:16')).toBe(true);
    await flush();
    const nav2 = vi.fn();
    expect(openSharedPassage(fakeWin('', { __loadBibleCorpus: () => Promise.resolve() }).win, nav2, true)).toBe('bible:john:3:16');
    await flush();
    expect(nav2).toHaveBeenCalledTimes(1);
  });

  it('useSharedPassageLink fixes "final" at the first render: a store landing before the effect still counts as replaced', async () => {
    /** @type {any} */ (globalThis).BOOKS = JOHN;
    // pending at the render, loaded by the time the effect runs (refuter round 1, finding 1)
    vi.mocked(storesNotLoaded).mockReturnValueOnce([{}]).mockReturnValue([]);
    const gs = vi.spyOn(StateStore, 'getState').mockReturnValue('loaded'); // vot-state landed before the effect
    const realLocation = window.location.href;
    window.history.replaceState(null, '', '/app/?p=bible%3Ajohn%3A3%3A16');
    const realLoad = /** @type {any} */ (window).__loadBibleCorpus;
    /** @type {any} */ (window).__loadBibleCorpus = () => Promise.resolve();
    try {
      const nav = vi.fn();
      const hook = renderHook(() => useSharedPassageLink(nav));
      await flush();
      expect(nav).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe('');
      hook.unmount();
      // HydrationGate's remount: the key is still there for it
      const nav2 = vi.fn();
      const hook2 = renderHook(() => useSharedPassageLink(nav2));
      await flush();
      expect(nav2).toHaveBeenCalledTimes(1);
      hook2.unmount();
    } finally {
      /** @type {any} */ (window).__loadBibleCorpus = realLoad;
      window.history.replaceState(null, '', realLocation);
      gs.mockRestore();
    }
  });
});
