/* now-playing.js - which recording the player has loaded, for pages that light its row (mw5: the collection page).

   A gate boot reads gate.playing (the shape agreed with readalong 10-14); a real boot reads main's one engine, the
   AudioPlayer global (bundle-d), and re-renders when its state changes. readalong's player/source.js wraps the same
   engine for the player UI; this reads only what a list needs. */
import { nowPlayingFromEngine, nowPlayingFromGate } from './collection-facts.js';

const g = /** @type {any} */ (globalThis);
const NONE = () => () => {};

/**
 * The loaded recording ({ collection, n | letterId, paused }) or null. Re-renders only when that answer changes, not on
 * every tick of the playing time.
 * @param {import('./gate.js').GateState | null} gate
 * @returns {import('./collection-facts.js').NowPlaying | null}
 */
export function useNowPlaying(gate) {
  const player = gate ? null : g.AudioPlayer;
  const subscribe = React.useCallback(
    (cb) => (player && typeof player.subscribe === 'function' ? player.subscribe(cb) : NONE()),
    [player],
  );
  const sig = React.useSyncExternalStore(subscribe, () => signature(player));
  return React.useMemo(() => {
    if (gate) return nowPlayingFromGate(gate.playing);
    return player && typeof player.getState === 'function' ? nowPlayingFromEngine(player.getState()) : null;
    // sig is the player's answer in one string: the memo follows it, not the engine's every version
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, player, sig]);
}

/** The loaded track and whether it is paused, as one comparable string. */
function signature(player) {
  if (!player || typeof player.getState !== 'function') return '';
  const np = nowPlayingFromEngine(player.getState());
  return np ? np.collection + ':' + np.letterId + (np.paused ? ':paused' : '') : '';
}
