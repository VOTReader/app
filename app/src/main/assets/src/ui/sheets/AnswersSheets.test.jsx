// @ts-nocheck - pointer events built by hand
/* AnswersSheets: the Answers dress of the kit sheet (app map fix list). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { AnsSheet } from './AnswersSheets.jsx';
import { SheetHandle } from '../components/SheetHandle.jsx';

const GLOBALS = ['SheetHandle', 'useFocusTrap', 'ReactDOM'];
beforeEach(() => {
  window.SheetHandle = SheetHandle;
  window.useFocusTrap = () => ({ current: null });
  window.ReactDOM = ReactDOM;
});
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; delete window.__closeSheet; });

let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);
const at = (y, t) => { now = t; return { clientY: y, pointerId: 1 }; };

/* Fix list 3: the pill sat two levels inside .ans-sheet-head, so a drag carried the × and title strip
   while the sheet body stayed put. The whole sheet must follow the finger. */
describe('AnsSheet drag', () => {
  it('dragging the pill moves the whole sheet, not only its head', () => {
    render(<AnsSheet label="Test" head={<h2>Head</h2>} onClose={() => {}}><p>Body</p></AnsSheet>);
    const grab = document.querySelector('.sheet-handle-grab');
    const sheet = document.querySelector('.select-sheet');
    const head = document.querySelector('.ans-sheet-head');
    fireEvent.pointerDown(grab, at(100, 0));
    fireEvent.pointerMove(grab, at(140, 400));
    expect(sheet.style.transform).toBe('translateY(40px)');
    expect(head.style.transform).toBe('');
    fireEvent.pointerUp(grab, at(140, 500));
    expect(sheet.style.transform).toBe('');
  });
});
