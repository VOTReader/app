// @ts-nocheck — drives the toast DOM primitive in jsdom
/* toast — the transient notification primitive. Pins SEC-2: `opts.text` is set via
   textContent (SAFE — cannot inject markup), and `opts.html` (innerHTML) is reserved
   for TRUSTED static markup only. This is the guard against a future caller passing
   user/corpus text into the innerHTML sink. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { showToast, hideToast, _resetToasts } from './toast.js';

afterEach(() => _resetToasts());

describe('toast — SEC-2 (text via textContent is injection-safe)', () => {
  it('opts.text sets textContent — a markup/script string is NOT parsed as HTML', () => {
    showToast({ id: 'vot-toast-test', text: '<img src=x onerror="globalThis.__xss=1"> & <b>bold</b>', durationMs: 0 });
    const el = document.getElementById('vot-toast-test');
    expect(el).toBeTruthy();
    // textContent path → no child elements are created from the string
    expect(el.querySelector('img')).toBe(null);
    expect(el.querySelector('b')).toBe(null);
    // and the raw string is shown verbatim as text
    expect(el.textContent).toContain('<img src=x');
    expect(el.textContent).toContain('<b>bold</b>');
    expect(globalThis.__xss).toBeUndefined();
  });

  it('opts.text takes precedence over opts.html', () => {
    showToast({ id: 'vot-toast-test', text: 'plain', html: '<b>markup</b>', durationMs: 0 });
    const el = document.getElementById('vot-toast-test');
    expect(el.querySelector('b')).toBe(null);
    expect(el.textContent).toBe('plain');
  });

  it('opts.html still renders TRUSTED static markup (the toasts that need <b>/<button>)', () => {
    showToast({ id: 'vot-toast-test', html: 'New version — <b>tap</b>', durationMs: 0 });
    const el = document.getElementById('vot-toast-test');
    expect(el.querySelector('b')).toBeTruthy();
    expect(el.querySelector('b').textContent).toBe('tap');
  });
});

describe('toast — lifecycle', () => {
  it('shows (.show class) then hides on hideToast', () => {
    showToast({ id: 'vot-toast-test', text: 'hi', durationMs: 0 });
    const el = document.getElementById('vot-toast-test');
    expect(el.classList.contains('show')).toBe(true);
    hideToast('vot-toast-test');
    expect(el.classList.contains('show')).toBe(false);
  });

  it('reuses the element by id (no duplicate nodes on re-show)', () => {
    showToast({ id: 'vot-toast-test', text: 'a', durationMs: 0 });
    showToast({ id: 'vot-toast-test', text: 'b', durationMs: 0 });
    expect(document.querySelectorAll('#vot-toast-test').length).toBe(1);
    expect(document.getElementById('vot-toast-test').textContent).toBe('b');
  });

  it('sets role=status + aria-live for screen readers', () => {
    showToast({ id: 'vot-toast-test', text: 'hi', ariaLive: 'assertive', durationMs: 0 });
    const el = document.getElementById('vot-toast-test');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('assertive');
  });
});

/* W55 (sweep 2026-10-13): hideToast only drops .show, so a faded action toast kept its live controls. The
   CSS (.vot-toast-action:not(.show)) stops the pointer; these stop the keyboard and the caller's own
   wiring (the update toast IS its button, so its listeners must go when it fades). */
describe('toast — a hidden toast is no target (W55)', () => {
  it('hiding disables the buttons inside; the next show brings fresh, live ones', () => {
    showToast({ id: 'vot-toast-test', className: 'vot-toast vot-toast-action', html: 'Msg <button type="button">Go</button>', durationMs: 0 });
    const el = document.getElementById('vot-toast-test');
    expect(el.querySelector('button').disabled).toBe(false);
    hideToast('vot-toast-test');
    expect(el.querySelector('button').disabled, 'a faded button is out of Tab order and takes no Enter').toBe(true);
    showToast({ id: 'vot-toast-test', className: 'vot-toast vot-toast-action', html: 'Msg <button type="button">Go</button>', durationMs: 0 });
    expect(el.querySelector('button').disabled).toBe(false);
  });

  it('onHide runs once when the showing ends: hideToast, the timer, or the next show of the same id', () => {
    vi.useFakeTimers();
    try {
      const a = vi.fn();
      showToast({ id: 'vot-toast-test', text: 'a', durationMs: 0, onHide: a });
      hideToast('vot-toast-test');
      hideToast('vot-toast-test');
      expect(a, 'hideToast, once').toHaveBeenCalledTimes(1);

      const b = vi.fn();
      showToast({ id: 'vot-toast-test', text: 'b', durationMs: 3000, onHide: b });
      vi.advanceTimersByTime(3000);
      expect(b, 'the auto-hide timer').toHaveBeenCalledTimes(1);

      const c = vi.fn();
      showToast({ id: 'vot-toast-test', text: 'c', durationMs: 0, onHide: c });
      showToast({ id: 'vot-toast-test', text: 'd', durationMs: 0 });
      expect(c, 'replaced by the next show of the same id').toHaveBeenCalledTimes(1);
      hideToast('vot-toast-test');
      expect(c, 'the next showing carries no old callback').toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* n198: the ARIA attributes are reapplied on every showToast, so a later call's ariaLive wins. */
describe('showToast — ARIA on every call (n198)', () => {
  it('a second call on the same id takes its own ariaLive', () => {
    showToast({ id: 'vot-toast-aria', text: 'one', durationMs: 0 });
    showToast({ id: 'vot-toast-aria', text: 'two', ariaLive: 'assertive', durationMs: 0 });
    const el = document.getElementById('vot-toast-aria');
    expect(el.getAttribute('aria-live')).toBe('assertive');
    showToast({ id: 'vot-toast-aria', text: 'three', durationMs: 0 });
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('role')).toBe('status');
    el.remove();
  });

  it('a long message is set in the body face (n138); a short one is not', () => {
    showToast({ id: 'vot-toast-long', text: 'Saved.', durationMs: 0 });
    const el = document.getElementById('vot-toast-long');
    expect(el.classList.contains('is-long')).toBe(false);
    showToast({ id: 'vot-toast-long', text: 'This message is long enough that small capitals would be hard to read at a glance.', durationMs: 0 });
    expect(el.classList.contains('is-long')).toBe(true);
    el.remove();
  });
});
