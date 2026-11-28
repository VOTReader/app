/* use-unasked — a screen's unasked surface asks utils/unasked.js before it shows (newcomer, 2026-11-27).
   `wanted`: the surface would show now on its own terms; `pause`: the reader is at a pause (Home, a reading's
   end). Returns whether it shows. The claim waits one tick, so a surface due earlier in WAIT_ORDER that registers
   in the same commit (the install popup, mounted beside the screens) is seen first. */
import { claim, spokeThisSession, subscribeUnasked, unaskedVersion } from '../utils/unasked.js';

/**
 * @param {string} kind @param {boolean} wanted @param {boolean} [pause]
 * @returns {boolean}
 */
export function useUnasked(kind, wanted, pause = true) {
  const v = React.useSyncExternalStore(subscribeUnasked, unaskedVersion);
  const [, setMine] = React.useState(false);
  React.useEffect(() => {
    if (!wanted || !pause || spokeThisSession() === kind) return undefined;
    const t = setTimeout(() => { if (claim(kind, { pause })) setMine(true); }, 0);
    return () => clearTimeout(t);
  }, [kind, wanted, pause, v]);
  return wanted && spokeThisSession() === kind;
}
