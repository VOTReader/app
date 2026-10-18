// @ts-nocheck
/* Where the docked panel sits and what it covers (spec section 3, Q12) and the inset's one writer
   (CONTRACTS.md section 5): the numbers, then the hooks on a root of a given size. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  panelLayout, insetOf, collapsedFor, usePanelLayout, usePanelInset, SHEET_BELOW, COLLAPSE_BELOW,
} from './use-panel-layout.js';

describe('panelLayout: the spec\'s numbers from the root\'s own box', () => {
  it('PC: clamp(420px, 40vw, 780px)', () => {
    expect(panelLayout(1600, 900)).toMatchObject({ panelW: 640, compact: false, sheet: false, narrow: false, gutter: 24 });
    expect(panelLayout(1920, 1080).panelW).toBe(768); // spec 3: "768 at 1920"
    expect(panelLayout(2560, 1440).panelW).toBe(780);
    expect(panelLayout(900, 700).panelW).toBe(420);
  });

  it('compact (root height <= 500): max(340px, 42vw); phone landscape 891x411 docks right', () => {
    expect(panelLayout(891, 411)).toMatchObject({ panelW: 374, compact: true, sheet: false, gutter: 16 }); // "374 at 891"
    expect(panelLayout(640, 360).panelW).toBe(340);
    expect(panelLayout(1600, 500).compact).toBe(true);
    expect(panelLayout(1600, 501).compact).toBe(false);
  });

  it('below 560 px wide it is a bottom sheet the width of the root', () => {
    const l = panelLayout(SHEET_BELOW - 1, 800);
    expect(l).toMatchObject({ sheet: true, narrow: true, panelW: SHEET_BELOW - 1, sheetH: 480 });
    expect(panelLayout(SHEET_BELOW, 800)).toMatchObject({ sheet: false, narrow: true });
    expect(panelLayout(400, 1200).sheetH).toBe(560);
  });

  it('an unmeasured root has no layout', () => {
    expect(panelLayout(0, 600)).toBeNull();
    expect(panelLayout(800, 0)).toBeNull();
  });
});

describe('insetOf and collapsedFor', () => {
  it('the inset is the docked width, or the sheet height, and nothing while closed', () => {
    expect(insetOf(panelLayout(1600, 900), true)).toEqual({ right: 640, bottom: 0 });
    expect(insetOf(panelLayout(1600, 900), false)).toEqual({ right: 0, bottom: 0 });
    expect(insetOf(panelLayout(500, 800), true)).toEqual({ right: 0, bottom: 480 });
    expect(insetOf(null, true)).toEqual({ right: 0, bottom: 0 });
  });

  it('the controls collapse while the canvas area is under 1000 px', () => {
    expect(collapsedFor(panelLayout(1920, 1080), true)).toBe(false); // 1152 px of canvas
    expect(collapsedFor(panelLayout(1600, 900), true)).toBe(true);   // 960: spec 3's rule, not r2-02's picture
    expect(collapsedFor(panelLayout(1600, 900), false)).toBe(false);
    expect(collapsedFor(panelLayout(COLLAPSE_BELOW - 1, 700), false)).toBe(true);
    expect(collapsedFor(panelLayout(891, 411), true)).toBe(true);
    expect(collapsedFor(null, true)).toBe(false);
  });
});

/** A root element of a given size (jsdom lays nothing out). */
function rootOf(w, h) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => h });
  document.body.appendChild(el);
  return el;
}

describe('the hooks', () => {
  it('usePanelLayout reads the root, and insetFor says what the panel WILL cover', () => {
    const wrapRef = { current: rootOf(1600, 900) };
    const { result } = renderHook(() => usePanelLayout(wrapRef));
    expect(result.current.layout).toMatchObject({ w: 1600, h: 900, panelW: 640 });
    expect(result.current.insetFor()).toEqual({ right: 640, bottom: 0 });
    wrapRef.current.remove();
  });

  it('usePanelInset writes the inset on open and close, schedules a frame on a change, and sets --sw-panel-w', () => {
    const el = rootOf(1600, 900);
    const wrapRef = { current: el };
    const panelInsetRef = { current: { right: 0, bottom: 0 } };
    const schedule = vi.fn();
    const layout = panelLayout(1600, 900);
    const { rerender } = renderHook(({ open }) => usePanelInset({ layout, open, panelInsetRef, wrapRef, schedule }),
      { initialProps: { open: false } });
    expect(panelInsetRef.current).toEqual({ right: 0, bottom: 0 });
    expect(schedule).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue('--sw-panel-w')).toBe('640px');
    rerender({ open: true });
    expect(panelInsetRef.current).toEqual({ right: 640, bottom: 0 });
    expect(schedule).toHaveBeenCalledTimes(1);
    rerender({ open: true });
    expect(schedule).toHaveBeenCalledTimes(1); // no change, no frame
    rerender({ open: false });
    expect(panelInsetRef.current).toEqual({ right: 0, bottom: 0 });
    expect(schedule).toHaveBeenCalledTimes(2);
    el.remove();
  });
});
