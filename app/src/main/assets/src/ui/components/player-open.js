/* The full player (AudioManagerSheet) is mounted by the mini bar, which hides on the Listen root because the Continue
   card is the player there (listen.html au-root). The card asks for the full player through here; the bar, hidden or
   not, listens and opens it. No React state crosses the two: one listener set, one call. */

/** @type {Set<() => void>} */
const listeners = new Set();

/** Ask the mounted player bar to open the full player. @returns {boolean} whether anything listened */
export function requestFullPlayer() {
  listeners.forEach((fn) => fn());
  return listeners.size > 0;
}

/** @param {() => void} fn @returns {() => void} */
export function onFullPlayerRequest(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Why the last start failed, while the player sits paused on it (player brief 3g): the bar's line 2, and the
 * Continue card's meta on the Listen root where the bar hides.
 * @param {{ status?: string, failed?: any, qi?: number, queue?: any[] }} st @returns {string | null}
 */
export function playerFailLine(st) {
  const failed = st && st.status === 'paused' ? st.failed : null;
  if (!failed) return null;
  const queue = Array.isArray(st.queue) ? st.queue : [];
  if (failed === 'offline') return (st.qi || 0) < queue.length - 1 ? 'Nothing ahead is on this phone' : 'Not on this phone';
  return failed === 'signal' ? 'No signal. Your place is kept.' : 'Couldn’t load';
}
