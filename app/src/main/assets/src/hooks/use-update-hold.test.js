/* use-update-hold (ds2): the hook form of the update hold — a sheet holds the
   app-update reload (and the late-load remount) while it has unsaved work,
   and lets go when it closes. The release IS the effect cleanup. */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUpdateHold } from './use-update-hold.js';
import { updateHolds, remountHolds, _resetForTests } from '../utils/update-hold.js';

beforeEach(() => _resetForTests());

/** @param {{ active: boolean, reason: string, opts?: { remountOnly?: boolean } }} props */
function renderHold(props) {
  return renderHook(
    (/** @type {{ active: boolean, reason: string, opts?: { remountOnly?: boolean } }} */ { active, reason, opts }) =>
      useUpdateHold(active, reason, opts),
    { initialProps: props }
  );
}

describe('useUpdateHold', () => {
  it('holds nothing while inactive', () => {
    renderHold({ active: false, reason: 'note' });
    expect(updateHolds()).toEqual([]);
    expect(remountHolds()).toEqual([]);
  });

  it('holds the reload and the remount while active', () => {
    renderHold({ active: true, reason: 'note' });
    expect(updateHolds()).toEqual(['note']);
    expect(remountHolds()).toEqual(['note']);
  });

  it('releases on unmount', () => {
    const { unmount } = renderHold({ active: true, reason: 'note' });
    expect(updateHolds()).toEqual(['note']);
    unmount();
    expect(updateHolds()).toEqual([]);
    expect(remountHolds()).toEqual([]);
  });

  it('releases when active turns false, and re-holds when it turns true again', () => {
    const { rerender } = renderHold({ active: true, reason: 'recording' });
    expect(updateHolds()).toEqual(['recording']);
    rerender({ active: false, reason: 'recording' });
    expect(updateHolds()).toEqual([]);
    expect(remountHolds()).toEqual([]);
    rerender({ active: true, reason: 'recording' });
    expect(updateHolds()).toEqual(['recording']);
  });

  it('re-holds under the new reason when the reason changes', () => {
    const { rerender } = renderHold({ active: true, reason: 'note' });
    rerender({ active: true, reason: 'recording' });
    expect(updateHolds()).toEqual(['recording']);
    expect(remountHolds()).toEqual(['recording']);
  });

  it('a remountOnly hold stops the remount but not the reload', () => {
    renderHold({ active: true, reason: 'journal', opts: { remountOnly: true } });
    expect(updateHolds()).toEqual([]);
    expect(remountHolds()).toEqual(['journal']);
  });

  it('opts absent or empty holds both', () => {
    renderHold({ active: true, reason: 'note' });
    expect(updateHolds()).toEqual(['note']);
    expect(remountHolds()).toEqual(['note']);
    const { unmount } = renderHold({ active: true, reason: 'backup', opts: {} });
    expect(updateHolds()).toEqual(['note', 'backup']);
    unmount();
    expect(updateHolds()).toEqual(['note']);
  });

  it('flipping remountOnly re-holds as remount-only', () => {
    const { rerender } = renderHold({ active: true, reason: 'journal' });
    expect(updateHolds()).toEqual(['journal']);
    rerender({ active: true, reason: 'journal', opts: { remountOnly: true } });
    expect(updateHolds()).toEqual([]);
    expect(remountHolds()).toEqual(['journal']);
  });

  it('two hooks hold independently; one unmount leaves the other', () => {
    const first = renderHold({ active: true, reason: 'note' });
    const second = renderHold({ active: true, reason: 'recording' });
    expect(updateHolds()).toEqual(['note', 'recording']);
    first.unmount();
    expect(updateHolds()).toEqual(['recording']);
    expect(remountHolds()).toEqual(['recording']);
    second.unmount();
    expect(updateHolds()).toEqual([]);
  });
});
