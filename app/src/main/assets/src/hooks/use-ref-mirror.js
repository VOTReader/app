/* ═══════════════════════════════════════════════════════════════════════
   useRefMirror — give event handlers a synchronous read window on state
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.
   Trivial wrapper over the `const xRef = useRef(initial); xRef.current = x`
   pattern used ~15× across App() (and now inside other hooks) to bridge
   React state into imperative handlers — window bridges, the Android-back
   router, scroll listeners, navigation refs.

   This hook is small enough that the full 6-section template would be
   noise; per the Q0 consolidation spec it carries OWNS / RETURNS only.

   OWNS:
     - a single React.useRef whose `.current` is re-synced to `value` on
       every render (the sync mutation runs DURING render).

   RETURNS: the ref object. Stable identity across renders; `.current`
            always equals the latest `value` once render completes.

   PATTERN:
     Before:   const screenRef = React.useRef(screen);
               screenRef.current = screen;
     After:    const screenRef = useRefMirror(screen);

   SEMANTICS: identical to the inline pattern. The sync mutation during
   render is formally a side effect during render (see PLAN.txt §P6
   Direction 3 — flagged for a separate useLayoutEffect pass after P6
   stabilizes). This hook PRESERVES that timing exactly so behavior
   doesn't change here; the correctness refactor lives in P7.

   WHY A HOOK: deduplicates 15 two-line sites into 15 one-line sites,
   gives the pattern a name future readers can recognize, and makes the
   eventual P7 fix a one-place edit instead of 15.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Mirror a state value into a useRef whose `.current` always equals the
 * latest value. Used to bridge React state into imperative handlers
 * (window bridges, the Android-back router, scroll listeners, nav refs)
 * that need a synchronous read window — closures alone would freeze the
 * value at handler-attach time.
 *
 * Identical semantics to the inline `const xRef = useRef(x); xRef.current = x`
 * pattern. The sync mutation runs DURING render (a deliberate side-effect-
 * in-render that PLAN.txt §P7 flags for a future useLayoutEffect pass).
 *
 * @template T
 * @param {T} value
 * @returns {{ current: T }}
 */
export function useRefMirror(value) {
  const r = React.useRef(value);
  r.current = value;
  return r;
}
