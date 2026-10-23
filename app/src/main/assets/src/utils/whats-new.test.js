/* up1: what changed for the reader since the build they last had (utils/whats-new.js). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unseenItems, takeNewItems, openWhatsNew, byDay, fetchNotes, LAST_SEEN_NOTE_KEY, OPEN_EVENT, RECENT_COUNT } from './whats-new.js';
import { LS_SKIP_LIST } from '../stores/cached-store.js';

const day = (s, h = 12) => new Date(s + 'T00:00:00').getTime() + h * 3600000;
const DOC = { since: day('2026-10-22'), items: [
  { t: day('2026-10-23', 9), text: 'Build your own reading plan.' },
  { t: day('2026-10-23', 8), text: 'The daily reminder.' },
  { t: day('2026-10-21'), text: 'An older change.' },
] };
const serve = (body, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('unseenItems', () => {
  it('the items newer than what the profile was told; the first time, newer than the release\'s since', () => {
    expect(unseenItems(DOC, null).map((i) => i.text)).toEqual(['Build your own reading plan.', 'The daily reminder.']);
    expect(unseenItems(DOC, day('2026-10-23', 8)).map((i) => i.text)).toEqual(['Build your own reading plan.']);
    expect(unseenItems(DOC, day('2026-10-24'))).toEqual([]);
  });
  it('no key and no since (the APK the first time): nothing is new yet', () => {
    expect(unseenItems({ since: null, items: DOC.items }, null)).toEqual([]);
  });
});

describe('takeNewItems', () => {
  it('returns what is new once, then nothing: the key moves to the newest item', async () => {
    serve(DOC);
    expect((await takeNewItems()).length).toBe(2);
    expect(localStorage.getItem(LAST_SEEN_NOTE_KEY)).toBe(String(day('2026-10-23', 9)));
    expect(await takeNewItems()).toEqual([]);
  });
  it('a list that cannot be read says nothing and leaves the key alone', async () => {
    localStorage.setItem(LAST_SEEN_NOTE_KEY, '5');
    serve({}, false);
    expect(await takeNewItems()).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await takeNewItems()).toEqual([]);
    serve({ items: 'nope' });
    expect(await takeNewItems()).toEqual([]);
    expect(localStorage.getItem(LAST_SEEN_NOTE_KEY)).toBe('5');
  });
  it('drops broken items and asks past every cache', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ since: 0, items: [null, { t: 'x', text: 'a' }, { t: 3, text: '' }, { t: 4, text: 'Kept.' }] }) }));
    vi.stubGlobal('fetch', f);
    expect((await fetchNotes()).items).toEqual([{ t: 4, text: 'Kept.' }]);
    expect(f).toHaveBeenCalledWith('./whats-new.json', { cache: 'no-store' });
  });
  it('the key survives the one-time vot-* sweep', () => {
    expect(LS_SKIP_LIST).toContain(LAST_SEEN_NOTE_KEY);
  });
});

describe('openWhatsNew', () => {
  it('opens the sheet with the given items, or the newest from the file (Settings)', async () => {
    const seen = [];
    const on = (e) => seen.push(e.detail.items.length);
    window.addEventListener(OPEN_EVENT, on);
    try {
      await openWhatsNew([DOC.items[0]]);
      const many = { since: 0, items: Array.from({ length: RECENT_COUNT + 5 }, (_, i) => ({ t: 100 - i, text: 'Change ' + i + '.' })) };
      serve(many);
      await openWhatsNew();
      serve({}, false);
      await openWhatsNew();
    } finally { window.removeEventListener(OPEN_EVENT, on); }
    expect(seen).toEqual([1, RECENT_COUNT, 0]);
  });
});

describe('byDay', () => {
  it('groups by day, newest first', () => {
    const g = byDay([DOC.items[2], DOC.items[1], DOC.items[0]]);
    expect(g.map((d) => d.day)).toEqual(['October 23', 'October 21']);
    expect(g[0].items.map((i) => i.text)).toEqual(['Build your own reading plan.', 'The daily reminder.']);
  });
});
