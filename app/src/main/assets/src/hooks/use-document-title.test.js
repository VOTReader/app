/* W4.6 — useDocumentTitle tests. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from './use-document-title.js';

let _origDescribe;

beforeEach(() => {
  _origDescribe = window.describeTab;
  document.title = 'initial';
});

afterEach(() => {
  window.describeTab = _origDescribe;
});

describe('useDocumentTitle', () => {
  it('uses just the app name on Home (no prefix)', () => {
    window.describeTab = vi.fn(() => ({ title: 'Home', subtitle: '' }));
    renderHook(() => useDocumentTitle({ activeTab: { screen: 'home' } }));
    expect(document.title).toBe('VOTReader');
  });

  it('prefixes the screen label for a content screen', () => {
    window.describeTab = vi.fn(() => ({ title: 'Genesis · Ch. 1', subtitle: 'Old Testament' }));
    renderHook(() => useDocumentTitle({ activeTab: { screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 } }));
    expect(document.title).toBe('Genesis · Ch. 1 — VOTReader');
  });

  it('falls back to the app name when describeTab throws (lazy globals)', () => {
    window.describeTab = vi.fn(() => { throw new Error('corpus not ready'); });
    renderHook(() => useDocumentTitle({ activeTab: { screen: 'bible-ch' } }));
    expect(document.title).toBe('VOTReader');
  });

  it('defaults a missing activeTab to home', () => {
    window.describeTab = vi.fn((t) => ({ title: t.screen === 'home' ? 'Home' : 'X' }));
    renderHook(() => useDocumentTitle({ activeTab: undefined }));
    expect(window.describeTab).toHaveBeenCalledWith({ screen: 'home' });
    expect(document.title).toBe('VOTReader');
  });
});
