/* ═══════════════════════════════════════════════════════════════════════
   ReadAlongHighlight — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Karaoke-style read-along: while THIS letter's track is playing, the
   sentence currently being read gets a soft gold wash and the view
   follows it. Timing data comes from AUDIO_SYNC (generated offline by
   the forced-alignment pipeline; lazy corpus global like AUDIO_MANIFEST):

     AUDIO_SYNC["volKey:letterId"] = [[startSec, blockIndex, charStart,
                                       charEnd], …]   (sorted by startSec)

   Char offsets live in the BLOCK's DOM textContent domain — the same
   domain the annotation engine measures — so painting works through the
   CSS Custom Highlight API (chrome 105+, floor is 108): a Range over the
   block's text nodes, registered as ::highlight(vot-reading). NO DOM
   mutation — annotations, selection, and the read detector are untouched.

   Renders nothing; it's an effect bundle. Mounted by LetterView (live
   pane only — never in an inert swipe peek).
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';

/** @returns {any[] | null} */
function _syncFor(key) {
  const g = /** @type {any} */ (globalThis);
  return (g.AUDIO_SYNC && g.AUDIO_SYNC[key]) || null;
}

/** Binary search: last fragment whose start ≤ t. */
function _fragAt(frags, t) {
  let lo = 0, hi = frags.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frags[mid][0] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/**
 * Build a Range over [cs, ce) in the element's textContent domain.
 * @returns {Range | null}
 */
function _rangeIn(el, cs, ce) {
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

const HL_NAME = 'vot-reading';

/**
 * @param {object} props
 * @param {string} props.volKey
 * @param {string} props.letterId
 * @param {{ current: HTMLElement | null }} props.mainRef - the .letter-body ref
 * @param {(id: string, i: number) => string} props.hlKeyFn - letterHlKey / wtlbHlKey
 */
export function ReadAlongHighlight({ volKey, letterId, mainRef, hlKeyFn }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  const key = volKey + ':' + letterId;
  const st = AudioPlayer.getState();
  const track = st.queue[st.qi];
  const active = !!track && track.key === key && (st.status === 'playing' || st.status === 'loading');
  const lastFrag = React.useRef(-1);

  React.useEffect(() => {
    const g = /** @type {any} */ (globalThis);
    const supported = typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights;
    if (!supported) return undefined;
    let frags = active ? _syncFor(key) : null;
    if (frags && frags.length) {
      // Multi-part letters: keep only the fragments of the PART now playing
      // (tuple[4]; absent = part 0). Part index = position of the current
      // queue item within this letter's same-key run.
      let part = 0;
      for (let j = st.qi - 1; j >= 0 && st.queue[j] && st.queue[j].key === key; j--) part++;
      frags = frags.filter((f) => (f[4] || 0) === part);
    }
    if (!active || !frags || !frags.length || !mainRef.current) {
      /** @type {any} */ (CSS).highlights.delete(HL_NAME);
      lastFrag.current = -1;
      return undefined;
    }
    const i = _fragAt(frags, st.time + 0.15); // slight lead — eye beats ear
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
      range = _rangeIn(blockEl, cs, ce);
    }
    if (!range) return undefined;
    const H = g.Highlight;
    if (typeof H !== 'function') return undefined;
    /** @type {any} */ (CSS).highlights.set(HL_NAME, new H(range));

    // Follow the voice: keep the active sentence inside the middle band of
    // the scroll container. Smooth, small steps — never a jarring jump.
    const scroller = document.querySelector('.screen-scroll');
    if (scroller) {
      const rect = range.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      const bandTop = box.top + box.height * 0.25;
      const bandBot = box.top + box.height * 0.6;
      if (rect.top < bandTop || rect.bottom > bandBot) {
        scroller.scrollBy({ top: rect.top - (box.top + box.height * 0.35), behavior: 'smooth' });
      }
    }
    return undefined;
  });

  // Unmount / letter change: clear the wash.
  React.useEffect(() => () => {
    if (typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights) {
      /** @type {any} */ (CSS).highlights.delete(HL_NAME);
    }
  }, [key]);

  return null;
}
