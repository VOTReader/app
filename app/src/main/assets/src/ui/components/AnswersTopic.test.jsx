// @ts-nocheck
/* AnswersTopic — an Answers topic page (AOGCG final design f07-f11).

   D3 (brief §9): a decorated paragraph's [data-hl-key] textContent equals the undecorated render's,
   and a highlight made on the plain page re-paints on the same words once the decorations are in.
   Five paragraphs from the real corpus, one per decoration: an inline link, an underline, a note
   marker (the fused "Jesus1"), a bare-link glyph and a callout. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersPara } from './AnswersTopic.jsx';
import { answersParaPlan, answersPlainOf, answersHeroMeta } from '../../utils/answers-topic.js';
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
