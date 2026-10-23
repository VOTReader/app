// @ts-nocheck
/* AnswersContents — an Answers topic's "On this page" sheet and rail rows (AOGCG final design f10,
   f10b), and the jump a row makes (U4): it runs only after the sheet has closed and handed focus back
   without scrolling, so nothing undoes it; it brings the heading up, not the top of the page. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { TocRows, AnswersContentsSheet } from './AnswersContents.jsx';
import { AnswersTopic } from './AnswersTopic.jsx';
import { answersTocRows } from '../../utils/answers-topic.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META;
const HD = A.find((e) => e.id === 'regarding-the-holy-days-of-god');
const HM = A.find((e) => e.id === 'regarding-the-holidays-of-men');
const NB = (s) => s.split(String.fromCharCode(160)).join(' ');

/** The app's focus trap, reduced to the ref it hands back (the trap has its own tests). */
function useFocusTrapStub() { return React.useRef(null); }

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.SheetHandle = ({ onClose }) => <button type="button" className="sheet-handle" onClick={onClose}>close</button>;
  globalThis.useFocusTrap = useFocusTrapStub;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.__closeSheet = null;
});
afterEach(() => { cleanup(); ['SheetHandle', 'useFocusTrap', 'StaticSubtree'].forEach((k) => delete globalThis[k]); vi.useRealTimers(); });

describe('AnswersContents — "On this page" (f10)', () => {
  const rows = answersTocRows(HD, M[HD.id]);
  const sheet = (props = {}) => render(
    <AnswersContentsSheet title={HD.title} rows={rows} cur={0} meta="15 sections · 26 passages" foldable={false} foldOn={false}
      onFold={() => {}} onSection={() => {}} onExcerpt={() => {}} onClose={() => {}} {...props} />,
  );

  it('lists every site section with its number and sub; the current one reads "Reading now" with its passages', () => {
    sheet();
    const secs = [...document.querySelectorAll('.ans-toc-sec')];
    expect(secs.length).toBe(15);
    expect(secs[0].querySelector('.ans-num').textContent).toBe('1');
    expect(NB(secs[0].querySelector('.ans-row-sub').textContent)).toBe('7 passages · Reading now');
    expect(secs[0].classList.contains('is-current')).toBe(true);
    expect(NB(secs[8].querySelector('.ans-row-sub').textContent)).toBe('See: 2 links'); // never "0 passages"
    expect(NB(secs[12].querySelector('.ans-row-sub').textContent)).toBe('1 video · audio · PDF');
    // seven passages under the current section: three, then "Show 4 more"
    expect([...document.querySelectorAll('.ans-toc-ex')].map((e) => e.textContent)).toEqual(['“The Holy Days”', '“Embracing The Gift”', '“The Feasts of The Lord”']);
    fireEvent.click(document.querySelector('.ans-toc-more'));
    expect(document.querySelectorAll('.ans-toc-ex').length).toBe(7);
  });

  it('"Show N more" opens the current row only: a new current row starts at three again', () => {
    const many = rows.map((r) => (r.ex.length > 4 ? r : { ...r, ex: rows[0].ex }));
    const pane = (cur) => <TocRows rows={many} cur={cur} withEx={true} onSection={() => {}} onExcerpt={() => {}} />;
    const r = render(pane(0));
    fireEvent.click(document.querySelector('.ans-toc-more'));
    expect(document.querySelectorAll('.ans-toc-ex').length).toBe(7);
    r.rerender(pane(1));
    expect(document.querySelectorAll('.ans-toc-ex').length).toBe(3);
    expect(document.querySelector('.ans-toc-more')).toBeTruthy();
  });

  it('a row says where it goes; a tap names the section (the page jumps), Android Back closes the sheet', () => {
    const onSection = vi.fn(); const onClose = vi.fn(); const onExcerpt = vi.fn();
    sheet({ onSection, onClose, onExcerpt });
    fireEvent.click(document.querySelectorAll('.ans-toc-sec')[2]);
    expect(onSection).toHaveBeenCalledWith(2);
    fireEvent.click(document.querySelectorAll('.ans-toc-ex')[1]);
    expect(onExcerpt).toHaveBeenCalledWith(rows[0].ex[1].at);
    expect(typeof window.__closeSheet).toBe('function');
    act(() => window.__closeSheet());
    expect(onClose).toHaveBeenCalled();
  });

  it('numbers level-2 sections under their parent and indents them (f10b)', () => {
    render(<TocRows rows={answersTocRows(HM, M[HM.id])} cur={2} withEx={false} onSection={() => {}} onExcerpt={() => {}} />);
    const secs = [...document.querySelectorAll('.ans-toc-sec')];
    expect(secs.map((s) => s.querySelector('.ans-num').textContent)).toEqual(['1', '1.1', '1.2', '1.3', '2', '3', '4']);
    expect(secs[1].classList.contains('is-l2')).toBe(true);
    expect(NB(secs[2].querySelector('.ans-row-sub').textContent)).toBe('2 passages · Reading now');
    expect(document.querySelectorAll('.ans-toc-ex').length).toBe(0); // the rail lists no passages
  });

  it('offers Fold only on a topic over 8,000 words', () => {
    sheet({ foldable: true, foldOn: false });
    expect(document.querySelector('input[role="switch"][aria-label="Fold sections"]')).toBeTruthy();
    cleanup();
    sheet();
    expect(document.querySelector('input[role="switch"]')).toBeNull();
  });
});

describe('AnswersTopic — a Contents jump (U4)', () => {
  it('runs after the sheet has closed, and brings up the heading the row names (no pulse)', () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => setTimeout(() => cb(0), 16));
    const seen = [];
    const act2 = { cite: () => {}, source: () => {}, letter: () => {}, jump: (i, o) => seen.push({ i, pulse: o && o.pulse, el: o && o.el, sheetOpen: !!document.querySelector('.ans-sheet') }) };
    const mainRef = { current: null };
    render(<AnswersTopic entry={HD} entries={A} meta={M[HD.id]} metaAll={M} site={null} ready={true} ts2={false} landedPara={-1}
      mainRef={mainRef} isRead={() => false} pathOn={true} findOn={false} act={act2} nav={{}} />);
    fireEvent.click(document.querySelector('.ans-contents-line'));
    const sh = document.querySelector('.ans-sheet');
    expect(sh).toBeTruthy();
    // the sheet's own row: the desktop rail (in the page, so first in document order) lists the same rows
    const row = sh.querySelectorAll('.ans-toc-sec')[2];
    expect(row.closest('.ans-rail')).toBeNull();
    fireEvent.click(row);
    expect(seen).toEqual([]); // not yet: the sheet closes first
    act(() => { vi.advanceTimersByTime(40); });
    expect(seen.length).toBe(1);
    expect(seen[0].sheetOpen).toBe(false);
    expect(seen[0].pulse).toBe(false);
    expect(seen[0].i).toBe(M[HD.id].sections[2].at);
    expect(seen[0].el.id).toBe(M[HD.id].sections[2].anchor); // the heading itself, keyed as its paragraph
    raf.mockRestore();
  });
});
