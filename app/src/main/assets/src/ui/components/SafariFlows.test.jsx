/* W2.7e — SafariFlows tests
   ─────────────────────────
   Tests Safari7DayModal + IosPwaWelcomeCard components.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Safari7DayModal, IosPwaWelcomeCard } from './SafariFlows.jsx';
import { StateStore } from '../../stores/state-store.js';
import { AnnotationStore } from '../../stores/annotation-store.js';
import { BookmarkStore } from '../../stores/bookmark-store.js';
import { JournalStore } from '../../stores/journal-store.js';
import { NoteStore } from '../../stores/note-store.js';

let _listeners;
let _version;
let _report;
let _dismissed;

function _makeReport(overrides) {
  return {
    tier: 'healthy',
    quota: 2_400_000_000,
    usage: 45_000_000,
    persisted: false,
    lastAssessedAt: Date.now(),
    risks: [],
    platform: 'chrome',
    writeFailedThisSession: false,
    privateModeLikely: false,
    safariGateBlocked: false,
    ...overrides,
  };
}

beforeEach(() => {
  _listeners = new Set();
  _version = 1;
  _report = _makeReport({});
  _dismissed = new Set();

  /** @type {any} */ (globalThis).StorageHealth = {
    subscribe: (cb) => { _listeners.add(cb); return () => _listeners.delete(cb); },
    getVersion: () => _version,
    getReport: () => _report,
    getPlatform: () => _report.platform,
    isDismissed: (id) => _dismissed.has(id),
    dismissScenario: vi.fn((id) => { _dismissed.add(id); _version++; _listeners.forEach((cb) => cb()); }),
    requestPersistence: vi.fn(async () => true),
  };

  /** @type {any} */ (globalThis).useModalRegistry = vi.fn();

  // W13 (sweep 2026-10-13): the REAL stores, not mocks of an API none of them has. The old mocks
  // gave StateStore a keyed get/set and the data stores a getAll(); the real StateStore.get()
  // returns the whole vot-state and set() replaces it, and no store has getAll().
  for (const s of [StateStore, AnnotationStore, BookmarkStore, JournalStore, NoteStore]) {
    s._resetForTests({ forceLoaded: true });
  }
  Object.assign(globalThis, { StateStore, AnnotationStore, BookmarkStore, JournalStore, NoteStore });
  StateStore.set(/** @type {any} */ ({ theme: 'dark', fontStyle: 'serif', tabs: [{ key: 'vol-two:1' }], read: { 'vol-two:1': 1 } }));
  try { localStorage.removeItem('vot-ios-pwa-welcomed'); } catch (_e) { /* jsdom always has it */ }
});

afterEach(() => {
  cleanup();
  delete /** @type {any} */ (globalThis).StorageHealth;
  delete /** @type {any} */ (globalThis).useModalRegistry;
  delete /** @type {any} */ (globalThis).AnnotationStore;
  delete /** @type {any} */ (globalThis).BookmarkStore;
  delete /** @type {any} */ (globalThis).JournalStore;
  delete /** @type {any} */ (globalThis).NoteStore;
  delete /** @type {any} */ (globalThis).StateStore;
});

describe('Safari7DayModal', () => {
  it('renders nothing when safariGateBlocked is false', () => {
    _report = _makeReport({ safariGateBlocked: false });
    var { container } = render(<Safari7DayModal />);
    expect(container.querySelector('.sh-modal-backdrop')).toBeNull();
  });

  it('renders modal when safariGateBlocked is true', () => {
    _report = _makeReport({ safariGateBlocked: true });
    var { container } = render(<Safari7DayModal />);
    expect(container.querySelector('.sh-modal-backdrop')).not.toBeNull();
    expect(container.querySelector('.sh-modal-title').textContent).toBe('Before you start saving');
    const dialog = screen.getByRole('dialog', { name: 'Safari storage warning' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('renders nothing when gate blocked but already dismissed', () => {
    _report = _makeReport({ safariGateBlocked: true });
    _dismissed.add('safari-7day');
    var { container } = render(<Safari7DayModal />);
    expect(container.querySelector('.sh-modal-backdrop')).toBeNull();
  });

  it('"I understand the risk" calls dismissScenario', () => {
    _report = _makeReport({ safariGateBlocked: true });
    var { container } = render(<Safari7DayModal />);
    var btns = container.querySelectorAll('.sh-modal-btn');
    var riskBtn = Array.from(btns).find((b) => b.textContent.includes('I understand'));
    act(() => { /** @type {HTMLElement} */ (riskBtn).click(); });
    expect(/** @type {any} */ (globalThis).StorageHealth.dismissScenario).toHaveBeenCalledWith('safari-7day');
  });

  it('"How to add to Home Screen" shows instructions', () => {
    _report = _makeReport({ safariGateBlocked: true });
    var { container } = render(<Safari7DayModal />);
    var howBtn = Array.from(container.querySelectorAll('.sh-modal-btn')).find(
      (b) => b.textContent.includes('How to add')
    );
    expect(container.querySelector('.sh-modal-instructions')).toBeNull();
    act(() => { /** @type {HTMLElement} */ (howBtn).click(); });
    expect(container.querySelector('.sh-modal-instructions')).not.toBeNull();
  });

  it('registers with useModalRegistry', () => {
    _report = _makeReport({ safariGateBlocked: true });
    render(<Safari7DayModal />);
    expect(/** @type {any} */ (globalThis).useModalRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'safari-7day-modal', active: true })
    );
  });
});

describe('IosPwaWelcomeCard', () => {
  it('renders nothing when platform is not safari-pwa', () => {
    _report = _makeReport({ platform: 'chrome' });
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it.each([
    ['a highlight', () => AnnotationStore.replaceAll(/** @type {any} */ ({ 'vol-two:1': [{ id: 'a1', type: 'highlight' }] }))],
    ['a bookmark', () => BookmarkStore.replaceAll(/** @type {any} */ ([{ id: 'b1', hlKey: 'vol-two:1' }]))],
    ['a journal entry', () => JournalStore.replaceAll(/** @type {any} */ ({ list: [{ id: 'j1', created: 1 }] }))],
    ['a note', () => NoteStore.replaceAll(/** @type {any} */ ({ g1: { id: 'g1', text: 'x' } }))],
  ])('renders nothing on safari-pwa when the reader already has %s', (_what, seed) => {
    _report = _makeReport({ platform: 'safari-pwa' });
    seed();
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('an empty journal ({ list: [] }) and empty maps are not data: the card shows', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    AnnotationStore.replaceAll(/** @type {any} */ ({ 'vol-two:1': [] }));
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).not.toBeNull();
  });

  it('renders nothing while a data store has not really loaded (degraded reads as empty, not as no data)', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    /** @type {any} */ (JournalStore)._state = 'degraded';
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('renders nothing when safari-pwa but already welcomed', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    localStorage.setItem('vot-ios-pwa-welcomed', '1');
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('renders nothing when localStorage throws (it could not remember a skip)', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    try {
      var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
      expect(container.querySelector('.sh-welcome-card')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('renders welcome card when safari-pwa + empty + not welcomed', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).not.toBeNull();
    expect(container.querySelector('.sh-modal-title').textContent).toBe('Welcome to VOTReader!');
    const dialog = screen.getByRole('dialog', { name: 'Welcome to VOTReader' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('"skip" remembers itself in its own key, hides the card, and leaves vot-state exactly as it was', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    const before = JSON.parse(JSON.stringify(StateStore.get()));
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    var skipBtn = Array.from(container.querySelectorAll('.sh-modal-btn')).find(
      (b) => b.textContent.includes('skip')
    );
    act(() => { /** @type {HTMLElement} */ (skipBtn).click(); });
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
    expect(localStorage.getItem('vot-ios-pwa-welcomed')).toBe('1');
    // set('ios-pwa-welcomed', true) on the real StateStore would have made vot-state a string,
    // losing the reader's tabs, settings and read marks.
    expect(StateStore.get()).toEqual(before);
    cleanup();
    var again = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(again.container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('"import" remembers itself, leaves vot-state alone and calls onNavigateSettings', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    const before = JSON.parse(JSON.stringify(StateStore.get()));
    var nav = vi.fn();
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={nav} />);
    var importBtn = Array.from(container.querySelectorAll('.sh-modal-btn')).find(
      (b) => b.textContent.includes('import')
    );
    act(() => { /** @type {HTMLElement} */ (importBtn).click(); });
    expect(localStorage.getItem('vot-ios-pwa-welcomed')).toBe('1');
    expect(StateStore.get()).toEqual(before);
    expect(nav).toHaveBeenCalled();
  });

  it('registers with useModalRegistry when visible', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(/** @type {any} */ (globalThis).useModalRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ios-pwa-welcome', active: true })
    );
  });
});
