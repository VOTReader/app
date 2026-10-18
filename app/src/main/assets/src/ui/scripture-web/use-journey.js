/* ═══════════════════════════════════════════════════════════════════════
   useJourney — where the reader has been in the web (the Back trail).
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   The navigation stream owns this file (CONTRACTS.md section 7).
   ═══════════════════════════════════════════════════════════════════════

   One journey per screen: the navigation stream pushes an arrival (Follow,
   go-to, a book name), the panel renders the stack and its Back, and the
   selection hook carries it (use-web-selection.js returns it) so the panel
   reaches it where it reaches everything else.

     stack   [{ verse, label, open?, span? }], oldest first: verse a graph
             verse id, label what the panel shows ("John 3:16"); the TOP IS
             WHERE THE READER IS, so a trail is empty or two long at least
             (where they set out from, then each arrival). open (additive): the
             panel spec to open again on arriving back (null closes it; with a
             `lit` list, those threads light again); span (additive): the
             canon x the view held, [x0, x1], so Back restores the zoom too
     push(entry, origin?)   records an arrival. origin (additive) is where the
             reader set out from: it seeds an empty trail, so the first Follow
             already has somewhere to come back to; left out, the trail asks
             the go-to where the reader is (connect's here). An arrival at the place
             one step back is a walk back (Follow on the same line, end to
             end): it steps back instead of growing the trail. The same place
             twice is one crumb; the trail keeps the last 24.
     back()  pops the newest and returns the entry to go back to (the one now
             on top), or null when there is nowhere to go. Navigation decides
             what Back does: the camera flies there (flyTo, centred in the
             canvas area beside the panel; its span when it has one), and on
             landing the entry's `open`
             (a panel spec) opens again, so a connection's "Follow to" names
             the far end from where the camera now is. Back home to where the
             trail set out empties it: there is nothing further back.
     clear() empties it (a mode change, Reset view)

   State, not a ref (the panel renders the stack), and a ref beside it so a
   push and a back in the same event see each other. The panel's Back calls
   back() and nothing else: it flies and reopens by itself. */

/**
 * @typedef {{ verse: number, label: string, open?: any, span?: [number, number] }} JourneyEntry
 * @typedef {{ openPanel?: (spec: any) => boolean, closePanel?: () => void,
 *   lightThreads?: (ids: ArrayLike<number> | null) => void, here?: () => JourneyEntry | null }} JourneyPanel
 * @typedef {{ stack: JourneyEntry[], push: (entry: JourneyEntry, origin?: JourneyEntry | null) => void,
 *   back: () => JourneyEntry | null, clear: () => void,
 *   connect: (panel: JourneyPanel | null) => void }} Journey
 */

/** The longest trail kept: the oldest crumbs go first. */
export const JOURNEY_CAP = 24;

const EMPTY = Object.freeze([]);

const valid = (e) => !!e && Number.isFinite(e.verse) && e.verse >= 0;

/**
 * The next trail after an arrival (pure, so the rules have their own tests).
 * @param {JourneyEntry[]} stack
 * @param {JourneyEntry} entry
 * @param {JourneyEntry | null} [origin]
 * @returns {JourneyEntry[]}
 */
export function pushed(stack, entry, origin) {
  if (!valid(entry)) return stack;
  let s = stack.slice();
  if (!s.length && valid(origin) && origin.verse !== entry.verse) s.push(origin);
  const top = s[s.length - 1];
  if (top && top.verse === entry.verse) { s[s.length - 1] = entry; return s; }
  const under = s[s.length - 2];
  if (under && under.verse === entry.verse) {
    // a walk back along the way it came: one step back, not a longer trail
    s.pop(); s[s.length - 1] = entry;
    return s.length > 1 ? s : [];
  }
  s.push(entry);
  if (s.length > JOURNEY_CAP) s = s.slice(s.length - JOURNEY_CAP);
  return s;
}

/**
 * The screen's journey. Its identity changes only when the stack does (the selection hook's
 * callbacks list it, and the panel re-renders on it).
 * @param {{ flyTo?: (target: object, opts?: object) => Promise<boolean> }} [deps]
 *   flyTo: the camera's (use-web-camera.js); without it Back only pops
 * @returns {Journey}
 */
export function useJourney(deps) {
  const flyTo = deps && deps.flyTo;
  const [stack, setStack] = React.useState(/** @type {JourneyEntry[]} */ (/** @type {unknown} */ (EMPTY)));
  const stackRef = React.useRef(stack);
  const panelRef = React.useRef(/** @type {JourneyPanel | null} */ (null));
  const flyRef = React.useRef(flyTo);
  flyRef.current = flyTo;

  const set = React.useCallback((next) => {
    if (next === stackRef.current) return;
    stackRef.current = next.length ? next : /** @type {JourneyEntry[]} */ (/** @type {unknown} */ (EMPTY));
    setStack(stackRef.current);
  }, []);

  const push = React.useCallback((entry, origin) => {
    const s = stackRef.current;
    const p = panelRef.current;
    const from = origin !== undefined ? origin : (!s.length && p && p.here ? p.here() : null);
    set(pushed(s, entry, from));
  }, [set]);

  const clear = React.useCallback(() => { if (stackRef.current.length) set([]); }, [set]);

  const connect = React.useCallback((panel) => { panelRef.current = panel || null; }, []);

  const back = React.useCallback(() => {
    const s = stackRef.current;
    if (s.length < 2) { if (s.length) set([]); return null; }
    const rest = s.slice(0, -1);
    const to = rest[rest.length - 1];
    // home to where the trail set out: nothing further back, so the trail is done
    set(rest.length > 1 ? rest : []);
    const fly = flyRef.current;
    const arrive = () => {
      const p = panelRef.current;
      if (!p || to.open === undefined) return;
      if (to.open === null) { if (p.closePanel) p.closePanel(); return; }
      if (p.openPanel) p.openPanel(to.open);
      if (to.open.lit && p.lightThreads) p.lightThreads(to.open.lit);
    };
    if (typeof fly === 'function') {
      const target = to.span ? { x0: to.span[0], x1: to.span[1] } : { x: to.verse };
      Promise.resolve(fly(target)).then((ok) => { if (ok) arrive(); }, () => {});
    } else arrive();
    return to;
  }, [set]);

  return React.useMemo(() => ({ stack, push, back, clear, connect }), [stack, push, back, clear, connect]);
}
