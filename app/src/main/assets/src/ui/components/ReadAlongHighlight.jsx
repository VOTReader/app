/* ═══════════════════════════════════════════════════════════════════════
   ReadAlongHighlight — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Karaoke-style read-along: while THIS letter's track is playing, the
   sentence currently being read gets a soft gold wash and the view
   follows it. Timing data comes from AUDIO_SYNC (generated offline by
   tools/batch-align.py), a classic-script global like AUDIO_MANIFEST — but
   since c41 it is its OWN lazy file, src/data/audio-sync.js, fetched through
   utils/sync-loaders.js the first time THIS letter's track is loaded with
   the wash on (see the loader effects in the component), never as a member
   of bundle-a-vot:

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

   ┌─ THE CLOCK ───────────────────────────────────────────────────────┐
   │ The store's `time` only moves when the whole SECOND changes (the  │
   │ timeupdate re-render guard in audio-player.js), so sub-second      │
   │ alignment is invisible through it. The paint is therefore driven  │
   │ by a requestAnimationFrame loop reading                            │
   │ `AudioPlayer.getPreciseTime()` — the element's live currentTime.  │
   │ The loop touches REFS ONLY: no setState, so the reading screen    │
   │ never re-renders per frame, and rAF's own background-tab throttle │
   │ is the visibility gate (a hidden tab stops asking for frames).    │
   │ It paints ONLY when the fragment INDEX changes, so follow-scroll  │
   │ keeps exactly its old cadence — one retarget per sentence.        │
   │                                                                    │
   │ The player's whole-second tick stays wired as a SAFETY NET, doing │
   │ the same index check. The two drivers cannot double-paint: the    │
   │ `i !== lastFrag.current` guard makes whichever arrives second a   │
   │ no-op. In a browser the frame loop always wins (60 Hz vs 1 Hz);   │
   │ where frames never come — no rAF at all, or a harness that owns   │
   │ the frame source — the tick is what keeps the wash moving.        │
   └───────────────────────────────────────────────────────────────────┘

   EFFECT HYGIENE: the paint effects carry real dependency arrays and
   the per-part fragment filtering is memoized, so the querySelector +
   getBoundingClientRect + filter allocation run on a fragment CHANGE —
   not on every host render and not on every frame.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { loadAudioSync, audioSyncStore, loadBibleSync, bibleSyncStore } from '../../utils/sync-loaders.js';

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
/**
 * THE ONE PERCEPTUAL LEAD. The eye wants the wash a beat before the ear
 * confirms it. The alignment data ships TRUE onsets — no lead baked in — so
 * this constant is the single place a lead exists in the whole pipeline. The
 * karaoke QA pages (tools/hone-sample.mjs, tools/hone-bible-sample.mjs) mirror
 * this value so what an ear check hears is what the app will paint.
 */
const LEAD_S = 0.15;

/**
 * The release asset this track streams: the URL's last path segment without
 * its `.mp3`. Every VOT audio URL is `<releasePrefix><assetId>.mp3` and the
 * asset id is `[A-Za-z0-9_-]+` (utils/audio-track.js owns that contract).
 *
 * @param {any} track
 * @returns {string}
 */
function _assetIdOf(track) {
  const url = (track && typeof track.url === 'string') ? track.url : '';
  const tail = url.slice(url.lastIndexOf('/') + 1);
  return tail.slice(-4).toLowerCase() === '.mp3' ? tail.slice(0, -4) : '';
}

/**
 * The per-ASSET timeline of an alternate rendition, when one has shipped.
 * Alternates are aligned individually (each reader's recording has its own
 * pacing), so they are keyed by asset id rather than by letter.
 *
 * @param {any} track
 * @returns {any[] | null}
 */
function _altRowsFor(track) {
  const g = /** @type {any} */ (globalThis);
  const id = _assetIdOf(track);
  return (id && g.AUDIO_SYNC_ALT && g.AUDIO_SYNC_ALT[id]) || null;
}

/**
 * Verse rows for the Bible chapter now playing, in the same 5-tuple shape the
 * letters use so nothing downstream needs a second code path.
 *
 * The shipped data is deliberately minimal — `BIBLE_SYNC_<EDITION>[book][ch]`
 * is a positional array of integer CENTISECONDS, one slot per verse, `0`
 * meaning "not proven, do not paint". 31,102 verses cost ~184 KB that way, and
 * the file loads only when a Bible track is actually playing.
 *
 * The unit is a WHOLE VERSE, which is what makes this translation-proof. The
 * default configuration is already cross-translation — bibleAudio defaults to
 * brm-kjv (KJV) while the reader's text defaults to NKJV — and at verse
 * granularity verse 5 is verse 5 in either. It also makes the restored-name
 * editions a non-problem: they shift text by +6 characters per restored Name,
 * which character offsets would have to chase and a whole-verse span ignores.
 *
 * So each row is `[seconds, verseNumber, -1, -1, 0]`: the -1 pair is the
 * existing whole-block sentinel, and the "block index" column carries the
 * verse NUMBER rather than a positional index — verse number is stable across
 * translations where an index is not (WEB has no Acts 8:37, so its verse 38
 * sits at index 37). A verse the rendered chapter lacks simply fails to
 * resolve and paints nothing.
 *
 * @param {string} bookId
 * @param {number} chapter
 * @param {string} volKey  e.g. 'bible-brm-kjv'
 * @returns {any[] | null}
 */
const _bibleRowCache = new Map();

function _bibleRowsFor(bookId, chapter, volKey) {
  // The expanded rows are CACHED, and that is not an optimisation. `rows` is a
  // render-time value feeding the frags memo, which feeds the dependency array
  // of the rAF loop; handing back a freshly allocated array each render would
  // tear the frame loop down and rebuild it on every whole-second clock tick.
  // The underlying table never mutates once its file has loaded, so one
  // expansion per chapter is both correct and stable.
  const g = /** @type {any} */ (globalThis);
  const edition = volKey.slice('bible-'.length);
  const table = g['BIBLE_SYNC_' + edition.toUpperCase().replace(/-/g, '_')];
  const cacheKey = volKey + ':' + bookId + ':' + chapter;
  const hit = _bibleRowCache.get(cacheKey);
  // The cached rows are only valid for the TABLE they were expanded from.
  // Holding them by key alone would serve a previous table's timings after
  // the edition's file was replaced — and it silently did exactly that
  // between tests, which is the cheap version of the same bug.
  if (hit && hit.table === table) return hit.rows;
  const book = table && table[bookId];
  const cs = book && book[String(chapter)];
  if (!Array.isArray(cs) || !cs.length) return null;   // not loaded yet — do NOT cache the miss
  const rows = [];
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] > 0) rows.push([cs[i] / 100, i + 1, -1, -1, 0]);
  }
  const out = rows.length ? rows : null;
  _bibleRowCache.set(cacheKey, { table, rows: out });
  return out;
}

/**
 * The alignment rows that belong to the recording ACTUALLY PLAYING — not
 * merely to this letter. AUDIO_SYNC is keyed by "volKey:letterId", but a
 * letter can have several complete readings (AUDIO_ALTERNATES: different
 * reader, different pacing), and painting the primary reading's timeline over
 * an alternate is a confidently wrong highlight. So: an alternate's own
 * per-asset rows win; otherwise the letter's rows ship only when this asset IS
 * the primary rendition, which AUDIO_MANIFEST is the register of. An alternate
 * with no timeline of its own paints NOTHING — honest beats plausible.
 *
 * @param {string} key
 * @param {any} track
 * @param {number} [chapter] - the VIEWED chapter, for Bible surfaces only
 * @returns {any[] | null}
 */
function _syncFor(key, track, chapter) {
  const g = /** @type {any} */ (globalThis);
  // Bible first, and never through the letters' primary-asset check below —
  // that reads AUDIO_MANIFEST, while Bible recordings live in
  // BIBLE_AUDIO_MANIFEST, so every Bible track would fail it.
  if (chapter) {
    // A book queues its WHOLE remaining run, so the chapter on screen and the
    // chapter in the speakers drift apart as it plays. Painting this chapter's
    // verses to another chapter's clock is the most confident kind of wrong.
    if (AudioPlayer.bibleChapterOfTrack(track) !== chapter) return null;
    const [volKey, bookId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    return _bibleRowsFor(bookId, chapter, volKey);
  }
  const alt = _altRowsFor(track);
  if (alt) return alt;
  const rows = (g.AUDIO_SYNC && g.AUDIO_SYNC[key]) || null;
  if (!rows) return null;
  const assetId = _assetIdOf(track);
  const parts = (g.AUDIO_MANIFEST && g.AUDIO_MANIFEST[key]) || null;
  if (!assetId || !Array.isArray(parts)) return null;
  for (const p of parts) { if (p && p[0] === assetId) return rows; }
  return null;
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
 * The inverse of `rangeIn`: a (text node, offset) pair back to the block's
 * textContent offset — the domain the timings address. Same TreeWalker, same
 * order, so tap-to-seek and paint can never disagree about where a character is.
 *
 * @param {any} el block element carrying data-hl-key
 * @param {any} node text node inside it
 * @param {number} nodeOffset
 * @returns {number} -1 when the node is not under this block
 */
export function offsetIn(el, node, nodeOffset) {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let n;
  while ((n = walker.nextNode())) {
    if (n === node) return pos + nodeOffset;
    pos += n.nodeValue.length;
  }
  return -1;
}

/**
 * The caret (text node + offset) under a viewport point, across both spellings
 * of the API. `caretPositionFromPoint` is the standard; Blink shipped
 * `caretRangeFromPoint` first and it is what the WebView floor (chrome108)
 * actually has, so neither may be assumed (Permanent Rule 6 — feature-detect,
 * never a target bump).
 *
 * @param {any} doc
 * @param {number} x
 * @param {number} y
 * @returns {{ node: any, offset: number } | null}
 */
export function caretAt(doc, x, y) {
  try {
    if (typeof doc.caretPositionFromPoint === 'function') {
      const p = doc.caretPositionFromPoint(x, y);
      return p && p.offsetNode ? { node: p.offsetNode, offset: p.offset } : null;
    }
    if (typeof doc.caretRangeFromPoint === 'function') {
      const r = doc.caretRangeFromPoint(x, y);
      return r ? { node: r.startContainer, offset: r.startOffset } : null;
    }
  } catch (_e) { /* detached document / hostile embed */ }
  return null;
}

/**
 * Which shipped fragment owns the text under this point — the tap target for
 * seek-to-here. Returns -1 when the point is not on timed text (an untimed
 * block, chrome, or a gap between fragments with nothing before it).
 *
 * @param {Array<any>} frags
 * @param {any} mainEl
 * @param {string} letterId
 * @param {(id: string, bi: number) => string} hlKeyFn
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function fragmentAtPoint(frags, mainEl, letterId, hlKeyFn, x, y, offsetMapFn) {
  const caret = caretAt(mainEl.ownerDocument, x, y);
  if (!caret || !caret.node) return -1;
  const host = caret.node.nodeType === 3 ? caret.node.parentElement : caret.node;
  const blockEl = host && host.closest ? host.closest('[data-hl-key]') : null;
  if (!blockEl || !mainEl.contains(blockEl)) return -1;
  const hlKey = blockEl.getAttribute('data-hl-key');
  const off = offsetIn(blockEl, caret.node, caret.offset);
  if (off < 0) return -1;
  let best = -1;
  for (let i = 0; i < frags.length; i++) {
    const [, bi, cs0, ce0] = frags[i];
    if (hlKeyFn(letterId, bi) !== hlKey) continue;
    // Format-B sentinel: the whole block is one fragment.
    if (ce0 === -1) return i;
    // The caret gives a DOM offset; a Format B row's offsets are corpus ones.
    // Project the row rather than trying to invert the caret — the projection
    // only goes one way, and a substituted run (a footnote number standing in
    // for a whole reference) has no single corpus offset to come back to.
    const map = offsetMapFn && offsetMapFn(bi);
    const cs = map ? map(cs0) : cs0;
    const ce = map ? map(ce0, true) : ce0;
    if (off >= cs && off < ce) return i;
    if (cs <= off) best = i;          // gap between clauses: the one just before
    else if (best < 0) best = i;      // tapped ahead of the block's first clause
  }
  return best;
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
 * PAINT fragment `i` (and, if follow is on, bring it into the band). Imperative
 * and idempotent-by-index: the caller has already established that `i` differs
 * from what is on screen, and `lastFrag` is claimed here — including on the
 * paths that give up (missing block, unmappable offsets), so a row that cannot
 * be painted is not retried 60 times a second.
 *
 * Module-local rather than a hook body because TWO drivers call it: the frame
 * loop and the player's whole-second tick (see THE CLOCK in the header).
 *
 * @param {any[]} frags
 * @param {number} i
 * @param {{ current: any }} mainRef
 * @param {string} letterId
 * @param {(id: string, i: number) => string} hlKeyFn
 * @param {boolean} readAlongFollow
 * @param {{ current: number }} userScrollAt
 * @param {{ current: number | null }} glideRef
 * @param {{ current: number }} lastFrag
 * @returns {void}
 */
function _paintAt(frags, i, mainRef, letterId, hlKeyFn, readAlongFollow, userScrollAt, glideRef, lastFrag, offsetMapFn) {
  lastFrag.current = i;
  const clear = () => { /** @type {any} */ (CSS).highlights.delete(HL_NAME); };
  if (i < 0) { clear(); return; }
  const [, bi, cs0, ce0] = frags[i];
  // Format B stores CORPUS offsets, because its rendered text is not its
  // corpus text and the rendered one moves (footnote route, soft line breaks,
  // whether the lazy Bible corpus has landed). The projection crosses that
  // boundary here, once, at paint time. Format A and Bible pass no map.
  const map = offsetMapFn && offsetMapFn(bi);
  const cs = map ? map(cs0) : cs0;
  const ce = map ? map(ce0, true) : ce0;
  const blockEl = mainRef.current && mainRef.current.querySelector('[data-hl-key="' + hlKeyFn(letterId, bi) + '"]');
  // EVERY give-up path clears. A row whose block is missing or whose offsets no
  // longer resolve must leave the reader with NO wash, not with the previous
  // clause still lit while the voice has moved on — a stale highlight reads as
  // a confident wrong answer, where nothing reads as honest silence. Only the
  // i < 0 case used to clear, so one unresolvable row froze the wash in place
  // until the next resolvable one.
  if (!blockEl) { clear(); return; }
  let range;
  if (ce0 === -1) {
    // Legacy Format B sentinel — paint the whole paragraph block.
    range = blockEl.ownerDocument.createRange();
    try { range.selectNodeContents(blockEl); } catch (_e) { clear(); return; }
  } else {
    range = rangeIn(blockEl, cs, ce);
  }
  if (!range) { clear(); return; }
  const H = /** @type {any} */ (globalThis).Highlight;
  if (typeof H !== 'function') { clear(); return; }
  /** @type {any} */ (CSS).highlights.set(HL_NAME, new H(range));
  if (readAlongFollow) _follow(range, mainRef, userScrollAt, glideRef);
}

/**
 * @param {object} props
 * @param {string} props.volKey
 * @param {string} props.letterId
 * @param {{ current: HTMLElement | null }} props.mainRef - the .letter-body ref
 * @param {(id: string, i: number) => string} props.hlKeyFn - letterHlKey / wtlbHlKey
 * @param {boolean} [props.readAlongOn] - settings.readAlongHighlight (paint)
 * @param {boolean} [props.readAlongFollow] - settings.readAlongFollow (scroll)
 * @param {number} [props.chapter] - Bible surfaces only: the chapter on screen.
 *   Its presence is what selects the verse-timing path; letters omit it.
 * @param {(blockIndex: number) => ((off: number, isEnd?: boolean) => number) | null} [props.offsetMapFn]
 *   Format B only: projects a corpus offset onto the rendered one.
 */
export function ReadAlongHighlight({ volKey, letterId, mainRef, hlKeyFn, readAlongOn = true, readAlongFollow = true, chapter = 0, offsetMapFn = null }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  const key = volKey + ':' + letterId;
  const st = AudioPlayer.getState();
  const track = st.queue[st.qi];
  const loaded = !!track && track.key === key;
  const active = loaded && (st.status === 'playing' || st.status === 'loading');
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
  // LOADED, not `active`: the rows are also what tap-to-seek hit-tests against,
  // and repositioning by tapping a clause is most useful while PAUSED. A
  // consequence by design — the wash now stays put when you pause instead of
  // vanishing, which is also the feedback a tap needs. The rAF driver below
  // still runs only while `active`, so a paused reader costs no frames.
  // The verse timings are their own lazy file, fetched the first time a Bible
  // recording is actually playing with read-along on. A reader who never
  // presses Listen, or who has the wash switched off, never downloads it.
  const needBibleSync = !!chapter && loaded && readAlongOn;
  React.useEffect(() => {
    if (needBibleSync) loadBibleSync(volKey);
  }, [needBibleSync, volKey]);
  // The letter timings are their own lazy file too (c41): asked for the moment
  // THIS letter's track is loaded with the wash on, and not otherwise — a
  // reader who never presses Listen, or keeps the wash off, never downloads
  // ~150 KB of timings. `loaded`, not `active`, so a paused letter still gets
  // its rows for tap-to-seek.
  const needLetterSync = !chapter && loaded && readAlongOn;
  React.useEffect(() => {
    if (needLetterSync) loadAudioSync();
  }, [needLetterSync]);
  // Both files land as globals that _syncFor reads at render, so their ARRIVAL
  // has to be a render input (the c36 lesson): one number folded from both
  // stores, carried into the frags memo deps below.
  const bibleVersion = React.useSyncExternalStore(bibleSyncStore.subscribe, bibleSyncStore.getVersion);
  const letterVersion = React.useSyncExternalStore(audioSyncStore.subscribe, audioSyncStore.getVersion);
  const corpusVersion = bibleVersion + letterVersion;

  const rows = (loaded && readAlongOn) ? _syncFor(key, track, chapter) : null;
  // An alternate rendition's rows are keyed by ASSET, so they describe exactly
  // one recording and are always part 0 — the queue-position part index means
  // nothing to them. Bible rows are per CHAPTER and likewise always part 0.
  const perAsset = !!rows && (!!chapter || rows === _altRowsFor(track));
  const frags = React.useMemo(() => {
    if (!rows || !rows.length) return null;
    const want = perAsset ? 0 : part;
    const only = rows.filter((f) => (f[4] || 0) === want);
    return only.length ? only : null;
    // corpusVersion: _syncFor reads a global the lazy loader installs later, so
    // the arrival of that file has to be a render input or the first chapter a
    // reader listens to never paints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, part, perAsset, corpusVersion]);

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

  // THE FRAME LOOP (header: THE CLOCK). Refs only — no state is written here,
  // so a frame costs one binary search and, on a sentence boundary, one paint.
  // Cancelled on pause, on unmount and on a letter change by the cleanup.
  React.useEffect(() => {
    const supported = typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights;
    if (!supported) return undefined;
    if (!active || !frags || !mainRef.current) return undefined;
    if (typeof requestAnimationFrame !== 'function') return undefined;
    let id = /** @type {number | null} */ (null);
    let stopped = false;
    const tick = () => {
      id = null;
      const i = fragmentAt(frags, AudioPlayer.getPreciseTime() + LEAD_S);
      if (i !== lastFrag.current) {
        _paintAt(frags, i, mainRef, letterId, hlKeyFn, readAlongFollow, userScrollAt, glide, lastFrag, offsetMapFn);
      }
      if (!stopped) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (id != null) { try { cancelAnimationFrame(id); } catch (_e) { /* frame source gone */ } }
    };
  }, [active, frags, letterId, hlKeyFn, mainRef, readAlongFollow, offsetMapFn]);

  // THE SAFETY NET + the structural clear. Runs on the player's whole-second
  // tick; the index guard inside makes it a no-op whenever the frame loop above
  // already moved the wash, and the only driver when frames never arrive.
  React.useEffect(() => {
    const supported = typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights;
    if (!supported) return undefined;
    if (!frags || !mainRef.current) {
      /** @type {any} */ (CSS).highlights.delete(HL_NAME);
      lastFrag.current = -1;
      return undefined;
    }
    const i = fragmentAt(frags, time + LEAD_S);
    if (i === lastFrag.current) return undefined;
    _paintAt(frags, i, mainRef, letterId, hlKeyFn, readAlongFollow, userScrollAt, glide, lastFrag, offsetMapFn);
    return undefined;
  }, [frags, time, letterId, hlKeyFn, mainRef, readAlongFollow, offsetMapFn]);

  // TAP A CLAUSE, HEAR IT. The wash itself is a CSS Custom Highlight — a
  // decoration with no box and no events — so the tap is resolved from the
  // POINT: caret → block → textContent offset → the fragment whose span holds
  // it. Adds no markup and no chrome; every timed clause is simply live.
  //
  // What must NOT be stolen: a real text selection (annotating is the reading
  // surface's primary gesture), the tap that dismisses one, a drag or scroll,
  // and any interactive descendant (footnote bubbles, scripture and letter
  // links). Seek only — the transport keeps whatever play/pause state the
  // reader chose.
  React.useEffect(() => {
    const el = mainRef.current;
    if (!frags || !el) return undefined;
    let downX = 0, downY = 0, downHadSelection = false;
    const selectionLive = () => {
      try {
        const s = el.ownerDocument.getSelection();
        return !!s && !s.isCollapsed && String(s).length > 0;
      } catch (_e) { return false; }
    };
    const onDown = (e) => {
      downX = e.clientX; downY = e.clientY;
      downHadSelection = selectionLive();
    };
    const onClick = (e) => {
      if (downHadSelection || selectionLive()) return;           // selecting, or dismissing one
      if (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10) return;   // drag/scroll
      // The three icon classes are NOT decoration. LinkIcon, BookmarkIcon and
      // the annotation engine's note icon each render a bare <span onClick>
      // with no role, and their stopPropagation runs on the REACT synthetic
      // event — dispatched from React's root container, long after the native
      // click has bubbled past this listener. So the seek fires first and
      // cannot be stopped: tapping a note icon jumped the audio.
      if (e.target && e.target.closest
          && e.target.closest('a, button, [role="button"], [role="link"], .fn-ref, .letter-link-ref, .inline-scrip-ref, .verse-link-icon, .inline-bookmark-icon, .hl-note-icon')) return;
      const i = fragmentAtPoint(frags, el, letterId, hlKeyFn, e.clientX, e.clientY, offsetMapFn);
      if (i < 0) return;                                          // untimed text — stay silent
      AudioPlayer.seek(frags[i][0]);
    };
    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick);
    };
  }, [frags, mainRef, letterId, hlKeyFn, offsetMapFn]);

  // Unmount / letter change: clear the wash and drop any glide we still own.
  React.useEffect(() => () => {
    _cancelGlide(glide);
    if (typeof CSS !== 'undefined' && /** @type {any} */ (CSS).highlights) {
      /** @type {any} */ (CSS).highlights.delete(HL_NAME);
    }
  }, [key]);

  return null;
}
