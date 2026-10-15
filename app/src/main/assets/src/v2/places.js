/* places.js - the v2 place registry (zv1, 2026-10-14; agreed with myweb + readalong).

   A screen file registers its place once at module top with definePlace(); screens/index.js imports every screen file,
   and V2App renders a registered place before its own built-in branches. So a builder adds a screen without editing
   App.jsx: a screen file, one import line in screens/index.js, and its GATE_STATES row in gate.js.

   The gate contract (gate.js): a place's Screen calls onReady() once its content is on the page (data loaded, not just
   mounted), and with a gate id set it reads only `gate.facts`, never the reader's storage.

   Two more registries (zv1 group 10, agreed with myweb 10-15): defineStart() names the first page of a real boot (8a: the
   welcome on a first visit), defineOverlay() a layer the shell draws over every page (8b: the install offer). */

/**
 * What V2App hands a registered place's Screen.
 * @typedef {{ route: import('./gate.js').Route & Record<string, any>, facts: Record<string, any>,
 *   gate: import('./gate.js').GateState | null, desktop: boolean, device: 'phone' | 'computer',
 *   go: (...routes: any[]) => void, pop: () => void, replace: (route: any) => void, openTab: (id: string) => void,
 *   onReady: () => void, open?: (name: string, opts?: Record<string, any>) => void }} PlaceProps
 * `open` opens the shell's Text and theme sheet ('text-and-theme') or a page tool on this page ('find', 1i).
 */

/**
 * @typedef {{ Screen: (props: PlaceProps) => any,
 *   title?: (route: any) => string,
 *   actions?: (ctx: { route: any, go: (...routes: any[]) => void, desktop: boolean, device: 'phone' | 'computer',
 *     open?: (sheet: string, opts?: Record<string, any>) => void, gate?: any }) => any,
 *   contentClass?: string, bare?: boolean, find?: (route: any) => string }} PlaceDef
 * `find` names the page for Find in this <page> (1i: 'letter', 'entry', 'topic', 'chapter'); a place without it has no Find.
 * `bare` draws the place alone in the window: no top bar, player, tab bar or rail (8a-welcome). It still calls onReady.
 */

/** @type {Record<string, PlaceDef>} */
export const PLACES = {};

/** Registers (or replaces) the place `id`. @param {string} id @param {PlaceDef} def @returns {PlaceDef} */
export function definePlace(id, def) {
  PLACES[id] = def;
  return def;
}

/** The registered place for `id`, or null. @param {string} id @returns {PlaceDef | null} */
export function placeFor(id) {
  return Object.prototype.hasOwnProperty.call(PLACES, id) ? PLACES[id] : null;
}

/** @type {Array<() => any[] | null>} */
const STARTS = [];

/**
 * Registers a real boot's first page: `fn` returns the first stack, or null to leave it to the next (else Home). It runs
 * once per boot after HydrationGate, never on a gate boot, and only reads (no storage writes).
 * @param {() => any[] | null} fn @returns {() => void} takes it back out (tests)
 */
export function defineStart(fn) {
  STARTS.push(fn);
  return () => {
    const i = STARTS.indexOf(fn);
    if (i >= 0) STARTS.splice(i, 1);
  };
}

/** The first registered start's stack, or null (Home). */
export function startStack() {
  for (const fn of STARTS) {
    try {
      const s = fn();
      if (Array.isArray(s) && s.length) return s;
    } catch (_e) { /* a start that throws leaves the boot to the next one */ }
  }
  return null;
}

/**
 * A layer V2App renders over every page next to the sheet layer (8b's install offer), with the shell's route, gate,
 * desktop, go and openTab.
 * @typedef {(props: { route: any, gate: import('./gate.js').GateState | null, desktop: boolean,
 *   go: (...routes: any[]) => void, openTab: (id: string) => void }) => any} Overlay
 */

/** @type {Record<string, Overlay>} */
export const OVERLAYS = {};

/** Registers (or replaces) the overlay `id`. @param {string} id @param {Overlay} Component @returns {Overlay} */
export function defineOverlay(id, Component) {
  OVERLAYS[id] = Component;
  return Component;
}
