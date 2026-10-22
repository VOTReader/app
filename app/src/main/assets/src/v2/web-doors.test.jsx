// @ts-nocheck — main's screen and bundle-d's reference reader, installed by hand as bundle-d publishes them.
/* The doors into the Scripture Web (mw13; sweb's w4 v2-handoff section 4, main's screen-routes __openScriptureWeb): a
   reference's or footnote's "Show in Scripture Web" (RefSheet), a page's ... row (a letter's, a study chapter's, a Bible
   chapter's), and the web reading the door's start once per route, so Back to the web resumes where the reader was. The
   reference reader is main's own (ref-parse.js webStartOfRef), which bundle-d hands v2 as a window global. */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { webStartOfRef as mainStartOfRef } from '../utils/scripture-web/ref-parse.js';
import { RefSheet } from './screens/RefSheet.jsx';
import { WebScreen, takeStart } from './screens/WebScreen.jsx';
import { webDoor, webStartOfRef, letterWebStart, studyWebStart } from './web-facts.js';
import { webItem } from './more-menu.jsx';

const g = /** @type {any} */ (globalThis);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const door = () => [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Show in Scripture Web')) || null;

// main's reader names books from the search data (a classic script that sets window.VotSearchData), as ref-parse.test.js
let prevSearch;
beforeAll(async () => {
  prevSearch = window.VotSearchData;
  await import('../../search-data.js');
});
afterAll(() => { window.VotSearchData = prevSearch; });
afterEach(() => {
  cleanup();
  delete g.webStartOfRef;
  delete g.ScriptureWebScreen;
});

describe("the doors' starts (web-facts)", () => {
  it("a reference by main's reader: its first passage as a verse, else a chapter; nothing without a Bible place or bundle-d", () => {
    const env = { webStartOfRef: mainStartOfRef };
    expect(webStartOfRef('John 3:16', env)).toEqual({ verse: { bookId: expect.any(String), chapter: 3, verse: 16 } });
    expect(webStartOfRef('Isaiah 53', env)).toEqual({ book: expect.any(String), chapter: 53 });
    expect(webStartOfRef('John 3:16-18; Romans 8:28', env)).toEqual(mainStartOfRef('John 3:16'));
    expect(webStartOfRef('Letter 9', env)).toBe(null);
    expect(webStartOfRef('John 3:16', {})).toBe(null);
    expect(webStartOfRef('', env)).toBe(null);
  });

  it("a letter's and a study chapter's are main's letterKeys; Hidden Manna and a letter with no id have none", () => {
    expect(letterWebStart('one', { id: 'letter-9' })).toEqual({ letterKey: 'one/letter-9' });
    expect(letterWebStart('wtlb1', { id: 'building-the-gallows' })).toEqual({ letterKey: 'wtlb1/building-the-gallows' });
    expect(letterWebStart('hm', { id: 'x' })).toBe(null);
    expect(letterWebStart('one', null)).toBe(null);
    expect(studyWebStart('more-than-a-man', 'more-than-a-man-ch2')).toEqual({ letterKey: 'study:more-than-a-man/more-than-a-man-ch2' });
    expect(studyWebStart('more-than-a-man', '')).toBe(null);
  });

  it("a door is the web's place with the start; the ...'s row opens it, and is absent with no door", () => {
    const route = webDoor({ book: 'john', chapter: 3 });
    expect(route).toEqual({ place: 'scripture-web', start: { book: 'john', chapter: 3 } });
    expect(webDoor(null)).toBe(null);
    const go = vi.fn();
    const item = webItem(route, 'Show in Scripture Web', go);
    expect(item).toMatchObject({ id: 'web', t: 'Show in Scripture Web' });
    item.run();
    expect(go).toHaveBeenCalledWith(route);
    expect(webItem(null, 'Show in Scripture Web', go)).toBe(null);
  });
});

describe("RefSheet's door", () => {
  const props = { letter: { nkjv: { 'John 3:16': 'For God so loved the world' } }, items: [], onClose() {}, onGo() {}, onRead() {}, onStep() {} };

  it('a reference opens the web at its verse; the sheet hands the route to the screen', async () => {
    g.webStartOfRef = mainStartOfRef;
    const onWeb = vi.fn();
    render(<RefSheet {...props} open={{ kind: 'ref', ref: 'John 3:16' }} onWeb={onWeb} />);
    expect(door()).not.toBe(null);
    await click(door());
    expect(onWeb).toHaveBeenCalledWith({ place: 'scripture-web', start: mainStartOfRef('John 3:16') });
  });

  it('a Scripture footnote has the door too; a note footnote has none', () => {
    g.webStartOfRef = mainStartOfRef;
    const items = [{ num: '1', fn: { type: 'scripture', ref: 'John 3:16' } }, { num: '2', fn: { type: 'note', text: 'A note.' } }];
    const r = render(<RefSheet {...props} items={items} open={{ kind: 'fn', num: '1' }} onWeb={vi.fn()} />);
    expect(door()).not.toBe(null);
    r.rerender(<RefSheet {...props} items={items} open={{ kind: 'fn', num: '2' }} onWeb={vi.fn()} />);
    expect(door()).toBe(null);
  });

  it('no door on a gate boot (no onWeb), without bundle-d, or for a reference naming no Bible place', () => {
    g.webStartOfRef = mainStartOfRef;
    const r = render(<RefSheet {...props} open={{ kind: 'ref', ref: 'John 3:16' }} />);
    expect(door()).toBe(null);
    r.rerender(<RefSheet {...props} open={{ kind: 'ref', ref: 'Letter 9' }} onWeb={vi.fn()} />);
    expect(door()).toBe(null);
    delete g.webStartOfRef;
    r.rerender(<RefSheet {...props} open={{ kind: 'ref', ref: 'John 3:16' }} onWeb={vi.fn()} />);
    expect(door()).toBe(null);
  });
});

describe("the web reads a door's start once per route", () => {
  it("main's screen gets the start on the first mount; Back to the same route resumes (no start); a new door starts again", () => {
    const starts = [];
    g.ScriptureWebScreen = (p) => { starts.push(p.start); return <div className="sw-root" />; };
    const base = { gate: null, go: vi.fn(), pop: vi.fn(), onReady: vi.fn() };
    const route = webDoor({ verse: { bookId: 'john', chapter: 3, verse: 16 } });
    const a = render(<WebScreen {...base} route={route} />);
    a.rerender(<WebScreen {...base} route={route} />);
    a.unmount();
    render(<WebScreen {...base} route={route} />);
    render(<WebScreen {...base} route={webDoor({ verse: { bookId: 'john', chapter: 3, verse: 16 } })} />);
    render(<WebScreen {...base} route={{ place: 'scripture-web' }} />);
    expect(starts).toEqual([route.start, route.start, undefined, route.start, undefined]);
  });

  it('takeStart: only an object start, once', () => {
    const r = { place: 'scripture-web', start: { letterKey: 'one/letter-9' } };
    expect(takeStart(r)).toEqual({ letterKey: 'one/letter-9' });
    expect(takeStart(r)).toBe(undefined);
    expect(takeStart({ place: 'scripture-web', start: 'this-letter' })).toBe(undefined);
    expect(takeStart(null)).toBe(undefined);
  });
});
