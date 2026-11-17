/* ═══════════════════════════════════════════════════════════════════════
   plan-nav — where the reader is inside Reading plans (plans2, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   Reading plans is one app screen ('reading-plans') holding a small stack
   of views: the list, a plan's preview, the plan's own page, its whole
   schedule, a finished plan, the builder. The stack lives here, outside
   React, so a reading session started from a plan page comes Back to that
   same page (the reader screen replaced the plans screen meanwhile).

   An entry from outside (Library, the More menu, Search, Home's offer)
   opens the list: the screen resets the stack on mount unless the last
   thing that left it asked to be kept (keepPlanNav: a session, a note) or
   a caller set a stack on purpose (openPlanNav: Home's plan row, the
   reminder). Bundle-d only (one copy of the state).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {{ v: 'list' } | { v: 'preview', plan: string, opt?: any, again?: string } | { v: 'plan', id: string, sheet?: number, catchUp?: boolean }
 *   | { v: 'schedule', id: string, tab?: 'ahead' | 'read', at?: number, preview?: any }
 *   | { v: 'finished', id: string } | { v: 'stopped', id: string } | { v: 'build', edit?: string }} PlanView
 *   plan.catchUp: open on the Catch up sheet (Home's and the list's "N days behind", 2235)
 */

/** @type {PlanView[]} */
let _stack = [{ v: 'list' }];
let _keep = false;
let _version = 0;
const _subs = new Set();
const _bump = () => { _version++; for (const f of _subs) f(); };

/** The views, bottom first. @returns {PlanView[]} */
export const planNavStack = () => _stack;
/** @returns {PlanView} */
export const planNavTop = () => _stack[_stack.length - 1];

/** Open Reading plans at these views on the next mount (Home's plan row, a reminder). @param {PlanView[]} views */
export function openPlanNav(views) { _stack = views.length ? views.slice() : [{ v: 'list' }]; _keep = true; _bump(); }
/** Keep the stack for the next mount (the reader is leaving for a session or a note and comes back). */
export function keepPlanNav() { _keep = true; }
/**
 * The screen the app shows now (screen-routes, every render; FIXB): a kept stack is for a trip out to a reader and
 * Back. Any other screen (the tab bar, Home, Library) means the trip ended another way, so the next entry, from
 * wherever, opens the list again instead of the old plan's page. A plan note's editor sets the keep again on its
 * way back.
 * @param {boolean} onTrip  Reading plans itself or a reader
 */
export function planNavOnScreen(onTrip) { if (!onTrip) _keep = false; }
/** The screen mounts: an entry from outside starts at the list. */
export function planNavMounted() {
  if (_keep) { _keep = false; return; }
  if (_stack.length !== 1 || _stack[0].v !== 'list') { _stack = [{ v: 'list' }]; _bump(); }
}
/** @param {PlanView} view */
export function pushPlanView(view) { _stack = [..._stack, view]; _bump(); }
/** Replace the top view (a started plan's preview becomes its page). @param {PlanView} view */
export function replacePlanView(view) { _stack = [..._stack.slice(0, -1), view]; _bump(); }
/** Back one view; false when the stack is at its root (the screen's own Back then leaves Reading plans). */
export function popPlanView() {
  if (_stack.length <= 1) return false;
  _stack = _stack.slice(0, -1);
  _bump();
  return true;
}
/** Back to the list, whatever is open (Find the next plan). */
export function planNavToList() { _stack = [{ v: 'list' }]; _bump(); }

/** The stack, re-rendered on every change. */
export function usePlanNav() {
  React.useSyncExternalStore(
    React.useCallback((cb) => { _subs.add(cb); return () => { _subs.delete(cb); }; }, []),
    () => _version,
  );
  return _stack;
}

/** Tests. */
export function _resetPlanNavForTests() { _stack = [{ v: 'list' }]; _keep = false; _bump(); }
