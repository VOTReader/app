/* ═══════════════════════════════════════════════════════════════════════
   useRefMirror — give event handlers a synchronous read window on state
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Trivial wrapper over the `const xRef = useRef(initial); xRef.current = x`
   pattern used ~15× across App() to bridge React state into imperative
   handlers (window bridges, Android-back router, scroll listeners,
   navigation refs).

   PATTERN:
     Before:   const screenRef = React.useRef(screen);
               screenRef.current = screen;
     After:    const screenRef = useRefMirror(screen);

   SEMANTICS: identical. Both end with screenRef.current === screen
   after every render. The sync mutation runs DURING render (formally
   a side effect during render, see PLAN.txt §P6 Direction 3 — flagged
   for a separate useLayoutEffect pass after P6 stabilizes). This hook
   PRESERVES that timing exactly so behavior doesn't change here; the
   correctness refactor lives in P7.

   WHY A HOOK: deduplicates 15 two-line sites into 15 one-line sites
   and gives the pattern a name future readers can recognize. Also
   makes the eventual P7 fix a one-place edit instead of 15.
   ═══════════════════════════════════════════════════════════════════════ */

function useRefMirror(value) {
  const r = React.useRef(value);
  r.current = value;
  return r;
}
