/* Find in this page (mw7, v2-gaps 13; design dz15 1i): the places a typed word stands in the page's reading blocks, marked,
   the current one gold, stepping and closing; the gate row. Fixture: wtlb-one.js entry 76 as the corpus keeps it. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from './App.jsx';
import { FindStrip } from './FindStrip.jsx';
import { findPattern, markFind, showCurrent, unmarkFind, placesIn, readText, placeFrom, termPlaces } from './find.js';
import { findPlaces } from '../search/snippet.js';
import { GATE_STATES } from './gate.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 200) => act(() => new Promise((r) => { setTimeout(r, ms); }));

const WTLB = { volKey: 'wtlb1', readKey: 'wtlb-one', globalName: 'WTLB_ONE', prefaceGlobal: null, label: 'Words To Live By: Part One', kind: 'wtlb', indexScreen: 'wtlb-one-index' };
/** wtlb-one.js entry 76 as the corpus keeps it. */
const ELECT = { id: 'elect-and-precious', num: 76, title: 'Elect and Precious', paragraphs: [{ align: 'center', text:
  'You are more than the filth that covers you,\n\nMore than the sin that fills you,\n\nMuch more than the choices you make;\n\n'
  + 'For I see your beauty, I know your heart\n\nAnd the love which you have for Me.\n\n\n\nBehold, I know you as you are and will be, '
  + 'with Me where I am.\n\n\n\nYou are not that which you choose in a moment of weakness;\n\nYou are that which I have created, and will '
  + 'become\n\nThat which I restore, and will remain always\n\nA beautiful, finished work, elect and precious,\n\nMy everlasting treasure, '
  + 'even as I shall be yours also.\n\n\n\nFor I know My own, says The Lord.' }] };

function installCorpus() {
  g.COLLECTIONS = [WTLB];
  g.COL_BY_KEY = new Map([['wtlb1', WTLB]]);
  g.WTLB_ONE = Array.from({ length: 149 }, (_x, i) => (i === 75 ? ELECT
    : { id: 'w' + (i + 1), num: i + 1, title: 'Entry ' + (i + 1), paragraphs: [{ align: 'left', text: 'x' }] }));
}

afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'WTLB_ONE', 'VotSearchMini']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

/** A page's body: two verse blocks with numbers, a footnote, italics, and a word outside any block. */
function page() {
  const root = document.createElement('div');
  root.innerHTML = '<h1>More about more</h1><div class="body">'
    + '<p data-hl-key="p:0">You are more than the filth,<sup class="fn-ref">1</sup> evermore <i>More</i> than sin; moreover</p>'
    + '<p><span class="v" data-hl-key="v:1"><span class="vn">1</span>much more</span> <span class="v" data-hl-key="v:2"><span class="vn">2</span>than these</span></p>'
    + '</div>';
  document.body.appendChild(root);
  return root;
}

describe('where a typed word stands (find.js)', () => {
  it('starts a word and runs to the end of what was typed, any case: never inside a word, never a title or a number', () => {
    const root = page();
    const { text } = readText(root);
    expect(text).not.toContain('More about');      // the title is no reading block
    expect(text).not.toMatch(/\d/);                 // footnote and verse numbers left out
    expect(placesIn(text, 'more').map(([a, b]) => text.slice(a, b))).toEqual(['more', 'More', 'more', 'more']);   // "evermore" skipped
    expect(placesIn(text, 'MORE THAN').length).toBe(3);   // a phrase across a verse's end: "more" | "than these"
    expect(findPattern('  ')).toBe(null);
    root.remove();
  });

  it('marks every place (the current gold, the rest underlined) and takes the marks out leaving the text nodes as they were', () => {
    const root = page();
    const p = root.querySelector('p');
    const first = p.firstChild;
    const before = root.innerHTML;
    const { count, marks } = markFind(root, 'more');
    expect(count).toBe(4);
    expect(marks.map((m) => m.map((x) => x.textContent).join(''))).toEqual(['more', 'More', 'more', 'more']);
    showCurrent(marks, 1);
    expect([...root.querySelectorAll('mark.fm')].map((m) => m.className)).toEqual(['fm qm2', 'fm qm', 'fm qm2', 'fm qm2']);
    expect(root.querySelector('i mark.qm')).toBeTruthy();
    unmarkFind(root);
    expect(root.querySelector('mark')).toBe(null);
    expect(root.innerHTML).toBe(before);
    expect(p.firstChild).toBe(first);   // React's own node keeps the whole text again
    expect(first.nodeValue).toBe('You are more than the filth,');
    root.remove();
  });

  it('a landing starts at the first place in or after its block', () => {
    const root = page();
    const { marks } = markFind(root, 'more');
    expect(placeFrom(marks, root.querySelector('[data-hl-key="v:1"]'))).toBe(3);
    expect(placeFrom(marks, root.querySelector('[data-hl-key="p:0"]'))).toBe(0);
    expect(placeFrom(marks, null)).toBe(0);
    unmarkFind(root);
    root.remove();
  });
});

describe('the find strip (1i)', () => {
  it('types, counts, steps with the arrows and Enter, says Not found, and Close takes every mark away', async () => {
    const root = page();
    const ref = { current: root };
    const onClose = vi.fn();
    const { container, unmount } = render(<FindStrip rootRef={ref} noun="entry" onClose={onClose} />);
    const strip = container.querySelector('.fnd');
    expect(strip.getAttribute('aria-label')).toBe('Search words in this entry');
    const input = strip.querySelector('input.q');
    expect(document.activeElement).toBe(input);
    expect(/** @type {HTMLButtonElement} */ (strip.querySelector('button[aria-label="Next place"]')).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'more' } });
    await settle();
    expect(strip.querySelector('.cnt').textContent).toBe('1 of 4');
    expect(root.querySelectorAll('mark.fm').length).toBe(4);
    expect(root.querySelector('mark.qm').textContent).toBe('more');
    click(strip.querySelector('button[aria-label="Next place"]'));
    expect(strip.querySelector('.cnt').textContent).toBe('2 of 4');
    expect(root.querySelector('mark.qm').closest('i')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(strip.querySelector('.cnt').textContent).toBe('1 of 4');
    click(strip.querySelector('button[aria-label="Previous place"]'));
    expect(strip.querySelector('.cnt').textContent).toBe('4 of 4');
    fireEvent.change(input, { target: { value: 'mercy' } });
    await settle();
    expect(strip.querySelector('.cnt').textContent).toBe('Not found');
    expect(root.querySelector('mark')).toBe(null);
    fireEvent.change(input, { target: { value: 'than' } });
    await settle();
    expect(root.querySelectorAll('mark.fm').length).toBe(3);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(root.querySelector('mark')).toBe(null);
    root.remove();
  });

  it('marks the page again when its text arrives after the strip opened, keeping the place', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const { container } = render(<FindStrip rootRef={{ current: root }} noun="letter" start={{ q: 'more' }} onClose={() => {}} />);
    await settle(30);
    expect(container.querySelector('.cnt').textContent).toBe('Not found');
    root.innerHTML = '<p data-hl-key="p:0">more and more</p>';
    await settle(250);
    expect(container.querySelector('.cnt').textContent).toBe('1 of 2');
    expect(root.querySelectorAll('mark.fm').length).toBe(2);
    root.remove();
  });
});

describe("a search landing's strip (v2-gaps 9, 13; main's FindInUnit find: { terms, label })", () => {
  const FILLER = ' And the Lord spoke again and again of many other things to those who would listen to Him in that day.';
  /** Two blocks far apart: "Keep the faith" (the engine's other form) and "keeping faith" (the words as typed). */
  function landingPage() {
    const root = document.createElement('div');
    root.innerHTML = '<div class="body"><p data-hl-key="p:0">Keep the faith, little flock.' + FILLER + FILLER + '</p>'
      + '<p data-hl-key="p:1">' + FILLER.trim() + ' Keeping faith is My command.</p></div>';
    document.body.appendChild(root);
    return root;
  }

  it("termPlaces reads main's places (each hit run to its word's end); none without main's search", () => {
    g.VotSearchMini = { findPlaces };
    const { text } = readText(landingPage());
    const places = termPlaces(text, ['keeping', 'faith', 'keep']);
    expect(places.map((p) => p.map(([a, b]) => text.slice(a, b)))).toEqual([['Keep', 'faith'], ['Keeping', 'faith']]);
    delete g.VotSearchMini;
    expect(termPlaces(text, ['faith'])).toBe(null);
  });

  it('opens with the query as typed, the search\'s places marked (a word each), the landed one current; typing finds the field\'s words', async () => {
    g.VotSearchMini = { findPlaces };
    const root = landingPage();
    const near = root.querySelector('[data-hl-key="p:1"]');
    const nearOff = near.textContent.indexOf('Keeping');
    const { container } = render(<FindStrip rootRef={{ current: root }} noun="letter" onClose={() => {}}
      start={{ q: 'keeping faith', terms: ['keeping', 'faith', 'keep'], near, nearOff }} />);
    await settle(30);
    const strip = container.querySelector('.fnd');
    expect(/** @type {HTMLInputElement} */ (strip.querySelector('input.q')).value).toBe('keeping faith');
    expect(document.activeElement).not.toBe(strip.querySelector('input.q'));   // no keyboard over the landing
    expect(strip.querySelector('.cnt').textContent).toBe('2 of 2');
    expect(Array.from(root.querySelectorAll('mark.qm'), (m) => m.textContent)).toEqual(['Keeping', 'faith']);
    expect(Array.from(root.querySelectorAll('mark.qm2'), (m) => m.textContent)).toEqual(['Keep', 'faith']);
    fireEvent.change(strip.querySelector('input.q'), { target: { value: 'keeping faith ' } });
    await settle();
    expect(strip.querySelector('.cnt').textContent).toBe('1 of 1');   // the field's words now: the phrase as typed
    expect(Array.from(root.querySelectorAll('mark.fm'), (m) => m.textContent)).toEqual(['Keeping faith']);
    root.remove();
  });

  it('a landing in its block\'s second place makes that place current, not the block\'s first', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p data-hl-key="p:0">more here, then <sup class="fn-ref">1</sup>more there</p>';
    const el = root.querySelector('p');
    const { marks } = markFind(root, 'more');
    expect(placeFrom(marks, el, el.textContent.replace('1', '').indexOf('more there'))).toBe(1);
    expect(placeFrom(marks, el, 0)).toBe(0);
  });
});

describe('gate 1i-find', () => {
  it('names the row: entry 76 at its top, Find open with "more"', () => {
    expect(GATE_STATES['1i-find'].open).toEqual({ sheet: 'find', q: 'more' });
    expect(GATE_STATES['1i-find'].stack[2]).toEqual({ place: 'letter', collection: 'wtlb1', n: 76 });
  });

  it('draws the picture: the strip under the top bar with "more" and a caret, 1 of 3, the first place gold', async () => {
    installCorpus();
    const { container } = render(<V2App gateId="1i-find" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle(50);
    const strip = container.querySelector('.v2-phone > .fnd');
    expect(strip).toBeTruthy();
    expect(strip.previousElementSibling.classList.contains('tb')).toBe(true);
    expect(strip.nextElementSibling.classList.contains('content')).toBe(true);
    expect(strip.querySelector('.fld.on .q').textContent).toBe('more');
    expect(strip.querySelector('.caret')).toBeTruthy();
    expect(strip.querySelector('input')).toBe(null);   // no keyboard on a gate boot
    expect(strip.querySelector('.cnt').textContent).toBe('1 of 3');
    expect([...container.querySelectorAll('.body mark.fm')].map((m) => [m.textContent, m.className]))
      .toEqual([['more', 'fm qm'], ['More', 'fm qm2'], ['more', 'fm qm2']]);
    expect([...strip.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Previous place', 'Next place', 'Close']);
  });

  it('Close (and Android Back) takes the strip and its marks away and leaves the page', async () => {
    installCorpus();
    const { container } = render(<V2App gateId="1i-find" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle(50);
    expect(g.handleAndroidBack()).toBe('true');
    await settle(10);
    expect(container.querySelector('.fnd')).toBe(null);
    expect(container.querySelector('.body mark')).toBe(null);
    expect(container.querySelector('h1').textContent).toBe('Elect and Precious');
  });
});
