// @ts-nocheck
/* AnswersTopic — an Answers topic page (AOGCG final design f07-f11).

   D3 (brief §9): a decorated paragraph's [data-hl-key] textContent equals the undecorated render's,
   and a highlight made on the plain page re-paints on the same words once the decorations are in.
   Five paragraphs from the real corpus, one per decoration: an inline link, an underline, a note
   marker (the fused "Jesus1"), a bare-link glyph and a callout. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { useAnswersMetaState } from './AnswersParts.jsx';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersPara, AnswersTopic } from './AnswersTopic.jsx';
import { answersParaPlan, answersPlainOf, answersHeroMeta, answersFoldable, answersTocRows } from '../../utils/answers-topic.js';
import { applyDOMHighlights } from '../../renderer/annotation-engine.jsx';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META;
const byId = new Map(A.map((e) => [e.id, e]));

/** The first plain paragraph (plan 'p') of the corpus the predicate picks. */
function pick(pred) {
  for (const e of A) {
    const m = M[e.id] || {};
    for (let i = 0; i < e.paragraphs.length; i++) if (answersParaPlan(e, m, i).kind === 'p' && pred(m, String(i))) return [e, i];
  }
  throw new Error('no paragraph');
}
const CASES = [
  ['an inline link', pick((m, k) => ((m.links || {})[k] || []).some((l) => l.kind === 'topic')), 'a.letter-link-ref'],
  ['an underline', pick((m, k) => !!((m.marks || {})[k] || {}).u), 'u.ans-u'],
  ['a note marker', [byId.get('regarding-sacred-names'), 23], 'sup.ans-note-ref'],
  ['a bare-link glyph', pick((m, k) => ((m.bareLinks || {})[k] || []).length > 0), 'a.ans-bare'],
  ['a callout', pick((m, k) => !!((m.marks || {})[k] || {}).big), 'span.ans-h2'],
];

let store;
beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  store = {};
  window.AnnotationStore = { get: (k) => store[k] || [] };
  window.NoteStore = { get: () => null };
});
afterEach(() => { cleanup(); delete globalThis.StaticSubtree; delete window.AnnotationStore; delete window.NoteStore; });

const para = (e, i, meta) => render(
  <div><AnswersPara entry={e} meta={meta} metaAll={meta ? M : null} byId={byId} i={i} landed={false} first={false} ts2={false} secIdx={null} /></div>,
).container.querySelector('[data-hl-key]');

/** The character offset of `el`'s first text inside `root` (its textContent domain). */
function offsetOf(root, el) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let off = 0;
  while (w.nextNode()) { if (el.contains(w.currentNode)) return off; off += w.currentNode.nodeValue.length; }
  return off;
}
const painted = (c) => [...c.querySelectorAll('mark.hl-dom')].map((m) => m.textContent).join('');

describe('AnswersTopic — D3: decorations never change a paragraph\'s text', () => {
  for (const [what, [e, i], sel] of CASES) {
    it(what + ' (' + e.id + ':' + i + '): same textContent decorated and plain, and a highlight re-paints on the same words', () => {
      const plain = para(e, i, null);
      const plainText = plain.textContent;
      expect(plainText).toBe(answersPlainOf(e.paragraphs[i].text)); // the old renderer's text
      cleanup();
      const deco = para(e, i, M[e.id]);
      const decoEl = deco.querySelector(sel);
      expect(decoEl).toBeTruthy();
      expect(deco.textContent).toBe(plainText);
      // a highlight over the decorated words (the 12 characters before a glyph, which has none)
      let start = offsetOf(deco, decoEl), end = start + decoEl.textContent.length;
      if (end === start) { end = start; start = Math.max(0, end - 12); }
      const key = deco.getAttribute('data-hl-key');
      const words = plainText.slice(start, end);
      store[key] = [{ id: 'h', groupId: 'h', kind: 'highlight', color: 'yellow', start, end, created: 1, text: words }];
      applyDOMHighlights();
      expect(painted(deco)).toBe(words);
      expect(deco.textContent).toBe(plainText);
      cleanup();
      const plain2 = para(e, i, null);
      applyDOMHighlights();
      expect(painted(plain2)).toBe(words);
    });
  }

  it('the fused "Jesus1" is a superscript note marker, its digit still the text\'s own', () => {
    const el = para(byId.get('regarding-sacred-names'), 23, M['regarding-sacred-names']);
    const sup = el.querySelector('sup.ans-note-ref');
    expect(sup.textContent).toBe('1');
    expect(sup.previousSibling.textContent.endsWith('Jesus')).toBe(true);
  });
});

/* Fold (f10) moves a long topic's paragraphs into and out of their sections' <div class="ans-fold">,
   so React mounts them anew and whatever the annotation engine painted inside them is gone. The page
   says so (window.__hlDomV + 'vot-hl-dom', the signal use-dom-annotation-sync re-runs its pass on), so
   the reader's marks are on the new paragraphs: on the Fold switch, and when find-in-topic lifts it. */
describe('AnswersTopic — a mark survives Fold and find', () => {
  const FE = A.find((e) => answersFoldable(M[e.id]) && answersTocRows(e, M[e.id]).length >= 3);
  const rows = answersTocRows(FE, M[FE.id]);
  // a plain paragraph inside the second section (folded away when Fold is on)
  const at = (() => {
    for (let i = rows[1].at + 1; i < rows[2].at; i++) if (answersParaPlan(FE, M[FE.id], i).kind === 'p') return i;
    throw new Error('no paragraph');
  })();
  const key = 'wtlb:' + FE.id + ':' + at;
  let seen, onDom;
  beforeEach(() => {
    seen = 0;
    // the pass as use-dom-annotation-sync runs it on the signal
    onDom = () => { seen++; applyDOMHighlights(); };
    window.addEventListener('vot-hl-dom', onDom);
    try { localStorage.removeItem('vot-answers-fold'); } catch (_e) { /* none */ }
  });
  afterEach(() => { window.removeEventListener('vot-hl-dom', onDom); try { localStorage.removeItem('vot-answers-fold'); } catch (_e) { /* none */ } });

  const page = (findOn) => (
    <AnswersTopic entry={FE} entries={A} meta={M[FE.id]} metaAll={M} site={null} ready={true} ts2={false} landedPara={-1}
      mainRef={{ current: null }} isRead={() => false} pathOn={false} findOn={findOn} act={{ cite() {}, jump() {}, source() {}, letter() {} }} nav={{}} />
  );
  const el = () => document.querySelector('[data-hl-key="' + key + '"]');

  it('re-paints a highlight after the Fold switch and after find lifts the fold', () => {
    const r = render(page(false));
    const words = el().textContent.slice(0, 12);
    store[key] = [{ id: 'h', groupId: 'h', kind: 'highlight', color: 'yellow', start: 0, end: 12, created: 1, text: words }];
    applyDOMHighlights();
    expect(painted(el())).toBe(words);
    const v0 = window.__hlDomV || 0;

    fireEvent.click(document.querySelector('.ans-rail input[role="switch"]'));
    expect(el().closest('.ans-fold')).toBeTruthy();
    expect(seen).toBe(1);
    expect(window.__hlDomV).toBe(v0 + 1);
    expect(painted(el())).toBe(words);

    r.rerender(page(true)); // a passage hit's find-in-topic opens every section
    expect(el().closest('.ans-fold')).toBeNull();
    expect(seen).toBe(2);
    expect(painted(el())).toBe(words);

    fireEvent.click(document.querySelector('.ans-rail input[role="switch"]')); // Fold off under find: nothing moves
    expect(seen).toBe(2);
  });
});

describe('AnswersTopic — the hero\'s "Loading contents…" ends', () => {
  const E = byId.get('regarding-the-holy-days-of-god');
  const hero = (props) => {
    render(<AnswersTopic entry={E} entries={A} site={null} ready={true} ts2={false} landedPara={-1} mainRef={{ current: null }}
      isRead={() => false} pathOn={false} findOn={false} act={{ cite() {}, jump() {}, source() {}, letter() {} }} nav={{}} {...props} />);
    const p = document.querySelector('.ans-hero .ans-meta');
    return p ? p.textContent : null;
  };
  it('while the sidecars load; never once they are in without this topic\'s row, or could not load', () => {
    expect(hero({ meta: null, metaAll: null })).toBe('Loading contents…');
    cleanup();
    expect(hero({ meta: null, metaAll: { other: {} } })).toBeNull();
    cleanup();
    expect(hero({ meta: null, metaAll: null, metaFailed: true })).toBeNull();
    cleanup();
    expect(hero({ meta: M[E.id], metaAll: M }).split(String.fromCharCode(160)).join(' ')).toContain('26 passages');
  });

  it('the sidecars are tried once more 3 s after a load that left none, then reported failed', async () => {
    vi.useFakeTimers();
    try {
      delete window.ANSWERS_META; // no loader in this host: each load resolves empty
      const seen = [];
      function Probe() { const s = useAnswersMetaState(true); seen.push(s[1]); return null; }
      render(<Probe />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(seen[seen.length - 1]).toBe(false); // not yet: one more try
      window.ANSWERS_META = M; // it lands on the second try
      await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); await Promise.resolve(); });
      expect(seen[seen.length - 1]).toBe(false);
      cleanup();
      delete window.ANSWERS_META;
      seen.length = 0;
      render(<Probe />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); await Promise.resolve(); });
      expect(seen[seen.length - 1]).toBe(true);
    } finally { vi.useRealTimers(); delete window.ANSWERS_META; }
  });
});

describe('AnswersTopic — hero words (f07)', () => {
  it('reads the meta line in words; a page of links says "See: N links", never "0 passages"', () => {
    const NB = (s) => s.split(String.fromCharCode(160)).join(' ');
    expect(NB(answersHeroMeta(byId.get('regarding-the-holy-days-of-god'), M['regarding-the-holy-days-of-god'])))
      .toBe('26 passages · ~31 min · 15 sections · 2 playlists · 1 video · audio · PDF · 2 charts');
    expect(NB(answersHeroMeta(byId.get('regarding-the-trinity'), M['regarding-the-trinity']))).toBe('See: 6 links');
    expect(NB(answersHeroMeta(byId.get('answers-main-page'), M['answers-main-page'])))
      .toBe('12 passages · ~12 min · 6 sections · 2 videos · downloads · YouTube channel');
  });
});
