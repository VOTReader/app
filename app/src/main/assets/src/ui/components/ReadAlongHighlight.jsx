/* ═══════════════════════════════════════════════════════════════════════
   ReadAlongHighlight — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Karaoke-style read-along: while THIS letter's track is playing, the
   sentence currently being read gets a soft gold wash and the view
   follows it. Timing data comes from AUDIO_SYNC (generated offline by
   tools/align-audio.py; lazy corpus global like AUDIO_MANIFEST, riding
   bundle-a-vot):

     AUDIO_SYNC["volKey:letterId"] = [[startSec, blockIndex, charStart,
                                       charEnd, partIndex], …] (by startSec)

   Char offsets live in the BLOCK's DOM textContent domain — the same
   domain the annotation engine measures — so painting works through the
   CSS Custom Highlight API (chrome 105+, floor is 108): a Range over the
   block's text nodes, registered as ::highlight(vot-reading). NO DOM
   mutation — annotations, selection, and the read detector are untouched.

   Renders nothing; it's an effect bundle. Mounted by LetterView and
   WtlbEntryView (live pane only — never in an inert swipe peek, which
   would fight over the ONE global ::highlight registration).

   ┌─ THE SCROLLTOP LEASE — THIS IS THE FIFTH WRITER ──────────────────┐
   │ hooks/use-autoscroll.js's header enumerates the writers that may  │
   │ touch `.screen-scroll`'s scrollTop: the user's finger, scroll     │
   │ memory's startRestore (body.scroll-restoring), the pager's swipe  │
   │ settle, and the autoscroll transport (body.autoscroll-running).   │
   │ AT MOST ONE MAY WRITE AT A TIME. Follow-scroll is the fifth, so   │
   │ it obeys the same one invariant, three ways:                      │
   │                                                                   │
   │  1. STAND DOWN while another writer is flagged — body carrying    │
   │     `autoscroll-running` or `scroll-restoring` means the lease is │
   │     already held; we do not write, and an in-flight glide aborts. │
   │  2. USER INTENT REVOKES IT. A wheel / touchmove / pointerdown on  │
   │     the container means the reader took the wheel: follow-scroll  │
   │     suspends for USER_SCROLL_MS. Recorded as a REF timestamp, not │
   │     state — a yield must never re-render the reading screen.      │
   │  3. THE MOTION IS OURS, and interruptible. The original shipped   │
   │     `scrollBy({behavior:'smooth'})`, which use-autoscroll rejects │
   │     by name: browser-owned smooth scrolling is uninterruptible,   │
   │     so a reader grabbing the page mid-scroll fights it and the    │
   │     lease cannot be handed back. Instead: a SHORT rAF glide we    │
   │     own (GLIDE_MS), every frame a plain `scrollTop =` assignment  │
   │     — the same write use-autoscroll makes — that aborts on the    │
   │     first sign of any other writer. It reads scrollTop at the TOP │
   │     of the frame and compares against what it last WROTE (never a │
   │     read-back after a write: that forces synchronous layout), with │
   │     the same DRIFT_PX tolerance for device-pixel snapping.        │
   │     prefers-reduced-motion collapses the glide to one assignment. │
   │  (Chosen over a bare instant assignment: sentence-to-sentence     │
   │   corrections can be a third of a viewport, and a hard jump every │
   │   few seconds is worse to read against than owned motion. The     │
   │   doctrine's objection is to UNINTERRUPTIBLE motion, not motion.) │
   └───────────────────────────────────────────────────────────────────┘

   SETTINGS (hooks/use-settings.js, both default ON, surfaced in
   Settings → Reading): `readAlongHighlight` gates the paint (and with it
   everything else — no paint, no follow), `readAlongFollow` gates only
   the scroll. They arrive as props through sharedViewProps, the way every
   other settings-driven reading-view behaviour does.

   EFFECT HYGIENE: the paint effect carries a real dependency array and
   the per-part fragment filtering is memoized, so the querySelector +
   getBoundingClientRect + filter allocation run on a fragment CHANGE —
   not on every host render. The player's own whole-second tick is the
   only steady clock in here.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';

const HL_NAME = 'vot-reading';
/** How long a deliberate user scroll suspends follow-scroll. */
const USER_SCROLL_MS = 4000;
/** Length of the owned glide. Short enough to finish between sentences. */
const GLIDE_MS = 260;
/**
 * Divergence between what we wrote and what we read back that counts as
 * "somebody else moved this". Same value + same reason as use-autoscroll's:
 * scrollTop snaps writes to device pixels, so a legitimate read-back differs
 * by up to 0.5/DPR px; a real external write is orders of magnitude larger.
 */
const DRIFT_PX = 1.5;

/** @returns {any[] | null} */
function _syncFor(key) {
  const g = /** @type {any} */ (globalThis);
  return (g.AUDIO_SYNC && g.AUDIO_SYNC[key]) || null;
}

/**
 * Binary search: index of the last fragment whose start ≤ t, or -1 when the
 * clock is still ahead of the first one. Pure — exported for the unit suite.
 *
 * @param {any[]} frags
 * @param {number} t
 * @returns {number}
 */
export function fragmentAt(frags, t) {
  let lo = 0, hi = frags.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frags[mid][0] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/**
 * Build a Range over [cs, ce) in the element's textContent domain. Returns
 * null — never throws — when the offsets fall past the end of the element's
 * text (a stale alignment row against re-rendered prose), so the caller
 * simply paints nothing that tick. Pure; exported for the unit suite.
 *
 * @param {Element} el
 * @param {number} cs
 * @param {number} ce
 * @returns {Range | null}
 */
export function rangeIn(el, cs, ce) {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode = null, startOff = 0, endNode = null, endOff = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (startNode === null && pos + len > cs) { startNode = node; startOff = cs - pos; }
    if (pos + len >= ce) { endNode = node; endOff = ce - pos; break; }
    pos += len;
  }
  if (!startNode || !endNode) return null;
  const r = doc.createRange();
  try { r.setStart(startNode, startOff); r.setEnd(endNode, endOff); } catch (_e) { return null; }
  return r;
}

/**
 * The LIVE reading container this body sits in. `closest`, not a document
 * query: an inert pager peek renders its own `.screen-scroll`, and a document
 * query could hand us that one.
 *
 * @param {{ current: any }} mainRef
 * @returns {any}
 */
function _scrollerOf(mainRef) {
  const el = mainRef && mainRef.current;
  return (el && typeof el.closest === 'function') ? el.closest('.screen-scroll') : null;
}

/** Another writer holds the container's scrollTop right now. */
function _leaseHeld() {
  if (typeof document === 'undefined' || !document.body) return false;
  const c = document.body.classList;
  return c.contains('autoscroll-running') || c.contains('scroll-restoring');
}

function _reducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_e) { return false; }   // matchMedia absent in some embedded webviews
}

/**
 * Drop any glide we own. Called on user intent, on a retarget, and on unmount.
 *
 * @param {{ current: number | null }} glideRef
 * @returns {void}
 */
function _cancelGlide(glideRef) {
  if (glideRef.current != null) {
    try { cancelAnimationFrame(glideRef.current); } catch (_e) { /* frame source gone */ }
    glideRef.current = null;
  }
}

/**
 * Glide the container to `to` over GLIDE_MS, yielding the lease instantly if
 * anyone else touches scrollTop. See the lease block in the module header.
 *
 * @param {any} el
 * @param {number} to
 * @param {{ current: number | null }} glideRef
 * @returns {void}
 */
function _glideTo(el, to, glideRef) {
  _cancelGlide(glideRef);
  const from = el.scrollTop || 0;
  if (to === from) return;
  if (_reducedMotion() || typeof requestAnimationFrame !== 'function') { el.scrollTop = to; return; }
  let t0 = null;
  let wrote = from;
  const step = (ts) => {
    glideRef.current = null;
    // READ-FIRST: compare what the container reads NOW against what we last
    // wrote. Reading back after a write is a forced synchronous layout.
    if (_leaseHeld() || Math.abs((el.scrollTop || 0) - wrote) > DRIFT_PX) return;
    const t = (typeof ts === 'number' && Number.isFinite(ts)) ? ts : Date.now();
    if (t0 === null) t0 = t;
    const p = Math.min(1, GLIDE_MS > 0 ? (t - t0) / GLIDE_MS : 1);
    const v = from + (to - from) * (p * (2 - p));   // ease-out; no easing on the value we land on
    el.scrollTop = v;
    wrote = v;
    if (p < 1) glideRef.current = requestAnimationFrame(step);
  };
  glideRef.current = requestAnimationFrame(step);
}

/**
 * Keep the spoken sentence inside the reading band — subject to the lease.
 *
 * @param {Range} range
 * @param {{ current: any }} mainRef
 * @param {{ current: number }} userScrollAt
 * @param {{ current: number | null }} glideRef
 * @returns {void}
 */
function _follow(range, mainRef, userScrollAt, glideRef) {
  if (_leaseHeld()) return;
  if (Date.now() - userScrollAt.current < USER_SCROLL_MS) return;
  const scroller = _scrollerOf(mainRef);
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  if (!box.height) return;   // not laid out (hidden tab, jsdom) — nothing to aim at
  const rect = range.getBoundingClientRect();
  const bandTop = box.top + box.height * 0.25;
  const bandBot = box.top + box.height * 0.6;
  if (rect.top >= bandTop && rect.bottom <= bandBot) return;
  // No manual clamp: each frame is an absolute assignment the engine clamps,
  // and the glide interpolates between two values fixed at its start, so an
  // out-of-range target can never accumulate into drift.
  _glideTo(scroller, (scroller.scrollTop || 0) + (rect.top - (box.top + box.height * 0.35)), glideRef);
}

/**
 * @param {object} props
 * @param {string} props.volKey
 * @param {string} props.letterId
 * @param {{ current: HTMLElement | null }} props.mainRef - the .letter-body ref
 * @param {(id: string, i: number) => string} props.hlKeyFn - letterHlKey / wtlbHlKey
 * @param {boolean} [props.readAlongOn] - settings.readAlongHighlight (paint)
 * @param {boolean} [props.readAlongFollow] - settings.readAlongFollow (scroll)
 */
export function ReadAlongHighlight({ volKey, letterId, mainRef, hlKeyFn, readAlongOn = true, readAlongFollow = true }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  const key = volKey + ':' + letterId;
  const st = AudioPlayer.getState();
  const track = st.queue[st.qi];
  const active = !!track && track.key === key && (st.status === 'playing' || st.status === 'loading');
  const time = st.time;
  const lastFrag = React.useRef(-1);
  const userScrollAt = React.useRef(0);
  const glide = React.useRef(/** @type {number | null} */ (null));

  // Multi-part letters: the part now playing is the position of the current
  // queue item within this letter's same-key run. Walks only that contiguous
  // run, so it is O(parts) — never the whole collection queue.
  let part = 0;
  for (let j = st.qi - 1; j >= 0 && st.queue[j] && st.queue[j].key === key; j--) part++;

  // Two reads off the frozen lazy corpus — cheap, and `rows` keeps a stable
  // identity, so the filter below re-allocates only when the letter, the part,
  // or playing-ness changes (or once, when the lazy corpus finally lands).
  const rows = (active && readAlongOn) ? _syncFor(key) : null;
  const frags = React.useMemo(() => {
    if (!rows || !rows.length) return null;
    const only = rows.filter((f) => (f[4] || 0) === part);
    return only.length ? only : null;
  }, [rows, part]);

  // USER INTENT REVOKES THE LEASE (header rule 2). Capture + passive, matching
  // use-autoscroll's own yield listeners so it cannot be starved by the pager's
  // or the tap-suppressor's handlers, and never needs to cancel.
  React.useEffect(() => {
    const el = _scrollerOf(mainRef);
    if (!el) return undefined;
    const mark = () => { userScrollAt.current = Date.now(); _cancelGlide(glide); };
    const opts = { capture: true, passive: true };
    el.addEventListener('wheel', mark, opts);
    el.addEventListener('touchmove', mark, opts);
    el.addEventListener('pointerdown', mark, opts);
    return () => {
      el.removeEventListener('wheel', mark, true);
      el.removeEventListener('touchmove', mark, true);
      el.removeEventListener('pointerdown', mark, true);
    };
  }, [mainRef, key]);

  React.useEffect(() => {
    const supported = typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights;
    if (!supported) return undefined;
    if (!frags || !mainRef.current) {
      /** @type {any} */ (CSS).highlights.delete(HL_NAME);
      lastFrag.current = -1;
      return undefined;
    }
    const i = fragmentAt(frags, time + 0.15); // slight lead — eye beats ear
    if (i === lastFrag.current) return undefined;
    lastFrag.current = i;
    if (i < 0) { /** @type {any} */ (CSS).highlights.delete(HL_NAME); return undefined; }
    const [, bi, cs, ce] = frags[i];
    const blockEl = mainRef.current.querySelector('[data-hl-key="' + hlKeyFn(letterId, bi) + '"]');
    if (!blockEl) return undefined;
    let range;
    if (ce === -1) {
      // Format B sentinel — paint the whole paragraph block.
      range = blockEl.ownerDocument.createRange();
      try { range.selectNodeContents(blockEl); } catch (_e) { return undefined; }
    } else {
      range = rangeIn(blockEl, cs, ce);
    }
    if (!range) return undefined;
    const H = /** @type {any} */ (globalThis).Highlight;
    if (typeof H !== 'function') return undefined;
    /** @type {any} */ (CSS).highlights.set(HL_NAME, new H(range));
    if (readAlongFollow) _follow(range, mainRef, userScrollAt, glide);
    return undefined;
  }, [frags, time, letterId, hlKeyFn, mainRef, readAlongFollow]);

  // Unmount / letter change: clear the wash and drop any glide we still own.
  React.useEffect(() => () => {
    _cancelGlide(glide);
    if (typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights) {
      /** @type {any} */ (CSS).highlights.delete(HL_NAME);
    }
  }, [key]);

  return null;
}
