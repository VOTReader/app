/* Opening a shared passage at boot (A8, 2026-09-22): read ?p=, take it off the
   address so a reload or Back cannot replay it, wait for the corpus that knows
   the key, and hand navigateToLink a silent jump. A key that names nothing
   leaves the reader where the app restored them. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openSharedPassage } from './use-shared-passage-link.js';

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
