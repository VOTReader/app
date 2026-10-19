// @ts-nocheck
/**
 * describe's one vocabulary (digest G1, item 22; spec 4.1): the words the web says about the
 * density, the chooser, a group, Timothy's notes and a bundle, and the words it must no longer
 * say. Pure: no graph, no mount. The panel-model test pins the words on the shipped asset; this
 * file pins the drift the digest named.
 *
 *   - the density speaks with its count and one line (Q6): "Famous · 63,418, the full classic
 *     chart" / "Essential · 15,402, the strongest"
 *   - "Nearby" is the Nearby list and nothing else: the chooser's rows are "connections here",
 *     and the list's header never turns into "Under the lens"
 *   - Timothy's links have one name, "Timothy’s notes" ("Timothy’s note" for one), never
 *     "corpus connection" or "Timothy’s thread"
 *   - the density law's leftovers ("n of m ... not drawn here") are gone: nothing is hidden at
 *     rest, so nothing says so
 *   - plurals are right at one
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as ds from './describe.js';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCES = {
  'describe.js': resolve(here, 'describe.js'),
  'panels.jsx': resolve(here, '../../ui/scripture-web/panels.jsx'),
  'ScriptureWebScreen.jsx': resolve(here, '../../ui/screens/ScriptureWebScreen.jsx'),
};
/** The file's text with its comments gone: only what can reach the screen is scanned. */
function spoken(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
}

describe('the density speaks with its count and one line', () => {
  it('Famous is the full classic chart, Essential the strongest', () => {
    expect(ds.densityLine('famous', 63418)).toBe('Famous · 63,418, the full classic chart');
    expect(ds.densityLine('essential', 15402)).toBe('Essential · 15,402, the strongest');
  });
});

describe('"Nearby" is the Nearby list and nothing else', () => {
  it('the chooser counts the connections here, singular at one', () => {
    expect(ds.chooserAnnouncement(3)).toBe('3 connections here. Choose one.');
    expect(ds.chooserAnnouncement(1)).toBe('1 connection here. Choose one.');
  });
  it('the list names the chapter it reads, zoomed in or not', () => {
    const chapter = { book: { title: 'Genesis' }, chapter: 1 };
    expect(ds.listEyebrow('canonical', chapter, true)).toBe('Nearby · Genesis 1');
    expect(ds.listEyebrow('canonical', chapter, false)).toBe('Nearby · Genesis 1');
  });
});

describe('Follow names where it goes as the spec words it (spec 4.6, G1; w3 review)', () => {
  it('"Follow to the other end · <the far end>"', () => {
    expect(ds.followLabel('Luke 1:31')).toBe('Follow to the other end · Luke 1:31');
  });
  /* w4: on a phone the spec's words take a second row of links under the far verse (r2-06 has one
     row), and that row was what kept "Cited in the Volumes" under the fold. Under the far verse,
     "the other end" is where it stands; the short words name it and fit beside "Open in reader". */
  it('on a phone: "Follow to <the far end>"', () => {
    expect(ds.followLabelShort('Luke 1:31')).toBe('Follow to Luke 1:31');
  });
});

describe('plurals are right at one', () => {
  // was pinned on groupAnnouncement, which went with the bundle sheet's group buttons (w3 review);
  // the same law on the bundle's own words
  it('a bundle of one thread, and thousands grouped', () => {
    expect(ds.summaryOf({ kind: 'bundle', label: 'Genesis 1', connections: 1 })).toBe('Genesis 1, 1 connection converges here.');
    expect(ds.summaryOf({ kind: 'bundle', label: 'Genesis 1', connections: 2104 })).toBe('Genesis 1, 2,104 connections converge here.');
  });
});

describe('Timothy’s links have one name', () => {
  const info = { kind: 'underlay', source: { label: 'John 3:16' }, target: { type: 'letter', label: 'A Letter' }, joins: 'Volume Two' };
  it('the eyebrow and the live region say Timothy’s note', () => {
    expect(ds.sheetEyebrow(info)).toBe('Timothy’s note');
    expect(ds.summaryOf(info)).toMatch(/, Timothy’s note\.$/);
  });
});

describe('the density law’s leftovers are gone', () => {
  it('a bundle with threads the old law hid says only how many converge', () => {
    const bundle = { kind: 'bundle', label: 'Genesis 1', hidden: 12, drawn: 8, connections: 20 };
    // and names no control the sheet no longer has (its group buttons went: w3 review)
    expect(ds.sheetMeta(bundle)).toBe('20 connections converge here.');
    expect(ds.summaryOf(bundle)).toBe('Genesis 1, 20 connections converge here.');
  });
});

describe('no drifted word reaches the screen', () => {
  const BANNED = [
    [/silver/i, '"silver": the threads are teal and violet'],
    [/not drawn/i, 'the density law\'s leftover'],
    [/Under the lens/, '"Nearby" means one thing'],
    [/corpus connection/i, 'Timothy\'s notes have one name'],
    [/Timothy(’|&rsquo;|')s thread/, 'Timothy\'s notes have one name'],
    [/My web\b/, '"My Web" is a name'],
    [/Corpus context/, 'Timothy\'s notes have one name'],
    [/bars below/, 'the key names only what the web draws'],
  ];
  it.each(Object.keys(SOURCES))('%s', (name) => {
    const text = spoken(SOURCES[name]);
    expect(text.length, 'the scan read the file').toBeGreaterThan(1000);
    for (const [re, why] of BANNED) expect(text, why).not.toMatch(re);
  });
});
