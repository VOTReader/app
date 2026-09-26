/* segment-dom-text — the anti-drift gate.
 *
 * Read-along offsets are measured OFFLINE (tools/extract-audio-fragments.mjs
 * calls segmentsDomText) and painted at RUNTIME into the DOM that Segments
 * builds. One character of disagreement slides the highlight into the
 * neighbouring clause — which is exactly what shipped: the extractor joined
 * segments with '' while Segments injects a collision-guard space, so 623 of
 * 1,041 Format A blocks were off by up to 13 characters (owner report,
 * 2026-08-12). The contract is therefore asserted against a REAL render, never
 * against a second copy of the rules. */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { segmentsDomText, segmentRenderText, segmentsReadText, blockReadText } from './segment-dom-text.js';
import { renderTextWithScripRefs } from './render-text.jsx';
import { Segments } from '../ui/components/Segments.jsx';

// Segments.jsx is bundle-d and reads these as classic-script globals (see
// ui/_entry-d.js), which is also how it resolves them in the app.
beforeAll(() => {
  /** @type {any} */ (globalThis).renderTextWithScripRefs = renderTextWithScripRefs;
  /** @type {any} */ (globalThis).segmentRenderText = segmentRenderText;
});
afterEach(cleanup);

/** The text a reader's DOM actually contains for this run of segments. */
function renderedText(segments) {
  const { container } = render(
    React.createElement('p', null,
      React.createElement(/** @type {any} */ (Segments), { segments, onFnClick() {}, onScripClick() {} })),
  );
  return container.textContent;
}

const CASES = {
  'guard fires between a colon and a word': [
    { t: 'bold-italic', v: 'Thus says The Lord:' },
    { t: 'text', v: 'Many things you must overcome.' },
  ],
  'guard does NOT fire before trailing punctuation': [
    { t: 'text', v: 'a word' },
    { t: 'text', v: ', and more' },
  ],
  'guard does not double an existing space': [
    { t: 'text', v: 'Thus says The Lord: ' },
    { t: 'text', v: 'Peoples of the earth' },
  ],
  'footnote marker contributes its number': [
    { t: 'text', v: 'be set free!' },
    { t: 'fn', v: '1' },
    { t: 'text', v: 'THEY KILLED THE AUTHOR OF LIFE!' },
  ],
  'stanza break contributes nothing': [
    { t: 'text', v: 'line one' },
    { t: 'stanza-break' },
    { t: 'italic', v: 'line two' },
  ],
  'bracketed opener takes the space': [
    { t: 'text', v: '[The Lord answered]' },
    { t: 'text', v: 'In regards to the day' },
  ],
  'curly-quote opener takes the space': [
    { t: 'text', v: 'He said:' },
    { t: 'text', v: '“Come to Me”' },
  ],
  'caps segment': [
    { t: 'text', v: 'and I say:' },
    { t: 'caps', v: 'I AM HE' },
  ],
  'empty run': [],
};

describe('segmentsDomText is the domain Segments renders', () => {
  for (const [name, segments] of Object.entries(CASES)) {
    it(name, () => {
      expect(segmentsDomText(segments)).toBe(renderedText(segments));
    });
  }

  it('a mid-block offset selects the same characters in both domains', () => {
    // The wild failure mode: cs/ce measured offline must address the same
    // characters once the DOM exists.
    const segments = CASES['guard fires between a colon and a word'];
    const domain = segmentsDomText(segments);
    const cs = domain.indexOf('Many');
    expect(cs).toBeGreaterThan(0);
    expect(renderedText(segments).slice(cs, cs + 4)).toBe('Many');
  });

  it('segmentRenderText is the guard itself', () => {
    const segs = [{ t: 'text', v: 'end.' }, { t: 'text', v: 'Next' }];
    expect(segmentRenderText(segs, 0)).toBe('end.');
    expect(segmentRenderText(segs, 1)).toBe(' Next');
  });

  it('keeps a quote mark on its words across a segment seam (v14-corpus-01)', () => {
    const run = (a, b) => segmentRenderText([{ t: 'text', v: a }, { t: 'italic', v: b }], 1);
    expect(run('turn from it: "', 'I will set')).toBe('I will set');     // opening straight quote
    expect(run('“', 'Many of them that')).toBe('Many of them that');      // a lone opening curly quote
    expect(run('your Seed,', '" who is Messiah')).toBe('" who is Messiah'); // closing quote
    expect(run('RIGHTEOUSNESS.', '” - {{ref:Jeremiah 23:6}}')).toBe('” - {{ref:Jeremiah 23:6}}');
    expect(run('He said', '"Come')).toBe(' "Come');                      // a quote that OPENS still gets its space
    expect(run('said:', 'Come')).toBe(' Come');
  });

  it('letter-link contributes its label, not its v', () => {
    expect(segmentsDomText([{ t: 'letter-link', label: 'Grafted In', v: 'ignored' }]))
      .toBe('Grafted In');
  });
});

/* The READER's text — the search index's domain (index-builder letterText,
   LetterView's excerpt landing): the rendered text with the footnote markers
   taken out, asserted against a real render with its .fn-ref spans removed. */
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
function renderedTextWithoutFootnotes(segments) {
  const { container } = render(
    React.createElement('p', null,
      React.createElement(/** @type {any} */ (Segments), { segments, onFnClick() {}, onScripClick() {} })),
  );
  container.querySelectorAll('.fn-ref').forEach((el) => el.remove());
  return container.textContent;
}

describe('segmentsReadText is the rendered text without its footnote numbers', () => {
  for (const [name, segments] of Object.entries(CASES)) {
    if (name === 'stanza break contributes nothing') continue; // reads as a space: asserted below
    it(name, () => {
      expect(squash(segmentsReadText(segments))).toBe(squash(renderedTextWithoutFootnotes(segments)));
    });
  }

  it('drops a footnote number without gluing or doubling its neighbours', () => {
    // Volume One, Letter 15: a poetry line ends in footnote 2.
    expect(segmentsReadText([{ t: 'italic', v: 'Thus by their fruits you shall know them.' }, { t: 'fn', v: '2' }]))
      .toBe('Thus by their fruits you shall know them.');
    expect(segmentsReadText([{ t: 'text', v: 'be set free!' }, { t: 'fn', v: '1' }, { t: 'text', v: 'THEY' }]))
      .toBe('be set free! THEY');
    expect(segmentsReadText([{ t: 'text', v: 'by their fruits' }, { t: 'fn', v: '1' }, { t: 'text', v: ', by the darkness' }]))
      .toBe('by their fruits, by the darkness');
  });

  it('reads a letter-link by its label, a stanza break as a space, a scripture ref as the reference', () => {
    expect(segmentsReadText([{ t: 'text', v: 'says The Lord. (' }, { t: 'letter-link', label: '"Blessed Be The Name"' }, { t: 'text', v: ')' }]))
      .toBe('says The Lord. ("Blessed Be The Name")');
    expect(squash(segmentsReadText(CASES['stanza break contributes nothing']))).toBe('line one line two');
    expect(segmentsReadText([{ t: 'text', v: 'the scepter of Your kingdom. - {{ref:Psalm 45:6}}' }]))
      .toBe('the scepter of Your kingdom. - Psalm 45:6');
  });

  it('blockReadText joins poetry lines with a space and reads a heading as nothing', () => {
    expect(blockReadText({ lines: [[{ t: 'text', v: 'Line one,' }], [{ t: 'text', v: 'line two.' }, { t: 'fn', v: '3' }]] }))
      .toBe('Line one, line two.');
    expect(blockReadText({ type: 'heading', text: 'A Heading' })).toBe('');
    expect(blockReadText(null)).toBe('');
  });
});
