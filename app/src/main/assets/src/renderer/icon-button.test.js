// @ts-nocheck — DOM fixtures, jsdom keyboard events
/* Item 9 (queue/votreader-tests): first tests of icon-button.js — the
   inline note, bookmark and link icons as named buttons (W65): the DOM
   shape, the React props shape, and where a keyboard-opened popover goes. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeIconButton, iconButtonProps, iconPoint } from './icon-button.js';

const keyEvent = (key) => new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

afterEach(() => { document.body.innerHTML = ''; });

describe('makeIconButton', () => {
  const iconEl = () => {
    document.body.innerHTML = '<span class="hl-note-icon"><svg></svg><svg></svg></span>';
    return document.querySelector('.hl-note-icon');
  };

  it('makes the icon a named button with a Tab stop', () => {
    const el = iconEl();
    makeIconButton(el, 'Open note', vi.fn());
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-label')).toBe('Open note');
  });

  it('takes every svg out of the accessibility tree', () => {
    const el = iconEl();
    makeIconButton(el, 'Open note', vi.fn());
    el.querySelectorAll('svg').forEach((s) => {
      expect(s.getAttribute('aria-hidden')).toBe('true');
      expect(s.getAttribute('focusable')).toBe('false');
    });
  });

  it('Enter runs activate and neither scrolls nor reaches the text', () => {
    const el = iconEl();
    const parentHeard = vi.fn();
    el.parentElement.addEventListener('keydown', parentHeard);
    const activate = vi.fn();
    makeIconButton(el, 'Open note', activate);
    const ev = keyEvent('Enter');
    expect(el.dispatchEvent(ev)).toBe(false); // preventDefault was called
    expect(ev.defaultPrevented).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith(ev);
    expect(parentHeard).not.toHaveBeenCalled(); // stopPropagation
  });

  it('Space runs activate the same way', () => {
    const el = iconEl();
    const activate = vi.fn();
    makeIconButton(el, 'Open note', activate);
    const ev = keyEvent(' ');
    expect(el.dispatchEvent(ev)).toBe(false);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('other keys do nothing: no activate, no preventDefault, the key reaches the text', () => {
    const el = iconEl();
    const parentHeard = vi.fn();
    el.parentElement.addEventListener('keydown', parentHeard);
    const activate = vi.fn();
    makeIconButton(el, 'Open note', activate);
    expect(el.dispatchEvent(keyEvent('Tab'))).toBe(true);
    expect(el.dispatchEvent(keyEvent('a'))).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    expect(parentHeard).toHaveBeenCalledTimes(2);
  });
});

describe('iconButtonProps', () => {
  it('returns the same named-button shape as props', () => {
    const props = iconButtonProps('Open 2 links', vi.fn());
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
    expect(props['aria-label']).toBe('Open 2 links');
    expect(typeof props.onKeyDown).toBe('function');
  });

  it('onKeyDown runs activate on Enter and Space, with preventDefault and stopPropagation', () => {
    const activate = vi.fn();
    const props = iconButtonProps('Open bookmark', activate);
    for (const key of ['Enter', ' ']) {
      const e = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() };
      props.onKeyDown(e);
      expect(e.preventDefault).toHaveBeenCalledTimes(1);
      expect(e.stopPropagation).toHaveBeenCalledTimes(1);
      expect(activate).toHaveBeenCalledWith(e);
    }
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('onKeyDown ignores other keys entirely', () => {
    const activate = vi.fn();
    const props = iconButtonProps('Open link', activate);
    const e = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    props.onKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('iconPoint', () => {
  it('puts the popover just under the icon, centred on it', () => {
    document.body.innerHTML = '<span id="i"></span>';
    const el = document.getElementById('i');
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 20, height: 16, bottom: 36, right: 30, x: 10, y: 20, toJSON: () => ({}) });
    expect(iconPoint(el)).toEqual({ x: 20, y: 40 });
  });

  it('falls back to the jsdom zero rect: x 0, y 4', () => {
    document.body.innerHTML = '<span id="i"></span>';
    expect(iconPoint(document.getElementById('i'))).toEqual({ x: 0, y: 4 });
  });
});
