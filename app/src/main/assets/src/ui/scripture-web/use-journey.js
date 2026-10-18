/* ═══════════════════════════════════════════════════════════════════════
   useJourney — where the reader has been in the web (the Back trail).
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   The navigation stream owns this file (CONTRACTS.md section 7).
   ═══════════════════════════════════════════════════════════════════════

   One journey per screen: the navigation stream pushes an arrival (Follow,
   go-to, a book name), the panel renders the stack and its Back, and the
   selection hook carries it (use-web-selection.js returns it) so the panel
   reaches it where it reaches everything else.

     stack   [{ verse, label }], oldest first: verse a graph verse id, label
             what the panel shows ("John 3:16")
     push(entry)   records an arrival
     back()        pops the newest and returns the entry to go back to (the
                   one now on top), or null when there is nowhere to go
     clear()       empties it (a mode change, Reset view)

   THE STUB KEEPS NOTHING: the stack is always empty, push and clear do
   nothing and back() returns null, so Follow behaves as it did. */

/**
 * @typedef {{ verse: number, label: string }} JourneyEntry
 * @typedef {{ stack: JourneyEntry[], push: (entry: JourneyEntry) => void,
 *   back: () => JourneyEntry | null, clear: () => void }} Journey
 */

const EMPTY = Object.freeze([]);

/**
 * The screen's journey: identity-stable across renders (the selection hook's callbacks list it).
 * @returns {Journey}
 */
export function useJourney() {
  return React.useMemo(() => ({
    stack: /** @type {JourneyEntry[]} */ (/** @type {unknown} */ (EMPTY)),
    push() {},
    back() { return null; },
    clear() {},
  }), []);
}
