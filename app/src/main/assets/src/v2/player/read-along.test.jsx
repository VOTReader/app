// @vitest-environment jsdom
/* read-along.jsx (rv1 1b): the live wash is main's ReadAlongHighlight read from window; a gate paints a still wash and
   holds the player (so the gate) until it is on the page. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { LetterReadAlong, ChapterReadAlong, gateAt, gateChapterAt, stillWashes } from './read-along.jsx';
import { LetterScreen } from '../screens/LetterScreen.jsx';
import { wtlbHlKey } from '../../utils/hl-keys.js';

const g = /** @type {any} */ (globalThis);
const PLAYING = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608, paused: false };

/** A letter body with one [data-hl-key] block, and the wash beside it (as LetterScreen renders them). */
function Host({ gate, on = true, follow = true, withBody = true }) {
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  return (
    <div>
      {withBody && <div className="body" ref={bodyRef}><p data-hl-key="one-1:0">Text.</p></div>}
      <LetterReadAlong gate={gate} collection="one" n={1} volKey="one" letterId="one-1" bodyRef={bodyRef} on={on} follow={follow} />
    </div>
  );
}

/** main's audioSyncStore stand-in: the timings file lands when the test says so. */
function syncStore(name = '__audioSyncStore') {
  const listeners = new Set();
  let v = 0;
  g[name] = { subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => v };
  return () => act(() => { v += 1; listeners.forEach((cb) => cb()); });
}

beforeEach(() => {
  g.letterHlKey = (id, i) => id + ':' + i;
  g.clearReadAlong = vi.fn();
});
afterEach(() => {
  cleanup();
  for (const k of ['letterHlKey', 'clearReadAlong', 'paintReadAlongAt', 'ReadAlongHighlight', '__audioSyncStore', '__bibleSyncStore']) delete g[k];
});

describe('gateAt', () => {
  it("is the row's clock on the letter it plays, and null on any other or with nothing playing", () => {
    expect(gateAt({ playing: PLAYING }, 'one', 1)).toBe(231);
    expect(gateAt({ playing: PLAYING }, 'one', 2)).toBe(null);
    expect(gateAt({ playing: PLAYING }, 'two', 1)).toBe(null);
    expect(gateAt({}, 'one', 1)).toBe(null);
    expect(gateAt(null, 'one', 1)).toBe(null);
  });
});

describe('a real boot: main\'s ReadAlongHighlight over the one engine', () => {
  it('mounts window.ReadAlongHighlight on the body with the letter, its hl keys and the two switches', () => {
    const seen = [];
    g.ReadAlongHighlight = (p) => { seen.push(p); return null; };
    render(<Host gate={null} follow={false} />);
    const p = seen[seen.length - 1];
    expect(p.volKey).toBe('one');
    expect(p.letterId).toBe('one-1');
    expect(p.hlKeyFn).toBe(g.letterHlKey);
    expect(p.readAlongOn).toBe(true);
    expect(p.readAlongFollow).toBe(false);
    expect(p.mainRef.current.className).toBe('body');
  });

  it('a Format A letter keeps main\'s letter keys and offsets as they are (no map)', () => {
    const seen = [];
    g.ReadAlongHighlight = (p) => { seen.push(p); return null; };
    render(<Host gate={null} />);
    expect(seen[seen.length - 1].offsetMapFn).toBe(null);
  });

  it('renders nothing when bundle-d did not load (no component on window)', () => {
    const { container } = render(<Host gate={null} />);
    expect(container.querySelector('.body')).not.toBe(null);
    expect(stillWashes.pending()).toBe(0);
  });
});

describe("a Format B entry (Words To Live By, The Blessed, Holy Days) on a real boot: keyed and mapped as main's WtlbEntryView", () => {
  /** wtlb-one.js entry 46's second paragraph as the corpus keeps it: a chapter link, two references, blank lines. */
  const GALLOWS = { id: 'building-the-gallows', num: 46, title: 'Building the Gallows', paragraphs: [
    { align: 'center', text: 'Vanity is a rope, and pride builds the gallows;' },
    { align: 'center', text: 'Therefore, beware of the thoughts of your heart,\n\nLest you follow in Haman’s error {{nav:esther:7}}\n\nAnd walk in the way of Cain, {{ref:1 John 3:12}} · {{ref:Genesis 4:8}}\n\nTo your own demise, says The Lord.' },
  ] };
  /** A Holy Days entry: its collection draws a non-trailing reference as a footnote number (main's footnotes mode). */
  const FEAST = { id: 'the-feasts', num: 3, title: 'The Feasts', paragraphs: [
    { align: 'left', text: '**Keep** the feast {{ref:Leviticus 23:4}} with joy,\nand _remember_ Me.' },
  ] };
  const seeded = ['COL_BY_KEY', 'WTLB_ONE', 'HOLY_DAYS'];
  afterEach(() => { for (const k of seeded) delete g[k]; });

  /** The words a timings row [t, para, cs, ce] (corpus offsets) lights on the paragraph v2 drew, through what main got. */
  function lit(container, p, id, para, raw, phrase) {
    const cs = raw.indexOf(phrase);
    const block = container.querySelector('[data-hl-key="' + p.hlKeyFn(id, para) + '"]');
    const map = p.offsetMapFn && p.offsetMapFn(para);
    return block && map ? block.textContent.slice(map(cs), map(cs + phrase.length, true)) : null;
  }

  it("passes main's wtlb:<id>:<i> keys and a corpus-to-page map, so a row lights its own words on the page", () => {
    g.COL_BY_KEY = new Map([
      ['wtlb1', { volKey: 'wtlb1', globalName: 'WTLB_ONE', prefaceGlobal: null, label: 'Words To Live By: Part One', kind: 'wtlb' }],
      ['holydays', { volKey: 'holydays', globalName: 'HOLY_DAYS', prefaceGlobal: null, label: 'Regarding The Holy Days', kind: 'holy-days' }],
    ]);
    g.WTLB_ONE = [GALLOWS];
    g.HOLY_DAYS = [FEAST];
    const seen = [];
    g.ReadAlongHighlight = (p) => { seen.push(p); return null; };
    const a = render(<LetterScreen collection="wtlb1" n={46} />);
    let p = seen[seen.length - 1];
    expect(p.hlKeyFn).toBe(wtlbHlKey);
    expect(p.mainRef.current.querySelector('[data-hl-key="wtlb:building-the-gallows:1"]')).not.toBe(null);
    const raw = GALLOWS.paragraphs[1].text;
    expect(lit(a.container, p, GALLOWS.id, 1, raw, 'And walk in the way of Cain,')).toBe('And walk in the way of Cain,');
    expect(lit(a.container, p, GALLOWS.id, 1, raw, 'To your own demise')).toBe('To your own demise');
    a.unmount();
    // footnotes mode: the reference is drawn as its number, and the map knows it
    const b = render(<LetterScreen collection="holydays" n={3} />);
    p = seen[seen.length - 1];
    expect(b.container.querySelector('[data-hl-key="wtlb:the-feasts:0"]').textContent).toBe('Keep the feast 1 with joy,and remember Me.');
    expect(lit(b.container, p, FEAST.id, 0, FEAST.paragraphs[0].text, 'with joy,')).toBe('with joy,');
    expect(lit(b.container, p, FEAST.id, 0, FEAST.paragraphs[0].text, 'remember')).toBe('remember');
  });
});

describe('a gate boot: a still wash at playing.at, holding the gate until it is painted', () => {
  it('waits for the timings file, paints at the row\'s clock on the body, then lets the gate go', () => {
    const land = syncStore();
    let answer = 'waiting';
    g.paintReadAlongAt = vi.fn(() => answer);
    render(<Host gate={{ playing: PLAYING }} />);
    expect(stillWashes.pending()).toBe(1);
    const call = g.paintReadAlongAt.mock.calls[0][0];
    expect(call).toMatchObject({ volKey: 'one', letterId: 'one-1', time: 231 });
    expect(call.mainEl.className).toBe('body');
    answer = 'painted';
    land();
    expect(stillWashes.pending()).toBe(0);
  });

  it('a letter the gate is not playing paints nothing and holds nothing; so does read-along switched off', () => {
    g.paintReadAlongAt = vi.fn(() => 'painted');
    render(<Host gate={{ playing: { ...PLAYING, item: { collection: 'one', n: 2 } } }} />);
    expect(stillWashes.pending()).toBe(0);
    cleanup();
    render(<Host gate={{ playing: PLAYING }} on={false} />);
    expect(stillWashes.pending()).toBe(0);
    expect(g.paintReadAlongAt).not.toHaveBeenCalled();
  });

  it('holds while the body is not on the page yet, and lets go when it leaves', () => {
    g.paintReadAlongAt = vi.fn(() => 'painted');
    const { unmount } = render(<Host gate={{ playing: PLAYING }} withBody={false} />);
    expect(stillWashes.pending()).toBe(1);
    expect(g.paintReadAlongAt).not.toHaveBeenCalled();
    unmount();
    expect(stillWashes.pending()).toBe(0);
    expect(g.clearReadAlong).toHaveBeenCalled();
  });

  it('a page without main\'s painter (no bundle-d) never holds the gate', () => {
    render(<Host gate={{ playing: PLAYING }} />);
    expect(stillWashes.pending()).toBe(0);
  });
});

/* 2c: a Bible chapter (John 3), the verses carrying main's keys bible:<book>:<ch>:<v> (BibleChapterScreen). */
const JOHN3 = { item: { book: 'john', chapter: 3 }, reader: 'B', at: 19, length: 312, paused: false };

function ChapterHost({ gate, on = true, follow = true, chapter = 3 }) {
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  return (
    <div>
      <div className="body g bible" ref={bodyRef}><p><span data-hl-key={'bible:john:' + chapter + ':1'}>In the beginning.</span></p></div>
      <ChapterReadAlong gate={gate} book="john" chapter={chapter} volKey="bible-brm-kjv" bodyRef={bodyRef} on={on} follow={follow}
        textKey="nkjv:0" />
    </div>
  );
}

describe('gateChapterAt', () => {
  it("is the row's clock on the chapter it plays, and null on any other", () => {
    expect(gateChapterAt({ playing: JOHN3 }, 'john', 3)).toBe(19);
    expect(gateChapterAt({ playing: JOHN3 }, 'john', 4)).toBe(null);
    expect(gateChapterAt({ playing: JOHN3 }, 'luke', 3)).toBe(null);
    expect(gateChapterAt({ playing: PLAYING }, 'john', 3)).toBe(null);
    expect(gateChapterAt(null, 'john', 3)).toBe(null);
  });
});

describe("a chapter on a real boot: main's ReadAlongHighlight with the chapter, as BibleChapterView mounts it", () => {
  it('passes the edition, the book as the letter, the chapter, verse keys and the switches', () => {
    const seen = [];
    g.ReadAlongHighlight = (p) => { seen.push(p); return null; };
    render(<ChapterHost gate={null} follow={false} />);
    const p = seen[seen.length - 1];
    expect(p).toMatchObject({ volKey: 'bible-brm-kjv', letterId: 'john', chapter: 3, readAlongOn: true, readAlongFollow: false,
      textKey: 'nkjv:0' });
    expect(p.hlKeyFn('john', 2)).toBe('bible:john:3:2');
    expect(p.mainRef.current.className).toBe('body g bible');
  });
});

describe('a chapter on a gate boot: verse 2 lit still, from the edition the row plays', () => {
  it("waits for the Bible timings, paints the chapter at the row's clock, then lets the gate go", () => {
    const land = syncStore('__bibleSyncStore');
    let answer = 'waiting';
    g.paintReadAlongAt = vi.fn(() => answer);
    render(<ChapterHost gate={{ playing: JOHN3 }} />);
    expect(stillWashes.pending()).toBe(1);
    const call = g.paintReadAlongAt.mock.calls[0][0];
    // the row plays the Word of Promise NKJV (source.js), whatever edition the reader's settings name
    expect(call).toMatchObject({ volKey: 'bible-wop-nkjv', letterId: 'john', chapter: 3, time: 19 });
    expect(call.hlKeyFn('john', 2)).toBe('bible:john:3:2');
    expect(call.mainEl.className).toBe('body g bible');
    answer = 'painted';
    land();
    expect(stillWashes.pending()).toBe(0);
  });

  it('another chapter, or read-along off, paints nothing and holds nothing', () => {
    g.paintReadAlongAt = vi.fn(() => 'painted');
    render(<ChapterHost gate={{ playing: JOHN3 }} chapter={4} />);
    expect(stillWashes.pending()).toBe(0);
    cleanup();
    render(<ChapterHost gate={{ playing: JOHN3 }} on={false} />);
    expect(stillWashes.pending()).toBe(0);
    expect(g.paintReadAlongAt).not.toHaveBeenCalled();
  });
});
