// @ts-nocheck
/* The deep dive's adds (2026-10-23): a long press on a book name filters to it (holdBook), and the
   saved spot keeps the canon's camera and filters for the next visit, checked as it comes back. */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebFilters, validFilters } from './web-filters.jsx';
import { readSavedSpot, saveSpot, _resetWebPlace } from '../screens/ScriptureWebScreen.jsx';
import { NO_FILTERS } from '../../utils/scripture-web/filters.js';

afterEach(() => _resetWebPlace());

const hook = (initial) => renderHook(() => useWebFilters({ graph: null, mode: 'canonical', density: 'famous',
  schedule: () => {}, setAnnounce: () => {}, initial }));

describe('a book name held: the web keeps that book', () => {
  it('holdBook keeps one book, and the same book held again lets it go', () => {
    const { result } = hook();
    act(() => { result.current.holdBook(22); });
    expect(result.current.filters).toMatchObject({ fromBook: 22, toBook: -1 });
    act(() => { result.current.holdBook(39); });
    expect(result.current.filters).toMatchObject({ fromBook: 39, toBook: -1 });
    act(() => { result.current.holdBook(39); });
    expect(result.current.filters.fromBook).toBe(-1);
  });
});

describe('the saved spot', () => {
  it('keeps the camera and the filters, and gives them back as a resume point', () => {
    const filters = { ...NO_FILTERS, prophecy: true, fromBook: 22 };
    saveSpot({ x: 23145.5, ppv: 12, y: 30, total: 31102 }, filters);
    const back = readSavedSpot(31102);
    expect(back).toMatchObject({ mode: 'canonical', cam: { x: 23145.5, ppv: 12, y: 30, total: 31102 }, detail: null });
    expect(validFilters(back.filters)).toEqual(filters);
    const { result } = hook(back.filters);
    expect(result.current.filters).toEqual(filters);
  });

  it('a spot for another canon, a broken one or none opens the whole web, with no filters', () => {
    saveSpot({ x: 10, ppv: 3, total: 999 }, NO_FILTERS);
    expect(readSavedSpot(31102)).toBeNull();
    localStorage.setItem('vot-sw-spot', '{not json');
    expect(readSavedSpot(0)).toBeNull();
    _resetWebPlace();
    expect(readSavedSpot(0)).toBeNull();
    expect(validFilters({ ...NO_FILTERS, distance: 'sideways' })).toBeNull();
    expect(validFilters({ ...NO_FILTERS, fromBook: 99 })).toBeNull();
    expect(hook({ distance: 'sideways' }).result.current.filters).toEqual(NO_FILTERS);
  });
});
