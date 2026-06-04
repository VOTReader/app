// @ts-nocheck — drives the toast DOM primitive in jsdom
/* toast — the transient notification primitive. Pins SEC-2: `opts.text` is set via
   textContent (SAFE — cannot inject markup), and `opts.html` (innerHTML) is reserved
   for TRUSTED static markup only. This is the guard against a future caller passing
   user/corpus text into the innerHTML sink. */
import { describe, it, expect, afterEach } from 'vitest';
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
