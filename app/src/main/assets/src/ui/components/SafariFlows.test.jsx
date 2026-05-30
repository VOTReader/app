/* W2.7e — SafariFlows tests
   ─────────────────────────
   Tests Safari7DayModal + IosPwaWelcomeCard components.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Safari7DayModal, IosPwaWelcomeCard } from './SafariFlows.jsx';

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

  /** @type {any} */ (globalThis).AnnotationStore = { getAll: () => ({}) };
  /** @type {any} */ (globalThis).BookmarkStore = { getAll: () => ({}) };
  /** @type {any} */ (globalThis).JournalStore = { getAll: () => ({}) };
  /** @type {any} */ (globalThis).NoteStore = { getAll: () => ({}) };
  /** @type {any} */ (globalThis).StateStore = { get: vi.fn(() => false), set: vi.fn() };
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

  it('renders nothing when safari-pwa but has data', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    /** @type {any} */ (globalThis).AnnotationStore = { getAll: () => ({ key1: [{ id: 'a1' }] }) };
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('renders nothing when safari-pwa but already welcomed', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    /** @type {any} */ (globalThis).StateStore = { get: vi.fn(() => true), set: vi.fn() };
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('renders welcome card when safari-pwa + empty + not welcomed', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    expect(container.querySelector('.sh-welcome-card')).not.toBeNull();
    expect(container.querySelector('.sh-modal-title').textContent).toBe('Welcome to VOTReader!');
  });

  it('"skip" sets StateStore flag and hides card', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={() => {}} />);
    var skipBtn = Array.from(container.querySelectorAll('.sh-modal-btn')).find(
      (b) => b.textContent.includes('skip')
    );
    act(() => { /** @type {HTMLElement} */ (skipBtn).click(); });
    expect(/** @type {any} */ (globalThis).StateStore.set).toHaveBeenCalledWith('ios-pwa-welcomed', true);
    expect(container.querySelector('.sh-welcome-card')).toBeNull();
  });

  it('"import" sets flag and calls onNavigateSettings', () => {
    _report = _makeReport({ platform: 'safari-pwa' });
    var nav = vi.fn();
    var { container } = render(<IosPwaWelcomeCard onNavigateSettings={nav} />);
    var importBtn = Array.from(container.querySelectorAll('.sh-modal-btn')).find(
      (b) => b.textContent.includes('import')
    );
    act(() => { /** @type {HTMLElement} */ (importBtn).click(); });
    expect(/** @type {any} */ (globalThis).StateStore.set).toHaveBeenCalledWith('ios-pwa-welcomed', true);
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
