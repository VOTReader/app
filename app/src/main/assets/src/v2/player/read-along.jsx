/* player/read-along.jsx - the read sentence lit on v2's letter body (rv1, 1b-letter-playing). Main's ReadAlongHighlight
   (bundle-d, on window) does the work over the one engine: the same timings file, wash, follow, tap-to-seek and
   double-tap rule as the v1 letter. Importing it here would bundle a second AudioPlayer into bundle-v2, so it is read
   from window at render time. A gate boot never touches the engine: it paints a still wash at the row's playing.at
   through main's paintReadAlongAt (the live wash's own paint path) and holds the gate until the wash is on the page. */

const g = /** @type {any} */ (globalThis);

/** Gate washes not yet painted. The player's `ready` waits until there are none (App's gate waits on the player). */
const pending = new Set();
const listeners = new Set();
const bump = () => { listeners.forEach((cb) => cb()); };
export const stillWashes = {
  /** @param {() => void} cb */
  subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  pending: () => pending.size,
};

/**
 * The gate's clock on this letter: the row's playing.at when the gate is playing THIS letter, else null.
 * @param {any} gate @param {string} collection @param {number} n @returns {number | null}
 */
export function gateAt(gate, collection, n) {
  const p = gate && gate.playing;
  const it = p && p.item;
  return it && it.collection === collection && it.n === n ? Number(p.at) || 0 : null;
}

const noSubscribe = () => () => {};
const noVersion = () => 0;

/**
 * Lights the sentence being read on a letter body. `bodyRef` holds the element whose [data-hl-key] blocks carry the
 * letter's text (LetterBlock), the same contract as v1's .letter-body.
 * @param {{ gate: any, collection: string, n: number, volKey: string, letterId: string,
 *   bodyRef: { current: HTMLElement | null }, on?: boolean, follow?: boolean, onListen?: (() => void) | null }} props
 */
export function LetterReadAlong({ gate, collection, n, volKey, letterId, bodyRef, on = true, follow = true, onListen = null }) {
  if (gate) return <StillWash at={on ? gateAt(gate, collection, n) : null} volKey={volKey} letterId={letterId} bodyRef={bodyRef} />;
  const RA = g.ReadAlongHighlight;
  if (typeof RA !== 'function' || typeof g.letterHlKey !== 'function' || !volKey || !letterId) return null;
  return <RA volKey={volKey} letterId={letterId} mainRef={bodyRef} hlKeyFn={g.letterHlKey}
    readAlongOn={on} readAlongFollow={follow} onListen={onListen} />;
}

/** @param {{ at: number | null, volKey: string, letterId: string, bodyRef: { current: HTMLElement | null } }} props */
function StillWash({ at, volKey, letterId, bodyRef }) {
  const store = g.__audioSyncStore;
  const version = React.useSyncExternalStore(store ? store.subscribe : noSubscribe, store ? store.getVersion : noVersion);
  const want = at == null ? null : volKey + ':' + letterId + '@' + at;
  // Held from the first commit (layout, so App's gate effect in the same commit already sees it) until painted.
  const held = React.useRef(/** @type {object | null} */ (null));
  const settle = () => { if (held.current && pending.delete(held.current)) bump(); held.current = null; };
  React.useLayoutEffect(() => {
    if (want == null) return undefined;
    const token = {};
    held.current = token;
    pending.add(token);
    bump();
    return () => {
      if (pending.delete(token)) bump();
      if (held.current === token) held.current = null;
      if (typeof g.clearReadAlong === 'function') g.clearReadAlong();
    };
  }, [want]);
  // Every render until it is painted: the body arrives with the lazy volume and the timings file with its store.
  React.useLayoutEffect(() => {
    if (want == null || !held.current) return;
    if (typeof g.paintReadAlongAt !== 'function' || typeof g.letterHlKey !== 'function') { settle(); return; }
    if (!bodyRef.current || !bodyRef.current.querySelector('[data-hl-key]')) return;
    const r = g.paintReadAlongAt({ mainEl: bodyRef.current, volKey, letterId, hlKeyFn: g.letterHlKey, time: at });
    if (r !== 'waiting') settle();
  });
  void version;
  return null;
}
