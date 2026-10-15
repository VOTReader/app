/* v2 letter page: the header lines main shows above the text (LetterView.jsx letter-meta and section-intro-quote), which
   v2 dropped (mw6 gap census, v2-gaps.md A 5-8): rich From lines, the note line, "Addendum to ...", the preamble (the
   question put to The Lord) and the section intro quote. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { LetterScreen } from './LetterScreen.jsx';
import { letterRoute } from '../letter-links.js';

const g = /** @type {any} */ (globalThis);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
/** @type {Array<[string, any]>} */
const COLS = [
  ['timothy', { volKey: 'timothy', globalName: 'T_LETTERS', prefaceGlobal: null, label: 'Letters from Timothy' }],
  ['two', { volKey: 'two', globalName: 'V2_LETTERS', prefaceGlobal: null, label: 'Volume Two' }],
  ['three', { volKey: 'three', globalName: 'V3_LETTERS', prefaceGlobal: null, label: 'Volume Three' }],
];

/** Seeds main's collections with `letters` in Letters from Timothy, plus a few in Volumes Two and Three. */
function seed(letters) {
  g.COL_BY_KEY = new Map(COLS);
  g.T_LETTERS = letters;
  g.V2_LETTERS = [{ id: 'hearts-changed', num: 5, title: 'Hearts Changed', blocks: [para('x')] }];
  g.V3_LETTERS = [{ id: 'judgment-of-god', num: 12, title: 'The Judgment of God', blocks: [para('y')] }];
}

afterEach(() => {
  cleanup();
  for (const k of ['COL_BY_KEY', 'T_LETTERS', 'V2_LETTERS', 'V3_LETTERS', '__loadVotCorpus']) delete g[k];
});

const letter = (extra) => ({ id: 'l1', num: 1, title: 'The Shadow of The Almighty', date: 'June 1, 2008',
  from: 'From The Lord, Our God and Savior', forLine: 'For All Those Who Have Ears to Hear', blocks: [para('Thus says The Lord.')], ...extra });

describe('the header lines main shows above a letter', () => {
  it("a From line kept as rich text opens (Letters from Timothy's 'The Shadow of The Almighty'): its words and its footnote mark", () => {
    seed([letter({ from: [{ t: 'text', v: 'The Interpretation of the Vision Given to Timothy' }, { t: 'fn', v: '1' }] })]);
    const { container } = render(<LetterScreen collection="timothy" n={1} />);
    const meta = container.querySelector('.meta');
    expect(meta.textContent).toContain('The Interpretation of the Vision Given to Timothy');
    expect(meta.querySelector('sup.fn-ref').textContent).toBe('1');
    expect(container.querySelector('.body').textContent).toContain('Thus says The Lord.');
  });

  it('the note line follows the header lines, plain ("(Regarding suicide)") or with a footnote mark', () => {
    seed([letter({ noteLine: '(Regarding suicide)' }),
      { ...letter({ noteLine: [{ t: 'text', v: '(Regarding the state of the dead' }, { t: 'fn', v: '1' }, { t: 'text', v: ')' }] }), num: 2 }]);
    const one = render(<LetterScreen collection="timothy" n={1} />);
    expect(one.container.querySelector('.meta .note').textContent).toBe('(Regarding suicide)');
    cleanup();
    const two = render(<LetterScreen collection="timothy" n={2} />);
    const note = two.container.querySelector('.meta .note');
    expect(note.textContent).toBe('(Regarding the state of the dead1)');
    expect(note.querySelector('sup.fn-ref').textContent).toBe('1');
  });

  it('the preamble, the question put to The Lord, shows under the header lines', () => {
    const q = 'These questions were asked of The Lord: Lord, should we worship the Holy Spirit? Is the Holy Spirit a person?';
    seed([letter({ preamble: q })]);
    const { container } = render(<LetterScreen collection="timothy" n={1} />);
    const p = container.querySelector('.page-head .preamble');
    expect(p.textContent).toBe(q);
    expect(p.hasAttribute('data-hl-key')).toBe(false);
  });

  it('"Addendum to <letter>" opens that letter as a new page (Back returns here)', () => {
    seed([letter({ metaAddendum: 'Hearts Changed', metaAddendumLink: { collection: 'Volume Two', letterTitle: 'Hearts Changed' } }),
      { ...letter({ metaAddendum: 'The Judgment of God', metaAddendumInternal: 'judgment-of-god' }), num: 2 }]);
    const onGo = vi.fn();
    const one = render(<LetterScreen collection="timothy" n={1} onGo={onGo} />);
    const line = one.container.querySelector('.meta .addendum');
    expect(line.textContent).toBe('Addendum to Hearts Changed');
    click(line.querySelector('a'));
    expect(onGo).toHaveBeenLastCalledWith({ place: 'letter', collection: 'two', n: 5 });
    cleanup();
    const two = render(<LetterScreen collection="timothy" n={2} onGo={onGo} />);
    click(two.container.querySelector('.meta .addendum a'));
    expect(onGo).toHaveBeenLastCalledWith({ place: 'letter', collection: 'three', n: 12 });
  });

  it('an addendum known only by its web address opens it outside the app', () => {
    seed([letter({ metaAddendum: 'Grafted In', metaAddendumUrl: 'https://www.thevolumesoftruth.com/Grafted_In' })]);
    const { container } = render(<LetterScreen collection="timothy" n={1} />);
    const a = container.querySelector('.meta .addendum a');
    expect(a.getAttribute('href')).toBe('https://www.thevolumesoftruth.com/Grafted_In');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it("the section intro quote opens the text: main's read-tracker marks (data-read-seg), never a mark anchor", () => {
    seed([letter({ sectionIntro: [{ type: 'heading', text: 'The Word of The Lord' },
      { type: 'para', segments: [{ t: 'italic', v: 'Hear, O Israel.' }] }] })]);
    const { container } = render(<LetterScreen collection="timothy" n={1} />);
    const intro = container.querySelector('.body .intro-quote');
    expect(intro.querySelector('h3').textContent).toBe('The Word of The Lord');
    expect(intro.querySelector('h3').getAttribute('data-read-seg')).toBe('intro-h:0');
    expect(intro.querySelector('p').getAttribute('data-read-seg')).toBe('intro-p:1');
    expect(intro.querySelector('[data-hl-key]')).toBe(null);
    expect(container.querySelector('.body').firstElementChild).toBe(intro);
  });

  it('a letter with none of these shows the header lines alone, as the 1a picture', () => {
    seed([letter({ from: '', spoken: '' })]);
    const { container } = render(<LetterScreen collection="timothy" n={1} />);
    expect(container.querySelector('.meta').innerHTML).toBe('June 1, 2008<br>For All Those Who Have Ears to Hear');
    expect(container.querySelector('.preamble, .intro-quote, .meta .note, .meta .addendum')).toBe(null);
  });
});

describe('letterRoute: a letter named elsewhere in the corpus, as a v2 route', () => {
  it('by collection name and title (quotes and case aside), or by id; null when it is not there', () => {
    seed([]);
    expect(letterRoute({ collection: 'Volume Two', letterTitle: '"hearts changed"' })).toEqual({ place: 'letter', collection: 'two', n: 5 });
    expect(letterRoute({ id: 'judgment-of-god' })).toEqual({ place: 'letter', collection: 'three', n: 12 });
    expect(letterRoute({ collection: 'Volume Nine', letterTitle: 'Hearts Changed' })).toBe(null);
    expect(letterRoute({ id: 'nope' })).toBe(null);
  });
});
