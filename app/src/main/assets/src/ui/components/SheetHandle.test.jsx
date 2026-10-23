// @ts-nocheck - pointer events built by hand
/* SheetHandle (U06.8, UX wave 3): the grab pill closes the sheet on a tap, a long enough drag down, or a flick. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SheetHandle, DRAG_CLOSE_PX } from './SheetHandle.jsx';

afterEach(cleanup);

function sheet(onClose) {
  const { container } = render(<div className="note-sheet"><SheetHandle onClose={onClose} /></div>);
  return { grab: container.querySelector('.sheet-handle-grab'), root: container.querySelector('.note-sheet') };
}
let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);
const at = (y, t) => { now = t; return { clientY: y, pointerId: 1 }; };

describe('SheetHandle grab pill', () => {
  it('a tap closes the sheet, as before', () => {
    const onClose = vi.fn();
    fireEvent.click(sheet(onClose).grab);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dragged down far enough it closes; the sheet follows the finger on the way', () => {
    const onClose = vi.fn();
    const { grab, root } = sheet(onClose);
    fireEvent.pointerDown(grab, at(100, 0));
    fireEvent.pointerMove(grab, at(140, 400));
    expect(root.style.transform).toBe('translateY(40px)');
    fireEvent.pointerMove(grab, at(100 + DRAG_CLOSE_PX + 10, 800));
    fireEvent.pointerUp(grab, at(100 + DRAG_CLOSE_PX + 10, 900));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(root.style.transform).toBe('');
  });

  it('a short slow drag settles back and does not count as a tap', () => {
    const onClose = vi.fn();
    const { grab, root } = sheet(onClose);
    fireEvent.pointerDown(grab, at(100, 0));
    fireEvent.pointerMove(grab, at(130, 600));
    fireEvent.pointerUp(grab, at(130, 700));
    fireEvent.click(grab);
    expect(onClose).not.toHaveBeenCalled();
    expect(root.style.transform).toBe('');
  });

  it('a quick flick down closes it though it is short', () => {
    const onClose = vi.fn();
    const { grab } = sheet(onClose);
    fireEvent.pointerDown(grab, at(100, 0));
    fireEvent.pointerMove(grab, at(130, 30));
    fireEvent.pointerUp(grab, at(130, 40));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* n132 (A01.10, A07.5): one close glyph. A sheet's close draws ×, never ‹, so ‹ means only Back in the app;
   a sheet that brings its own glyph (the Answers sheets) still draws that. */
describe('SheetHandle close button', () => {
  it('draws an × by default, not the Back chevron, and is still named Close', () => {
    const { container } = render(<SheetHandle onClose={() => {}} />);
    const btn = container.querySelector('.sheet-handle-back');
    expect(btn.getAttribute('aria-label')).toBe('Close');
    expect(btn.textContent).not.toContain('‹');
    const path = btn.querySelector('svg path');
    expect(path && path.getAttribute('d')).toBe('M6 6l12 12M18 6L6 18');
    expect(btn.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('a glyph passed in still wins', () => {
    const { container } = render(<SheetHandle onClose={() => {}} glyph={<i className="mine" />} />);
    expect(container.querySelector('.sheet-handle-back .mine')).not.toBeNull();
    expect(container.querySelector('.sheet-handle-back svg')).toBeNull();
  });
});
