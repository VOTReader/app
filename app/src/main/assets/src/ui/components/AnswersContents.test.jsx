// @ts-nocheck
/* AnswersContents — the "N sections · M passages" line under an Answers topic's
   title and its Contents sheet (2026-09-25; picture: calls/ux-0925/r3-passages.png). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { AnswersContentsLine } from './AnswersContents.jsx';

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.SheetHandle = ({ onClose }) => <button type="button" className="sheet-handle" onClick={onClose}>close</button>;
  globalThis.useFocusTrap = useFocusTrapStub;
  window.__closeSheet = null;
});
afterEach(() => { cleanup(); delete globalThis.SheetHandle; delete globalThis.useFocusTrap; });

/** The app's focus trap, reduced to the ref it hands back (the trap itself is tested with its own hook). */
function useFocusTrapStub() { return React.useRef(null); }

const P = (text, align = 'justify') => ({ text, align });
const SECTIONED = { id: 't', paragraphs: [
  P('**I AM COME**', 'center'), P('one'), P('~ [From “A” ~ Volume 5]', 'right'),
  P('two'), P('~ [From “B” ~ Volume 4]', 'right'),
  P('**I Shall Return**', 'center'), P('three'), P('~ [From “C” ~ Volume 3]', 'right'),
] };
const PLAIN = { id: 'p', paragraphs: [
  P('one'), P('~ [From “A” ~ Volume 1]', 'right'), P('two'), P('~ [From “B” ~ Volume 2]', 'right'),
  P('three'), P('~ [From “C” ~ The Lord\'s Rebuke]', 'right'),
] };

const line = () => document.querySelector('.answers-contents-line');
const sheet = () => document.querySelector('.answers-contents-sheet');
const rows = () => [...document.querySelectorAll('.answers-contents-row')];

describe('AnswersContentsLine', () => {
  it('says how big the topic is, and names sections only when there are two or more', () => {
    render(<AnswersContentsLine entry={SECTIONED} onJump={() => {}} />);
    expect(line().textContent).toBe('2 sections · 3 passages');
    cleanup();
    render(<AnswersContentsLine entry={PLAIN} onJump={() => {}} />);
    expect(line().textContent).toBe('3 passages');
  });

  it('renders nothing for a topic under three passages', () => {
    render(<AnswersContentsLine entry={{ id: 's', paragraphs: [P('x'), P('~ [From “A” ~ Volume 1]', 'right')] }} onJump={() => {}} />);
    expect(line()).toBeNull();
  });

  it('opens a sheet of its sections with their counts and first sources; a row jumps there and closes it', () => {
    const onJump = vi.fn();
    render(<AnswersContentsLine entry={SECTIONED} onJump={onJump} />);
    act(() => { fireEvent.click(line()); });
    expect(sheet()).not.toBeNull();
    expect(sheet().getAttribute('role')).toBe('dialog');
    expect(rows().map((r) => r.querySelector('.answers-contents-row-title').textContent)).toEqual(['I AM COME2', 'I Shall Return1']);
    expect(rows()[0].querySelector('.answers-contents-row-sub').textContent).toBe('A · B');
    act(() => { fireEvent.click(rows()[1]); });
    expect(onJump).toHaveBeenCalledWith(5);      // the section's heading paragraph
    expect(sheet()).toBeNull();
  });

  it('with no named sections, lists the passages by source and jumps to where each begins', () => {
    const onJump = vi.fn();
    render(<AnswersContentsLine entry={PLAIN} onJump={onJump} />);
    act(() => { fireEvent.click(line()); });
    expect(rows().map((r) => r.querySelector('.answers-contents-row-sub').textContent)).toEqual(['Volume 1', 'Volume 2', "The Lord's Rebuke"]);
    act(() => { fireEvent.click(rows()[2]); });
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('Android Back closes it through window.__closeSheet, and the previous handler comes back', () => {
    const prior = () => {};
    window.__closeSheet = prior;
    render(<AnswersContentsLine entry={PLAIN} onJump={() => {}} />);
    act(() => { fireEvent.click(line()); });
    expect(typeof window.__closeSheet).toBe('function');
    expect(window.__closeSheet).not.toBe(prior);
    act(() => { window.__closeSheet(); });
    expect(sheet()).toBeNull();
    expect(window.__closeSheet).toBe(prior);
  });
});
