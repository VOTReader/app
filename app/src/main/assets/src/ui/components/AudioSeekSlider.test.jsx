// @ts-nocheck — jsdom + free-var globals (bundle-d component contract)

/* AudioSeekSlider — the scrubber that must NOT seek per drag pixel.
   ─────────────────────────────────────────────────────────────────────
   C2-D [D6]. The one shared scrubber for the mini-player bar and the
   listening desk had no tests, and the thing it exists to do is invisible
   from the outside: React's `onChange` on a range input IS the native
   `input` event, so it fires per drag pixel and cannot tell a drag from a
   keystroke. Every one of those pixels used to commit a seek AND a durable
   IDB position write. The pointer flag is the whole mechanism, and nothing
   pinned it.

   Also pinned here: the unknown-duration case. A slider that advertises
   max=0 while its value climbs is the a11y defect already fixed once in
   JournalAudioBlock, and the honest treatment is subtler than clamping —
   the BAR paints empty (a clamped elapsed time would show a full track on
   a recording two minutes in) while the SPOKEN position stays the true
   clock (a screen reader must not announce 0:00 either). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AudioSeekSlider, formatClock } from './AudioSeekSlider.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

let seek;
beforeEach(() => { seek = vi.spyOn(AudioPlayer, 'seek').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const paint = (props) => render(
  <AudioSeekSlider className="audio-bar-seek" ariaLabel="Seek" time={0} duration={600} {...props} />
);
const slider = () => screen.getByRole('slider');
const bubble = () => document.querySelector('.audio-seek-bubble');

describe('formatClock', () => {
  it('pads seconds and leaves minutes uncapped (a 90-minute letter is 90:00)', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(70)).toBe('1:10');
    expect(formatClock(5400)).toBe('90:00');
  });

  it('floors rather than rounds, and refuses to go negative or NaN', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(-30)).toBe('0:00');
    expect(formatClock(undefined)).toBe('0:00');
    expect(formatClock('nonsense')).toBe('0:00');
  });
});

describe('AudioSeekSlider — a drag previews, a release commits', () => {
  it('does NOT seek while the pointer is down, however many values arrive', () => {
    paint({ time: 10 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '100' } });
    fireEvent.change(slider(), { target: { value: '200' } });
    fireEvent.change(slider(), { target: { value: '300' } });
    expect(seek).not.toHaveBeenCalled();
  });

  it('seeks exactly ONCE, with the released value, on pointerup', () => {
    paint({ time: 10 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '200' } });
    fireEvent.change(slider(), { target: { value: '300' } });
    fireEvent.pointerUp(slider());
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(300);
  });

  it('seeks IMMEDIATELY when the value changes with no pointer down (the keyboard path)', () => {
    // Arrow keys / Home / End produce the same onChange with no pointerdown.
    // They must not wait for a pointerup that will never arrive.
    paint({ time: 10 });
    fireEvent.change(slider(), { target: { value: '45' } });
    expect(seek).toHaveBeenCalledWith(45);
  });

  it('commits on lost pointer capture — a finger that slides off the control', () => {
    // A range drag takes implicit pointer capture, so a release outside the
    // element loses the capture instead of delivering a pointerup here.
    paint({ time: 10 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '150' } });
    fireEvent.lostPointerCapture(slider());
    expect(seek).toHaveBeenCalledWith(150);
  });

  it('does not commit twice when both the capture loss and the pointerup arrive', () => {
    paint({ time: 10 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '150' } });
    fireEvent.pointerUp(slider());
    fireEvent.lostPointerCapture(slider());
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it('drops the preview on a cancelled gesture without seeking anywhere', () => {
    const { rerender } = paint({ time: 10 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '400' } });
    expect(slider().value).toBe('400');
    fireEvent.pointerCancel(slider());
    expect(seek).not.toHaveBeenCalled();
    // The store's own position re-asserts itself on the next render.
    rerender(<AudioSeekSlider className="c" ariaLabel="Seek" time={10} duration={600} />);
    expect(slider().value).toBe('10');
  });
});

describe('AudioSeekSlider — the preview bubble', () => {
  it('appears only while scrubbing, and reads the dragged time', () => {
    paint({ time: 10 });
    expect(bubble()).toBeNull();
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '125' } });
    expect(bubble().textContent).toBe('2:05');
    fireEvent.pointerUp(slider());
    expect(bubble()).toBeNull();
  });

  it('is hidden from screen readers — the slider already announces the position', () => {
    paint({ time: 10 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '125' } });
    expect(bubble().getAttribute('aria-hidden')).toBe('true');
  });

  it('tracks the thumb rather than the raw percentage', () => {
    // At 0% the thumb's centre sits half a thumb-width IN from the left edge,
    // so a bubble placed at a bare 0% would hang off the end of the track.
    paint({ time: 50, duration: 100 });   // start off the ends so both drags are real changes
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '0' } });
    const atStart = bubble().style.left;
    fireEvent.change(slider(), { target: { value: '100' } });
    const atEnd = bubble().style.left;
    // (jsdom normalises the calc(): `0.00%` → `0%`, `+ -7.00px` → `- 7.00px`.)
    expect(atStart).toMatch(/^calc\(0(\.00)?%\s*\+\s*7\.00px\)$/);   // pushed IN from the left
    expect(atEnd).toMatch(/^calc\(100(\.00)?%\s*-\s*7\.00px\)$/);    // pulled IN from the right
  });
});

describe('AudioSeekSlider — what it announces', () => {
  it('speaks the position and the length, not two bare numbers', () => {
    paint({ time: 95, duration: 600 });
    expect(slider().getAttribute('aria-label')).toBe('Seek');
    expect(slider().getAttribute('aria-valuetext')).toBe('1:35 of 10:00');
  });

  it('follows the thumb while scrubbing so the announcement matches the bubble', () => {
    paint({ time: 95, duration: 600 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '300' } });
    expect(slider().getAttribute('aria-valuetext')).toBe('5:00 of 10:00');
    expect(bubble().textContent).toBe('5:00');
  });
});

describe('AudioSeekSlider — a recording of unknown length', () => {
  it('never advertises max=0, and disables itself instead', () => {
    paint({ time: 130, duration: 0 });
    expect(slider().getAttribute('max')).toBe('1');
    expect(slider().disabled).toBe(true);
  });

  it('paints EMPTY rather than full — a clamped elapsed time would lie', () => {
    paint({ time: 130, duration: 0 });
    expect(slider().value).toBe('0');
    expect(slider().style.getPropertyValue('--seek-pct')).toBe('0.00%');
  });

  it('still SPEAKS the true clock — 0:00 on a track two minutes in is also a lie', () => {
    paint({ time: 130, duration: 0 });
    expect(slider().getAttribute('aria-valuetext')).toBe('2:10 of unknown length');
  });

  it('clamps a position past the end of a known length', () => {
    paint({ time: 9999, duration: 600 });
    expect(slider().value).toBe('600');
    expect(slider().style.getPropertyValue('--seek-pct')).toBe('100.00%');
  });
});
