/* The web's keys (G2): / and Ctrl+K open the go-to from anywhere on the screen but a text field,
   ahead of the app's own "/ opens Search"; Enter or Space choose the line at the centre and [ ]
   step through the lines at the chosen verse, while the web itself has the keyboard; Escape and
   Android Back close the go-to first, one layer a press; the help text names the keys. The go-to
   is a stub here (goto.test.jsx drives the real one through these keys). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useWebKeys, WEB_KEYS_HELP } from './use-web-keys.js';
import { modalRegistry } from '../../hooks/use-modal-registry.js';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

const goToStub = (over = {}) => ({
  button: {}, box: null, isOpen: false,
  open: vi.fn(), close: vi.fn(), selectCentre: vi.fn(() => true), step: vi.fn(() => true), back: vi.fn(() => true), ...over,
});

function mountKeys(over = {}) {
  const p = {
    graph: null, guideOpen: false, emptyShown: false, listOpen: false, choices: null, detail: null, tip: null,
    closeGuide: vi.fn(), dismissEmpty: vi.fn(), closeCards: vi.fn(),
    camRef: { current: null }, camVRef: { current: null }, lastRailRef: { current: 'bottom' },
    viewRef: { current: { W: 0, H: 0, DPR: 1 } }, modeRef: { current: 'canonical' }, personalRef: { current: null },
    zoomCapFor: () => 1e9, yFrameFor: () => null, resetView: vi.fn(), onBack: vi.fn(), dropHover: vi.fn(),
    setAnnounce: vi.fn(), schedule: vi.fn(), cancelFly: vi.fn(), goTo: goToStub(), ...over,
  };
  const hook = renderHook((props) => useWebKeys(props), { initialProps: p });
  return { p, hook, keys: () => hook.result.current };
}

/**
 * A keydown as React hands the root one: on the root itself, or bubbled up from a child.
 * @param {string} key
 * @param {{ onChild?: boolean, ctrlKey?: boolean }} [opts]
 */
function rootKey(key, { onChild = false, ...mods } = {}) {
  const root = document.createElement('div');
  const child = document.createElement('button');
  root.appendChild(child);
  return {
    key, ...mods, target: onChild ? child : root, currentTarget: root,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  };
}

/** A real keydown on the page, with the app's own document listener after it ("/ opens Search"
 * unless something took the key first, use-desktop-keyboard.js). */
function pageKey(key, target = document.body, mods = {}) {
  let searched = false;
  const app = (e) => { if (!e.defaultPrevented) searched = true; };
  document.addEventListener('keydown', app);
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
  target.dispatchEvent(e);
  document.removeEventListener('keydown', app);
  return { e, appSearched: searched };
}

describe('/ and Ctrl+K open the go-to', () => {
  it('from the page, ahead of the app\'s own Search', () => {
    const { p } = mountKeys();
    const { e, appSearched } = pageKey('/');
    expect(p.goTo.open).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    expect(appSearched, 'the app did not also open its Search').toBe(false);
    pageKey('k', document.body, { ctrlKey: true });
    pageKey('K', document.body, { metaKey: true });
    expect(p.goTo.open).toHaveBeenCalledTimes(3);
  });

  it('never from a text field, nor when the go-to is up already, nor with no go-to (My Web)', () => {
    const { p, hook } = mountKeys();
    const field = document.body.appendChild(document.createElement('input'));
    const { e, appSearched } = pageKey('/', field);
    expect(p.goTo.open).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    expect(appSearched).toBe(true);
    pageKey('k', document.body.appendChild(document.createElement('textarea')), { ctrlKey: true });
    pageKey('/', document.body.appendChild(document.createElement('select')));
    expect(p.goTo.open).not.toHaveBeenCalled();
    hook.rerender({ ...p, goTo: goToStub({ isOpen: true }) });
    pageKey('/');
    hook.rerender({ ...p, goTo: goToStub({ button: null }) });
    const mine = pageKey('/');
    expect(mine.e.defaultPrevented, 'My Web: / is the app\'s again').toBe(false);
    expect(mine.appSearched).toBe(true);
  });

  it('a plain k is a k, and the listener goes with the screen', () => {
    const { p, hook } = mountKeys();
    pageKey('k');
    pageKey('/', document.body, { altKey: true });
    expect(p.goTo.open).not.toHaveBeenCalled();
    hook.unmount();
    expect(pageKey('/').e.defaultPrevented).toBe(false);
    expect(p.goTo.open).not.toHaveBeenCalled();
  });
});

describe('Enter, Space, [ and ] on the web', () => {
  it('Enter and Space choose the line at the centre; [ steps back and ] on', () => {
    const { p, keys } = mountKeys();
    for (const k of ['Enter', ' ']) {
      const e = rootKey(k);
      keys().onKeyDown(e);
      expect(e.preventDefault).toHaveBeenCalled();
    }
    expect(p.goTo.selectCentre).toHaveBeenCalledTimes(2);
    keys().onKeyDown(rootKey('['));
    keys().onKeyDown(rootKey(']'));
    keys().onKeyDown(rootKey(']'));
    expect(p.goTo.step.mock.calls).toEqual([[-1], [1], [1]]);
  });

  it('Backspace goes back along the trail (journey.back, which nothing called: review of 2026-10-18)', () => {
    const { p, keys } = mountKeys();
    const e = rootKey('Backspace');
    keys().onKeyDown(e);
    expect(p.goTo.back).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
    keys().onKeyDown(rootKey('Backspace', { onChild: true }));
    expect(p.goTo.back, 'a field or a button keeps its own Backspace').toHaveBeenCalledTimes(1);
  });

  it('they are the web\'s only while the web has the keyboard: a button keeps its own Enter', () => {
    const { p, keys } = mountKeys();
    const e = rootKey('Enter', { onChild: true });
    keys().onKeyDown(e);
    keys().onKeyDown(rootKey(']', { onChild: true }));
    keys().onKeyDown(rootKey('Enter', { ctrlKey: true }));
    expect(p.goTo.selectCentre).not.toHaveBeenCalled();
    expect(p.goTo.step).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe('Escape and Back close the go-to first', () => {
  it('one layer a press: the go-to, then the panel, then the web', () => {
    const { p, hook, keys } = mountKeys({ detail: { kind: 'arc', index: 1 }, goTo: goToStub({ isOpen: true }),
      camRef: { current: { x: 100, ppv: 8, total: 31102, y: 0 } }, viewRef: { current: { W: 800, H: 600, DPR: 1 } } });
    keys().onKeyDown(rootKey('Escape'));
    expect(p.goTo.close).toHaveBeenCalledTimes(1);
    expect(p.closeCards).not.toHaveBeenCalled();
    hook.rerender({ ...p, goTo: goToStub() });
    keys().onKeyDown(rootKey('Escape'));
    expect(p.closeCards).toHaveBeenCalledTimes(1);
    hook.rerender({ ...p, detail: null, goTo: goToStub() });
    keys().onKeyDown(rootKey('Escape'));
    expect(p.onBack).toHaveBeenCalledTimes(1);
  });

  it('the go-to alone keeps Android Back on the web', () => {
    const { p } = mountKeys({ goTo: goToStub({ isOpen: true }) });
    const top = modalRegistry.peek();
    expect(top && top.id).toBe('scripture-web-overlay');
    top.dismiss();
    expect(p.goTo.close).toHaveBeenCalledTimes(1);
  });
});

describe('the help text (G2)', () => {
  it('names the keys', () => {
    for (const w of [/arrow keys/i, /plus and minus/i, /\b0\b/, /Enter or Space/, /\[ and \]/, /slash|\//i, /Control\+K/, /Backspace/, /Escape/]) {
      expect(WEB_KEYS_HELP).toMatch(w);
    }
  });
});

/* The camera's clamp leaves the docked panel room past the canon's end (geometry.clampCamera's
   right slack, use-web-camera's slackFor): the keys clamp with the same slack as flyTo and the
   gestures, so the arrow keys walk the canon's last verses into the canvas area and stop there. */
describe('the keys clamp with the panel\'s slack', () => {
  it('ArrowRight at the canon\'s end stops with its last verse the outer tenth inside the area', () => {
    const cam = { x: 31000, ppv: 2, total: 31102, y: 0 };
    const { keys } = mountKeys({
      camRef: { current: cam }, viewRef: { current: { W: 3200, H: 1800, DPR: 2 } },
      slackFor: (c) => (c === cam ? 1280 : 0),
    });
    for (let i = 0; i < 20; i++) keys().onKeyDown(rootKey('ArrowRight'));
    // the area is 1920 device px; the canon's end stops END_MARGIN (a tenth) inside it
    expect((31102 - cam.x) * cam.ppv + 3200 / 2).toBeCloseTo(0.9 * (3200 - 1280), 6);
  });

  it('without a slackFor the view\'s own edge is the bound, as before', () => {
    const cam = { x: 31000, ppv: 2, total: 31102, y: 0 };
    const { keys } = mountKeys({ camRef: { current: cam }, viewRef: { current: { W: 3200, H: 1800, DPR: 2 } } });
    for (let i = 0; i < 20; i++) keys().onKeyDown(rootKey('ArrowRight'));
    expect((31102 - cam.x) * cam.ppv + 3200 / 2).toBeCloseTo(3200, 6);
  });
});
