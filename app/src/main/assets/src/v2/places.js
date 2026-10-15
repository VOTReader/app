/* places.js - the v2 place registry (zv1, 2026-10-14; agreed with myweb + readalong).

   A screen file registers its place once at module top with definePlace(); screens/index.js imports every screen file,
   and V2App renders a registered place before its own built-in branches. So a builder adds a screen without editing
   App.jsx: a screen file, one import line in screens/index.js, and its GATE_STATES row in gate.js.

   The gate contract (gate.js): a place's Screen calls onReady() once its content is on the page (data loaded, not just
   mounted), and with a gate id set it reads only `gate.facts`, never the reader's storage. */

/**
 * What V2App hands a registered place's Screen.
 * @typedef {{ route: import('./gate.js').Route & Record<string, any>, facts: Record<string, any>,
 *   gate: import('./gate.js').GateState | null, desktop: boolean, device: 'phone' | 'computer',
 *   go: (...routes: any[]) => void, pop: () => void, replace: (route: any) => void, openTab: (id: string) => void,
 *   onReady: () => void }} PlaceProps
 */

/**
 * @typedef {{ Screen: (props: PlaceProps) => any,
 *   title?: (route: any) => string,
 *   actions?: (ctx: { route: any, go: (...routes: any[]) => void, desktop: boolean, device: 'phone' | 'computer' }) => any,
 *   contentClass?: string }} PlaceDef
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
