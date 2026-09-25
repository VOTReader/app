/* ═══════════════════════════════════════════════════════════════════════
   songs-route — where a reader stands inside Songs of the Letters
   ═══════════════════════════════════════════════════════════════════════
   The Songs screens are ONE routed screen ('audio-library-songs') with a small
   stack of frames kept in the tab's existing `audioColKey` field, so the hub,
   a collection's list, a song page and the "read with music" shelf need no
   new tab field and no app.jsx line (README §7, L2). Back pops a frame; Back
   from the bottom frame leaves through the ordinary navOrigin.

   The stack is JSON after a `songs:` prefix, validated frame by frame on the
   way in: a tab restored from an older build, or any string that is not ours,
   reads as the hub rather than throwing.

   Frames:
     { k: 'hub', q?, st? }   the hub; q = the Find box, st = the style chip
     { k: 'list', v }        a collection or shelf: 'col:<volKey>', 'shelf:inspired' | 'shelf:bible' |
                             'shelf:originals', 'saved', 'recent', 'new', 'kept' (on this phone, K1), 'letter:<volKey:letterId>'
     { k: 'song', v }        one song (a family id) and its versions
     { k: 'readings' }       the letters read with music
   ═══════════════════════════════════════════════════════════════════════ */

export const SONGS_SCREEN = 'audio-library-songs';
const PREFIX = 'songs:';
const KINDS = ['hub', 'list', 'song', 'readings'];
/** Deeper than any real path (hub → list → song → another song …); the oldest
 *  frames above the root give way first. */
const MAX_FRAMES = 12;

/** @typedef {{ k: 'hub' | 'list' | 'song' | 'readings', v?: string, q?: string, st?: string }} SongsFrame */

/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v.slice(0, 160) : '');

/**
 * One frame, or null when it is not one this build reads.
 * @param {unknown} raw @returns {SongsFrame | null}
 */
function frameOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {any} */ (raw);
  if (KINDS.indexOf(r.k) < 0) return null;
  if (r.k === 'hub') {
    /** @type {SongsFrame} */
    const f = { k: 'hub' };
    if (str(r.q)) f.q = str(r.q);
    if (str(r.st)) f.st = str(r.st);
    return f;
  }
  if (r.k === 'readings') return { k: 'readings' };
  const v = str(r.v);
  return v ? { k: r.k, v } : null;
}

/**
 * The frames an `audioColKey` holds — never empty: anything unreadable is the hub.
 * @param {unknown} key @returns {SongsFrame[]}
 */
export function decodeSongsRoute(key) {
  if (typeof key !== 'string' || key.lastIndexOf(PREFIX, 0) !== 0) return [{ k: 'hub' }];
  let raw;
  try { raw = JSON.parse(key.slice(PREFIX.length)); } catch (_e) { return [{ k: 'hub' }]; }
  const frames = Array.isArray(raw) ? raw.map(frameOf).filter(Boolean) : [];
  return frames.length ? /** @type {SongsFrame[]} */ (frames).slice(-MAX_FRAMES) : [{ k: 'hub' }];
}

/**
 * The `audioColKey` for a stack of frames.
 * @param {unknown[]} frames @returns {string}
 */
export function encodeSongsRoute(frames) {
  let list = (Array.isArray(frames) ? frames : []).map(frameOf).filter(Boolean);
  if (!list.length) list = [{ k: 'hub' }];
  if (list.length > MAX_FRAMES) list = [list[0]].concat(list.slice(list.length - MAX_FRAMES + 1));
  return PREFIX + JSON.stringify(list);
}

/** @param {unknown} key @param {SongsFrame} frame @returns {string} */
export function pushSongsFrame(key, frame) {
  return encodeSongsRoute(/** @type {unknown[]} */ (decodeSongsRoute(key)).concat([frame]));
}

/**
 * The stack with its top frame popped, or null when the top is the bottom
 * frame (Back then leaves the Songs screens).
 * @param {unknown} key @returns {string | null}
 */
export function popSongsFrame(key) {
  const frames = decodeSongsRoute(key);
  return frames.length > 1 ? encodeSongsRoute(frames.slice(0, -1)) : null;
}

/**
 * The stack with its top frame replaced (the hub remembering its Find box and
 * chip before a list opens over it, so Back returns to the same results).
 * @param {unknown} key @param {SongsFrame} frame @returns {string}
 */
export function replaceSongsTop(key, frame) {
  return encodeSongsRoute(/** @type {unknown[]} */ (decodeSongsRoute(key).slice(0, -1)).concat([frame]));
}
