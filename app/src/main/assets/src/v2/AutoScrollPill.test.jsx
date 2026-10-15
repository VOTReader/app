/* Auto-scroll (mw7, v2-gaps 13; design dz15 1j; main's AutoScrollControl over main's transport): the pill's words, main's
   settings written as main writes them, the run, auto-continue on the page's Next card, the gate row, the shell's carry
   across a turn and main's Auto-scroll setting. Fixture: Volume One's first two letters, as App.test.jsx. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { AutoScrollPill, autoPrefs, timeLeft, pauseWords, readout, nextCardPager } from './AutoScrollPill.jsx';
import { GATE_STATES } from './gate.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 50) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const labels = (el) => [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent);

const LETTERS = [
  { num: 1, title: 'Chosen by God', date: '8/31/04', from: 'From The Lord, Our God and Savior',
    blocks: [{ type: 'para', segments: [{ t: 'bold-italic', v: 'Thus says The Lord to His servant:' }, { t: 'text', v: 'Many things.' }] }] },
  { num: 2, title: 'Honor Not the Day of the Dead... Honor God', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Honor God.' }] }] },
  { num: 3, title: 'Letter Three', blocks: [] },
];

/** main's StateStore, loaded, holding `settings`. */
function fakeStore(settings = {}) {
  let st = { settings };
  g.StateStore = { isReady: () => true, get: () => st, set: (next) => { st = next; } };
  return () => st.settings;
}

beforeEach(() => {
  g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }]]);
  g.LETTERS_V1 = LETTERS;
});
afterEach(() => {
  cleanup();
  delete g.COL_BY_KEY; delete g.LETTERS_V1; delete g.StateStore;
  delete html.dataset.gate;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the words', () => {
  it("main's settings and defaults: 16 lines/min (4-40), Auto-continue on, 2.5 s (0-15 s)", () => {
    expect(autoPrefs()).toEqual({ lpm: 16, next: true, endMs: 2500, keepOn: true });
    expect(autoPrefs({ autoScrollLpm: '50', autoScrollNext: false, autoScrollEndMs: '-3', keepScreenOn: false }))
      .toEqual({ lpm: 40, next: false, endMs: 0, keepOn: false });
  });

  it("the readout (main's words, seconds only under half a minute): time left while it runs, main's countdown, End of text, else the pace over two lines", () => {
    expect(timeLeft(300000)).toBe('~5 min left');
    expect(timeLeft(41000)).toBe('~1 min left');
    expect(timeLeft(24000)).toBe('~25s left');
    expect(timeLeft(0)).toBe('');
    expect(pauseWords(2500)).toBe('2.5s');
    expect(pauseWords(0)).toBe('None');
    const r = { remainingMs: 300000, countdown: 3, wpm: 104, lpm: 16 };
    expect(readout({ ...r, state: 'running' })).toEqual(['~5 min left']);
    expect(readout({ ...r, state: 'running', remainingMs: 0 })).toEqual(['Reading']);
    expect(readout({ ...r, state: 'enddwell' })).toEqual(['Next in 3']);
    expect(readout({ ...r, state: 'ended' })).toEqual(['End of text']);
    expect(readout({ ...r, state: 'paused' })).toEqual(['~104 wpm', '16 lines/min']);
    expect(readout({ ...r, state: 'idle', wpm: 0 })).toEqual(['16 lines/min']);
  });

  it("auto-continue's page turn is the page's own Next card", () => {
    const root = document.createElement('div');
    const pager = nextCardPager({ current: root });
    expect(pager.peek('next')).toBe(null);
    const card = document.createElement('button');
    card.className = 'nextcard';
    const tapped = vi.fn();
    card.addEventListener('click', tapped);
    root.appendChild(card);
    expect(pager.peek('next')).toEqual({ kind: 'screen' });
    expect(pager.peek('prev')).toBe(null);
    pager.onNext();
    expect(tapped).toHaveBeenCalledTimes(1);
  });
});

/** The pill over a page of `height` px whose text ends `end` px down, a Next card when `next`. */
function pillOn({ next = false, run = false, settings = {}, onClose = () => {} } = {}) {
  const read = fakeStore(settings);
  const root = document.createElement('div');
  root.innerHTML = '<p data-hl-key="p:0">Many things.</p><span class="reading-end"></span>' + (next ? '<button class="nextcard">Next</button>' : '');
  document.body.appendChild(root);
  const turned = vi.fn();
  if (next) root.querySelector('.nextcard').addEventListener('click', turned);
  const ref = { current: root };
  const view = render(<AutoScrollPill scrollRef={ref} placeKey="letter:one:1" ready run={run} gate={null} onClose={onClose} />);
  const pill = () => view.container.querySelector('.asp:not(.dw)');
  return { ...view, root, read, turned, pill, cleanup: () => root.remove() };
}

describe('the pill on a page', () => {
  it("waits paused with the pace; Faster and Slower write autoScrollLpm as main's updateSetting does, off at 40 and 4", async () => {
    const p = pillOn({ settings: { autoScrollLpm: '38' } });
    expect(labels(p.pill())).toEqual(['Slower', 'Start auto-scroll', 'Faster', 'Adjust the pause before the next page', 'Stop auto-scroll']);
    expect(p.pill().querySelector('.pp').getAttribute('aria-pressed')).toBe('false');
    expect(p.pill().querySelector('.asp-r').textContent).toBe('38 lines/min');
    await click(p.pill().querySelector('[aria-label="Faster"]'));
    expect(p.read()).toMatchObject({ autoScrollLpm: '40', touched: { autoScrollLpm: true } });
    expect(p.pill().querySelector('.asp-r').textContent).toBe('40 lines/min');
    expect(p.pill().querySelector('[aria-label="Faster"]').hasAttribute('disabled')).toBe(true);
    for (let i = 0; i < 18; i += 1) await click(p.pill().querySelector('[aria-label="Slower"]'));
    expect(p.read().autoScrollLpm).toBe('4');
    expect(p.pill().querySelector('[aria-label="Slower"]').hasAttribute('disabled')).toBe(true);
    p.cleanup();
  });

  it('the hourglass opens the Pause row and its steps write autoScrollEndMs; no hourglass without Auto-continue', async () => {
    const p = pillOn();
    await click(p.pill().querySelector('[aria-label="Adjust the pause before the next page"]'));
    const row = p.container.querySelector('.asp.dw');
    expect(row.textContent).toBe('Pause2.5s');
    await click(row.querySelector('[aria-label="Longer pause before the next page"]'));
    expect(p.read()).toMatchObject({ autoScrollEndMs: '3000', touched: { autoScrollEndMs: true } });
    expect(p.container.querySelector('.asp.dw').textContent).toBe('Pause3s');
    p.cleanup();
    cleanup();
    const off = pillOn({ settings: { autoScrollNext: false } });
    expect(labels(off.pill())).toEqual(['Slower', 'Start auto-scroll', 'Faster', 'Stop auto-scroll']);
    off.cleanup();
  });

  it('play runs it; at the end of a page with no Next card it stops at "End of text"', async () => {
    const p = pillOn();
    await click(p.pill().querySelector('.pp'));
    expect(p.pill().querySelector('.pp').getAttribute('aria-label')).toBe('Pause auto-scroll');
    await settle(120);
    expect(p.pill().querySelector('.asp-r').textContent).toBe('End of text');
    expect(p.pill().querySelector('.pp').getAttribute('aria-label')).toBe('Start auto-scroll');
    expect(p.turned).not.toHaveBeenCalled();
    p.cleanup();
  });

  it("at the end it counts down main's pause and turns the page on its Next card; Cancel stops the turn", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const p = pillOn({ next: true, run: true, settings: { autoScrollEndMs: '0' } });
    await act(async () => { vi.advanceTimersByTime(200); });
    // the page is shorter than main's least time on a page (4 s): the countdown waits that out
    expect(p.pill().querySelector('.asp-r').textContent).toMatch(/^Next in [34]$/);
    expect(labels(p.pill())).toEqual(['Pause auto-scroll', 'Cancel', 'Adjust the pause before the next page', 'Stop auto-scroll']);
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(p.turned).toHaveBeenCalledTimes(1);
    p.cleanup();
    cleanup();
    const q = pillOn({ next: true, run: true });
    await act(async () => { vi.advanceTimersByTime(200); });
    await click(q.pill().querySelector('.asp-x'));
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(q.turned).not.toHaveBeenCalled();
    expect(q.pill().querySelector('.pp').getAttribute('aria-label')).toBe('Start auto-scroll');
    q.cleanup();
  });

  it('Stop closes it', async () => {
    const onClose = vi.fn();
    const p = pillOn({ onClose });
    await click(p.pill().querySelector('[aria-label="Stop auto-scroll"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    p.cleanup();
  });
});

/** The scroller as a 600 px window on 3000 px of page whose text ends 2320 px down: 1920 px to go, 300 s at 16 lines/min. */
function tallPage() {
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(3000);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(600);
  const rect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function box() {
    if (this.classList && this.classList.contains('reading-end')) return /** @type {DOMRect} */ ({ top: 2320, bottom: 2320, left: 0, right: 0, width: 0, height: 0 });
    return rect.call(this);
  });
}

describe('the shell', () => {
  it('names the row: Letter 1 at its top, auto-scroll open', () => {
    expect(GATE_STATES['1j-auto-scroll'].open).toEqual({ sheet: 'auto-scroll' });
    expect(GATE_STATES['1j-auto-scroll'].stack[2]).toEqual({ place: 'letter', collection: 'one', n: 1 });
  });

  it('draws the picture: the pill over the tab bar, running, frozen, full strength, the time left', async () => {
    tallPage();
    const { container } = render(<V2App gateId="1j-auto-scroll" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle();
    const pill = container.querySelector('.v2-phone > .asp');
    expect(pill.nextElementSibling.classList.contains('tabbar')).toBe(true);
    expect(labels(pill)).toEqual(['Slower', 'Pause auto-scroll', 'Faster', 'Adjust the pause before the next page', 'Stop auto-scroll']);
    expect(pill.querySelector('.pp').getAttribute('aria-pressed')).toBe('true');
    expect(pill.querySelector('.asp-r').textContent).toBe('~5 min left');
    await settle(150);
    expect(container.querySelector('.v2-phone > .content').scrollTop).toBe(0);
    expect(pill.classList.contains('dim')).toBe(false);
    expect(document.body.classList.contains('autoscroll-running')).toBe(false);
  });

  it("a turn on the Next card keeps the pill (stopped: the reader turned it); Back leaves it with its page", async () => {
    const { container } = render(<V2App gateId="1j-auto-scroll" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle();
    await click(container.querySelector('.nextcard'));
    await settle();
    expect(container.querySelector('h1').textContent).toBe('Honor Not the Day of the Dead... Honor God');
    const pill = container.querySelector('.v2-phone > .asp');
    expect(pill).toBeTruthy();
    expect(pill.querySelector('.pp').getAttribute('aria-label')).toBe('Start auto-scroll');
    await click(container.querySelector('.tb button[aria-label^="Back"]'));
    await settle();
    expect(container.querySelector('.asp')).toBe(null);
  });

  it("main's Auto-scroll setting on: the pill waits paused on a letter; Stop takes it off that page", async () => {
    GATE_STATES['t-auto-on'] = { ...GATE_STATES['1a-letter'], facts: { autoScroll: true } };
    try {
      const { container } = render(<V2App gateId="t-auto-on" />);
      await waitFor(() => expect(html.dataset.gate).toBe('ready'));
      await settle();
      const pill = container.querySelector('.v2-phone > .asp');
      expect(pill.querySelector('.pp').getAttribute('aria-label')).toBe('Start auto-scroll');
      await click(pill.querySelector('[aria-label="Stop auto-scroll"]'));
      expect(container.querySelector('.asp')).toBe(null);
    } finally {
      delete GATE_STATES['t-auto-on'];
    }
  });
});
