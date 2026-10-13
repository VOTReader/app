/* ═══════════════════════════════════════════════════════════════════════
   RouteSlot — runs a screen route's body as its own component (sweep mw12)
   ═══════════════════════════════════════════════════════════════════════
   App used to call ROUTES[screen]() in its own render and pass only the
   returned element to the keyed screen ErrorBoundary, so anything a route
   evaluates while building its props (store lookups, audio resolution, a
   malformed backup's values) threw in App's frame and reached the root
   boundary, which replaces the whole app. Called here instead, the body runs
   inside the screen boundary, whose panel lets the reader navigate away.
   Route bodies call no hooks, so moving the call changes no hook order.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ route: (() => any) | undefined }} props
 */
export function RouteSlot({ route }) {
  return typeof route === 'function' ? (route() ?? null) : null;
}
