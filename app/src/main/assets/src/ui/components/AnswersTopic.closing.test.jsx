// @ts-nocheck
/* mw-close (Corbin 2026-10-24: "that says the Lord thing is throughout much of the app, not just that
   letter"). On an Answers page a closing ("_Says The Lord._") with more of the same passage after it
   sat one ordinary paragraph gap above that text (15 on the site's pages). Such a closing now carries
   .letter-closing-mid (clear space, as in letters); one followed by its source line or the ✦ keeps
   the page's own spacing. The corpus is walked whole. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersPara } from './AnswersTopic.jsx';
import { endsOnClosing } from '../../utils/closing-breaks.js';
import { answersParaPlan } from '../../utils/answers-topic.js';

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

const para = (e, i) => render(<div><AnswersPara entry={e} meta={M[e.id]} metaAll={M} byId={byId} i={i} landed={false} first={false} ts2={false} secIdx={null} /></div>)
  .container.querySelector('[data-hl-key]');

describe('endsOnClosing', () => {
  it.each([
    ['_Says The Lord._', true], ['**_Says The Lord YahuShua._**"', true], ['Me...{{ref:Isaiah 45:21}}\n\n_Says The Lord."_', true],
    ['_Says The Lord God._', true],
    ['_Says The Lord whose dominion is everlasting_', false], ['Says The Lord God, and I shall also establish you...', false],
    ['"For I am a Great King! Says The Lord. I am God alone"', false],
  ])('%j -> %s', (raw, want) => { expect(endsOnClosing(raw)).toBe(want); });
});

describe('an Answers closing with more of the passage after it gets clear space', () => {
  const closings = [];
  for (const e of A) e.paragraphs.forEach((p, i) => { if (endsOnClosing(p.text)) closings.push([e, i]); });

  it('walks the corpus: every closing is classed by what follows it', () => {
    expect(closings.length).toBeGreaterThan(250);
    const mids = [], kept = [];
    for (const [e, i] of closings) {
      const el = para(e, i);
      (el.classList.contains('letter-closing-mid') ? mids : kept).push([e, i]);
      cleanup();
    }
    // The reported shape: "Says The Lord." then "Yet understand this also: ..." (Ears to Hear's excerpt).
    expect(mids.map(([e, i]) => e.id + ':' + i)).toContain('regarding-prophets-true:6');
    expect(mids.length).toBe(15);
    // Every closing left as it was is followed by its source line ("~ [From ...]" or "**From:** ..."),
    // a ✦ / ~ ornament, or nothing.
    for (const [e, i] of kept) {
      if (i + 1 >= e.paragraphs.length) continue;
      expect(['src', 'src-ns', 'orn'], e.id + ':' + i).toContain(answersParaPlan(e, M[e.id], i + 1).kind);
    }
  });
});
