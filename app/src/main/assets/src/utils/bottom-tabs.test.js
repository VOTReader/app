import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BottomTabs, BOTTOM_TABS } from './bottom-tabs.js';
import { DEFAULT_TAB } from '../hooks/use-tabs.js';

// A stand-in for App's active tab: getTab reads it, patchTab merges like updateActiveTab.
function rig(start = {}) {
  let tab = { ...DEFAULT_TAB, fromLetterStack: [], ...start };
  BottomTabs.bind(() => tab, (patch) => { tab = { ...tab, ...patch }; });
  return { get tab() { return tab; }, go(patch) { tab = { ...tab, ...patch }; } };
}

describe('BottomTabs (rs1): four tabs, each with its own stack', () => {
  beforeEach(() => { localStorage.clear(); BottomTabs._reset(); });

  it('has Home / Read / Listen / Library with their roots', () => {
    expect(BOTTOM_TABS.map((t) => [t.label, t.root])).toEqual([
      ['Home', 'home'], ['Read', 'volumes-home'], ['Listen', 'audio-library'], ['Library', 'library'],
    ]);
  });

  it('opens a tab at its root the first time, and where it was left after that', () => {
    const r = rig();
    BottomTabs.select('read');
    expect(BottomTabs.active()).toBe('read');
    expect(r.tab.screen).toBe('volumes-home');
    r.go({ screen: 'vot-one-letter', letterId: 'v1-3', fromLetterStack: [{ screen: 'vot-one-index' }] });
    BottomTabs.select('library');
    expect(r.tab.screen).toBe('library');
    expect(r.tab.letterId).toBe(null);
    expect(r.tab.fromLetterStack).toEqual([]);
    BottomTabs.select('read');
    expect(r.tab.screen).toBe('vot-one-letter');
    expect(r.tab.letterId).toBe('v1-3');
    expect(r.tab.fromLetterStack).toEqual([{ screen: 'vot-one-index' }]);
  });

  it('a tap on the lit tab pops it to its root and forgets its stack', () => {
    const r = rig();
    BottomTabs.select('read');
    r.go({ screen: 'vot-one-index' });
    BottomTabs.select('read');
    expect(r.tab.screen).toBe('volumes-home');
    BottomTabs.select('home');
    BottomTabs.select('read');
    expect(r.tab.screen).toBe('volumes-home');
  });

  it('keeps the scroll memory shared: a switch never carries scrollPositions', () => {
    const r = rig({ scrollPositions: { home: 120 } });
    BottomTabs.select('read');
    expect(r.tab.scrollPositions).toEqual({ home: 120 });
  });

  it('Back inside a tab: off its root -> its root; at its root -> the Home tab, restored', () => {
    const r = rig();
    r.go({ screen: 'settings' });           // Home tab left on Settings
    BottomTabs.select('listen');
    r.go({ screen: 'audio-library-saved' });
    expect(BottomTabs.back('audio-library-saved')).toBe(true);
    expect(r.tab.screen).toBe('audio-library');
    expect(BottomTabs.back('audio-library')).toBe(true);
    expect(BottomTabs.active()).toBe('home');
    expect(r.tab.screen).toBe('settings');
    expect(BottomTabs.back('settings')).toBe(false);  // the Home tab: the old routing table decides
  });

  it('goHome outside Back lights Home and keeps the tab it left', () => {
    const r = rig();
    BottomTabs.select('library');
    r.go({ screen: 'notes-index' });
    BottomTabs.markHome();
    expect(BottomTabs.active()).toBe('home');
    BottomTabs.select('library');
    expect(r.tab.screen).toBe('notes-index');
  });

  it('remembers the lit tab and the stacks across a restart, and shrugs off a broken value', async () => {
    const r = rig();
    BottomTabs.select('read');
    r.go({ screen: 'garden-view' });
    BottomTabs.select('library');
    const saved = JSON.parse(localStorage.getItem('vot-bottom-tabs'));
    expect(saved.active).toBe('library');
    expect(saved.slots.read.screen).toBe('garden-view');
    localStorage.setItem('vot-bottom-tabs', '{not json');
    vi.resetModules();
    const fresh = await import('./bottom-tabs.js');
    expect(fresh.BottomTabs.active()).toBe('home');
  });

  it('tells subscribers when the lit tab changes', () => {
    rig();
    let n = 0;
    const off = BottomTabs.subscribe(() => { n++; });
    BottomTabs.select('read');
    BottomTabs.select('read');
    off();
    BottomTabs.select('home');
    expect(n).toBe(2);
  });
});
