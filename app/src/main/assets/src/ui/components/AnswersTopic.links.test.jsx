// @ts-nocheck
/* AnswersTopic — every link on a topic page opens its own target (acceptance round 1, content lens).

   An "Also see:" line can name several topics ("Regarding the Catholic Church"; "Regarding
   "Another Messiah""; …): each name is its own link, never the first one's. A link that leaves the
   app (a PDF, the TVOT main page) is a real link that opens in the browser, in an "Also see:" line
   and in a False Doctrines "The Truth:" line alike. A Related Topics row naming a letter opens it,
   and a letter link carrying the site's #:~:text= fragment lands the letter on those words.
   The corpus is walked whole, so a new line of either kind is held to the same rule. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersTopic, AnswersPara } from './AnswersTopic.jsx';
import { answersParaPlan, answersFdLines, answersPlainOf } from '../../utils/answers-topic.js';
import { ANSWERS_FD_INDEX_ID } from '../../utils/answers-site.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META;
const byId = new Map(A.map((e) => [e.id, e]));

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.AnnotationStore = { get: () => [] };
  window.NoteStore = { get: () => null };
});
afterEach(() => { cleanup(); delete globalThis.StaticSubtree; delete window.AnnotationStore; delete window.NoteStore; });

/** A page with spies on every hand-off; `calls` collects what a tap asked for. */
function page(entry) {
  const calls = [];
  const nav = {
    openTopic: (id, anchor) => calls.push(['topic', id, anchor]),
    openStudy: (id, url) => calls.push(['study', id, url]),
    searchLibrary: (q) => calls.push(['search', q]),
    openLanding: () => calls.push(['landing']),
    openGroup: (k) => calls.push(['group', k]),
    go: (id) => calls.push(['go', id]),
  };
  const act = {
    cite: (ref) => calls.push(['cite', ref]), jump: (i) => calls.push(['jump', i]), source: (i) => calls.push(['source', i]),
    letter: (t) => calls.push(['letter', t]),
  };
  render(<AnswersTopic entry={entry} entries={A} meta={M[entry.id]} metaAll={M} site={null} ready={true} ts2={false} landedPara={-1}
    mainRef={{ current: null }} isRead={() => false} pathOn={false} findOn={false} act={act} nav={nav} />);
  return calls;
}
const paraEl = (e, i) => document.querySelector('[data-hl-key="wtlb:' + e.id + ':' + i + '"]');

/** What a tap on link L should ask for (null: it lands inside this page). */
function expected(entry, L) {
  if (L.kind === 'topic') return L.id === entry.id && L.anchor ? null : ['topic', L.id, L.anchor || null];
  if (L.kind === 'search') return ['search', L.query];
  if (L.kind === 'study') return ['study', L.id, L.url];
  if (L.kind === 'letter') return 'letter';
  if (L.kind === 'scripture') return ['cite', L.ref];
  return 'external';
}

/** Every "Also see:" paragraph of the corpus: [entry, index, its real links with their sidecar index]. */
const ALSO = [];
for (const e of A) {
  const m = M[e.id] || {};
  for (let i = 0; i < e.paragraphs.length; i++) {
    if (answersParaPlan(e, m, i).kind !== 'alsosee') continue;
    const links = ((m.links || {})[String(i)] || []).map((L, li) => ({ L, li })).filter((x) => x.L.kind !== 'contents');
    ALSO.push([e, i, links]);
  }
}

describe('AnswersTopic — an "Also see:" line opens each of its links', () => {
  it('finds the corpus\'s lines with several links (18 lines, 54 links) and its external one', () => {
    const multi = ALSO.filter(([, , ls]) => ls.length > 1);
    expect(multi.length).toBe(18);
    expect(multi.reduce((n, [, , ls]) => n + ls.length, 0)).toBe(54);
    expect(ALSO.some(([, , ls]) => ls.some((x) => x.L.kind === 'external'))).toBe(true);
  });

  for (const id of [...new Set(ALSO.map(([e]) => e.id))]) {
    it(id + ': every link in every "Also see:" line asks for its own target', () => {
      const e = byId.get(id);
      const calls = page(e);
      for (const [, i, links] of ALSO.filter(([x]) => x.id === id)) {
        const p = paraEl(e, i);
        expect(p, id + ':' + i).toBeTruthy();
        for (const { L, li } of links) {
          const want = expected(e, L);
          if (want === 'external') {
            const a = p.querySelector('a[href="' + L.url + '"]');
            expect(a, id + ':' + i + ' ' + L.url).toBeTruthy();
            expect(a.getAttribute('target')).toBe('_blank');
            expect(a.getAttribute('rel')).toContain('noopener');
            continue;
          }
          const a = p.querySelector('[data-ans="link"][data-l="' + li + '"]');
          expect(a, id + ':' + i + ' link ' + li + ' "' + L.text + '"').toBeTruthy();
          if (links.length > 1) expect(a.textContent).toBe(L.text); // its own words, not the whole line
          calls.length = 0;
          fireEvent.click(a);
          if (want === 'letter') expect(calls[0] && calls[0][0]).toBe('letter');
          else if (want) expect(calls[0]).toEqual(want);
        }
      }
    });
  }

  it('an "Also see:" line keeps its words: the same textContent decorated and plain', () => {
    for (const [e, i] of ALSO) {
      const plain = render(<div><AnswersPara entry={e} meta={null} metaAll={null} byId={byId} i={i} landed={false} first={false} ts2={false} secIdx={null} /></div>);
      const text = plain.container.querySelector('[data-hl-key]').textContent;
      expect(text, e.id + ':' + i).toBe(answersPlainOf(e.paragraphs[i].text));
      cleanup();
      const deco = render(<div><AnswersPara entry={e} meta={M[e.id]} metaAll={M} byId={byId} i={i} landed={false} first={false} ts2={false} secIdx={null} /></div>);
      expect(deco.container.querySelector('[data-hl-key]').textContent, e.id + ':' + i).toBe(text);
      cleanup();
    }
  });
});

describe('AnswersTopic — the False Doctrines index\'s "The Truth:" lines', () => {
  it('each opens its own target; one that leaves the app is a real link to it', () => {
    const e = byId.get(ANSWERS_FD_INDEX_ID);
    const m = M[e.id];
    const calls = page(e);
    let ext = 0, inApp = 0;
    for (let i = 0; i < e.paragraphs.length; i++) {
      if (answersParaPlan(e, m, i).kind !== 'fd') continue;
      const links = (m.links || {})[String(i)] || [];
      const truths = [...paraEl(e, i).querySelectorAll('a.ans-fd-truth')];
      const lines = answersFdLines(e.paragraphs[i].text).filter((ln) => ln.kind === 'truth');
      expect(truths.length).toBe(lines.length);
      lines.forEach((ln, k) => {
        const L = links.find((l) => l.at >= ln.from && l.at < ln.to);
        if (!L) return;
        const a = truths[k];
        if (L.kind === 'external') {
          ext++;
          expect(a.getAttribute('href'), e.id + ':' + i).toBe(L.url);
          expect(a.getAttribute('target')).toBe('_blank');
          return;
        }
        inApp++;
        calls.length = 0;
        fireEvent.click(a);
        const want = expected(e, L);
        if (want === 'letter') expect(calls[0] && calls[0][0], e.id + ':' + i).toBe('letter');
        else expect(calls[0], e.id + ':' + i).toEqual(want);
      });
    }
    expect(ext).toBe(3); // :70 (the Lamb of God PDF), :103 and :129 (TVOT Main_Page)
    expect(inApp).toBeGreaterThan(30);
  });
});

describe('AnswersTopic — letters', () => {
  it('a Related Topics row naming a letter opens it (The Name of The Lord: "One Lord, One God, One Savior")', () => {
    const calls = page(byId.get('the-name-of-the-lord'));
    const row = [...document.querySelectorAll('.ans-foot .ans-row')].find((r) => r.textContent.includes('One Lord, One God, One Savior'));
    expect(row).toBeTruthy();
    fireEvent.click(row);
    expect(calls[0]).toEqual(['letter', { collection: 'Letters from Timothy', letterTitle: 'One Lord, One God, One Savior' }]);
  });

  it('a letter link with the site\'s #:~:text= fragment lands the letter on its first words', () => {
    const e = byId.get('regarding-sacred-names');
    const li = M[e.id].links['30'].findIndex((l) => l.kind === 'letter' && l.textFragment);
    const calls = page(e);
    fireEvent.click(paraEl(e, 30).querySelector('[data-ans="link"][data-l="' + li + '"]'));
    expect(calls[0]).toEqual(['letter', { collection: 'Volume 3', letterTitle: 'Death and Deliverance', excerpt: 'Yet understand this' }]);
  });
});
