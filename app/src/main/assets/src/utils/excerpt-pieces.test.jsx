// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract), as LetterView.excerpt-anchor.test.jsx does
/* excerpt-pieces — the link excerpt picker draws each block in the READER's text.
 *
 * An excerpt link stores character offsets into one reader block, and
 * dom-links.js counts them through the reader's DOM to place the link's icon.
 * So every block the picker offers must hold exactly the textContent of the
 * block LetterView renders. It did not: segments glued with '' ("Lord:Many"),
 * letter-links read by `v`, {{ref:…}} left raw ("({{ref:1 John 1:9}})" in
 * Purity Part Three), footnote numbers dropped, poetry lines joined by "\n".
 *
 * As segment-dom-text.test.js and format-b-dom-text.test.js do, the contract
 * is asserted against REAL renders of the real corpus, never against a second
 * copy of the rules: LetterView with the real Segments, block by block. The
 * Format B side is pinned in format-b-dom-text.test.js (formatBDomPieces joins
 * to formatBDomText, which equals a real WtlbEntryView render). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { LetterView } from '../ui/screens/LetterView.jsx';
import { LibraryNav } from '../ui/components/LibraryNav.jsx';
import { Segments } from '../ui/components/Segments.jsx';
import { renderTextWithScripRefs } from './render-text.jsx';
import { segmentRenderText } from './segment-dom-text.js';
import { AudioPlayer } from './audio-player.js';
import { formatBDomText, formatBRefScan } from './format-b-dom-text.js';
import {
  excerptBlocks, letterBlockPieces, piecesDomText, piecesReadText, piecesQuote, formatBFootnotesMode,
} from './excerpt-pieces.js';

vi.mock('../ui/components/ReadAlongHighlight.jsx', () => ({ ReadAlongHighlight: () => null }));

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
/** A corpus file's globals, loaded the way the app loads it (classic-script vars). */
function load(file) {
  const ctx = { window: {} };
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
  return ctx;
}

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'FootnoteSheet', 'FootnoteListSection', 'useMarkAsRead', 'useModalRegistry', 'Segments', 'ProphecyGroup', 'ProphecyExpandToggle',
  'StaticSubtree', 'renderTextWithScripRefs', 'segmentRenderText'];
let realAudio;
beforeEach(() => {
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.FootnoteSheet = () => null;
  globalThis.FootnoteListSection = () => null;   // below the body, outside every block
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  // The REAL renderer, with the two helpers it reads as bundle-d globals.
  globalThis.Segments = Segments;
  globalThis.renderTextWithScripRefs = renderTextWithScripRefs;
  globalThis.segmentRenderText = segmentRenderText;
  globalThis.ProphecyGroup = () => null;
  globalThis.ProphecyExpandToggle = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
  AudioPlayer.hasAudio = () => false;
  AudioPlayer.playLetter = () => {};
  AudioPlayer.prewarm = () => {};
});
afterEach(() => {
  cleanup();
  Object.assign(AudioPlayer, realAudio);
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

/** Each annotatable block's live textContent, by block index, from a real LetterView render. */
function readerBlocks(letter) {
  const shim = { footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null, ...letter };
  const { container } = render(
    <LetterView letter={shim} volKey="one" theme="dark" markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}} />,
  );
  const out = new Map();
  container.querySelectorAll('[data-hl-key][data-hl-dom]').forEach((el) => {
    const m = /:(\d+)$/.exec(el.getAttribute('data-hl-key'));
    if (m) out.set(m[1], el.textContent);
  });
  cleanup();
  return out;
}

describe("THE CONTRACT — each picker block holds the reader's textContent", () => {
  const v1 = load('volume-one.js');
  const v2 = load('volume-two.js');
  const flock = load('letters-flock.js');
  const studies = load('bible-studies.js');
  const holyDays = load('holy-days.js');
  const corpora = {
    'Volume One': [v1.LETTERS_V1_PREFACE, ...v1.LETTERS_V1],
    'Volume Two': v2.LETTERS,
    'Little Flock': [flock.LETTERS_FLOCK_PREFACE, ...flock.LETTERS_FLOCK],
    'Bible studies': studies.BIBLE_STUDIES.flatMap((s) => s.chapters),
    'Holy Days (block entries)': holyDays.HOLY_DAYS.filter((e) => e && e.blocks),
  };

  it.each(Object.keys(corpora))('%s', (name) => {
    const letters = corpora[name].filter((l) => l && l.blocks);
    expect(letters.length).toBeGreaterThan(4);        // the corpus really loaded
    const bad = [];
    let checked = 0;
    for (const letter of letters) {
      const live = readerBlocks(letter);
      for (const b of excerptBlocks(letter)) {
        checked++;
        const want = live.get(b.key);
        const got = piecesDomText(b.pieces);
        if (want !== got) bad.push(`${letter.id} #${b.key}\n    reader: ${JSON.stringify(String(want).slice(0, 90))}\n    picker: ${JSON.stringify(got.slice(0, 90))}`);
      }
      // Every block the reader lets you annotate, the picker offers (image
      // captions aside: the picker has never listed them).
      letter.blocks.forEach((blk, i) => {
        if (live.has(String(i)) && blk.type !== 'study-image' && live.get(String(i)).trim() && !letterBlockPieces(blk).length) bad.push(`${letter.id} #${i} (${blk.type}) is annotatable but not offered`);
      });
    }
    expect(checked).toBeGreaterThan(40);
    expect(bad.slice(0, 5)).toEqual([]);
    expect(bad.length).toBe(0);
  }, 120000);

  it('Purity Part Three reads its reference as the reader shows it, spaced from the sentence', () => {
    const ch = studies.BIBLE_STUDIES.find((s) => /Purity/.test(s.title)).chapters.find((c) => /Part Three/.test(c.title));
    const text = piecesDomText(excerptBlocks(ch)[0].pieces);
    expect(text).toContain('from all unrighteousness. (1 John 1:9)');
    expect(text).not.toContain('{{ref:');
  });
});

describe('the pieces', () => {
  const PARA = { type: 'para', segments: [
    { t: 'bold-italic', v: 'Thus says The Lord:' },
    { t: 'text', v: 'Behold, by their fruits you shall know them.' },
    { t: 'fn', v: '2' },
    { t: 'text', v: 'And was I speaking only of the prophets? (' },
    { t: 'letter-link', label: '"Grafted In"' },
    { t: 'text', v: ')' },
  ] };

  it('carry the collision guard, the footnote number as its own piece, and a letter-link by its label', () => {
    const p = letterBlockPieces(PARA);
    expect(piecesDomText(p)).toBe('Thus says The Lord: Behold, by their fruits you shall know them.2 And was I speaking only of the prophets? ("Grafted In")');
    expect(p.filter((x) => x.fn).map((x) => x.text)).toEqual(['2']);
    expect(piecesReadText(p)).toBe('Thus says The Lord: Behold, by their fruits you shall know them. And was I speaking only of the prophets? ("Grafted In")');
  });

  it('quote a span across a footnote without its number, at offsets in the reader text', () => {
    const p = letterBlockPieces(PARA);
    const dom = piecesDomText(p);
    const start = dom.indexOf('know them');
    const end = dom.indexOf(' only') + ' only'.length;
    expect(piecesQuote(p, start, end)).toBe('know them. And was I speaking only');
  });

  it('draw poetry lines as seams that add no character, read as a space and quoted as a line break', () => {
    const p = letterBlockPieces({ type: 'poetry', lines: [[{ t: 'text', v: 'Come unto Me,' }], [{ t: 'italic', v: 'all ye that labour.' }, { t: 'fn', v: '3' }]] });
    expect(piecesDomText(p)).toBe('Come unto Me,all ye that labour.3');
    expect(p.filter((x) => x.seam)).toHaveLength(1);
    expect(piecesReadText(p)).toBe('Come unto Me, all ye that labour.');
    expect(piecesQuote(p, 0, piecesDomText(p).length - 1)).toBe('Come unto Me,\nall ye that labour.');
  });

  it("draw a segments-only poem one segment per line, each leading \"\\n\" stripped (LetterView's branch)", () => {
    const p = letterBlockPieces({ type: 'poetry', segments: [{ t: 'text', v: 'First line' }, { t: 'text', v: '\nSecond line' }] });
    expect(piecesDomText(p)).toBe('First lineSecond line');
    expect(piecesReadText(p)).toBe('First line Second line');
  });

  it('offer nothing for a heading or an image, and a closing as its text', () => {
    expect(letterBlockPieces({ type: 'heading', text: 'A Heading' })).toEqual([]);
    expect(letterBlockPieces({ type: 'cover-image', src: 'x.webp' })).toEqual([]);
    expect(piecesDomText(letterBlockPieces({ type: 'closing', text: 'I AM THE LORD.' }))).toBe('I AM THE LORD.');
  });
});

describe('Format B entries render their references the way their route does', () => {
  const entry = { paragraphs: [
    { text: 'For it is written:\n\n_Man shall not live by bread alone_ {{ref:Matthew 4:4}} says The Lord.' },
    { text: '**Blessed** are those {{ref:Matthew 5:8}}' },
  ] };

  it('WTLB and The Blessed: "(Ref)" cites, emphasis stripped, soft breaks as seams', () => {
    const blocks = excerptBlocks(entry, false);
    expect(piecesDomText(blocks[0].pieces)).toBe('For it is written:Man shall not live by bread alone (Matthew 4:4) says The Lord.');
    expect(blocks[0].readText).toBe('For it is written:  Man shall not live by bread alone (Matthew 4:4) says The Lord.');
    blocks.forEach((b, i) => expect(piecesDomText(b.pieces)).toBe(formatBDomText(entry.paragraphs[i].text, { footnotesMode: false })));
  });

  it('Holy Days and Answers: footnote numbers, a trailing reference still a cite', () => {
    const blocks = excerptBlocks(entry, true);
    const scan = formatBRefScan(entry.paragraphs, true);
    expect(piecesDomText(blocks[0].pieces)).toBe('For it is written:Man shall not live by bread alone 1 says The Lord.');
    expect(blocks[0].pieces.filter((p) => p.fn).map((p) => p.text)).toEqual(['1']);
    expect(piecesDomText(blocks[1].pieces)).toBe('Blessed are those (Matthew 5:8)');
    blocks.forEach((b, i) => expect(piecesDomText(b.pieces)).toBe(formatBDomText(entry.paragraphs[i].text, { refs: scan.perParagraph[i], footnotesMode: true })));
  });

  it('knows which routes render footnote numbers', () => {
    expect(formatBFootnotesMode('holydays')).toBe(true);
    expect(formatBFootnotesMode('answers')).toBe(true);
    expect(formatBFootnotesMode('wtlb1')).toBe(false);
    expect(formatBFootnotesMode('blessed')).toBe(false);
    expect(formatBFootnotesMode(null)).toBe(false);
  });
});
