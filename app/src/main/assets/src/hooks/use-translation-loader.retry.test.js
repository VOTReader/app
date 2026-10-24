/* useTranslationLoader — an edition that failed to download while online says so with a Try again button (s05.1,
   n141). The loader's other tests mock the toast module; this one reads the real toast, button and all. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslationLoader, TRANSLATION_MISSING_TOAST_ID } from './use-translation-loader.js';
import { _resetToasts } from '../utils/toast.js';

const g = () => /** @type {any} */ (globalThis);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
/** @type {any} */ let onLine;

beforeEach(() => {
  _resetToasts();
  g().loadTranslation = vi.fn(() => Promise.resolve());
  g().releaseTranslationsExcept = vi.fn();
  g().TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV' }, { id: 'asv', label: 'ASV' }];
  onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  delete g().loadTranslation; delete g().releaseTranslationsExcept; delete g().TRANSLATION_OPTIONS; delete g().BIBLE_ASV;
  onLine.mockRestore();
});

describe('useTranslationLoader — Try again (s05.1)', () => {
  it('online, a failed download says so with a button that loads it again', async () => {
    const tick = vi.fn();
    renderHook(() => useTranslationLoader('asv', tick));
    await flush();
    const toast = document.getElementById(TRANSLATION_MISSING_TOAST_ID);
    expect(toast.textContent).toContain('ASV didn’t load, so the Bible shows NKJV for now.');
    const btn = toast.querySelector('button');
    expect(btn.textContent).toBe('Try again');
    g().loadTranslation.mockImplementation(() => { g().BIBLE_ASV = {}; return Promise.resolve(); });
    act(() => { btn.click(); });
    await flush();
    expect(g().loadTranslation).toHaveBeenCalledTimes(2);
    expect(toast.classList.contains('show')).toBe(false);
  });

  it('offline keeps its own words and no button (the connection coming back retries)', async () => {
    onLine.mockReturnValue(false);
    renderHook(() => useTranslationLoader('asv', vi.fn()));
    await flush();
    const toast = document.getElementById(TRANSLATION_MISSING_TOAST_ID);
    expect(toast.textContent).toMatch(/isn’t on this phone yet/);
    expect(toast.querySelector('button')).toBeNull();
  });
});
