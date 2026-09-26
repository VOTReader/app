/* ═══════════════════════════════════════════════════════════════════════
   stores/corpus-mark-remap.js — marks a corpus edit moved go back to their words (n4-02)
   ═══════════════════════════════════════════════════════════════════════
   A mark on a letter or a Words To Live By / Answers / Blessed / Holy Days
   entry (highlight, underline, squiggle, note, either end of a link) is keyed
   by its block's POSITION in the entry: letter:<id>:<n>, wtlb:<id>:<n>
   (utils/hl-keys.js). A corpus edit that inserted or removed a block above
   others moved every mark below it onto other words: c62 did it to the
   Answers topic 'Regarding Spiritual Gifts' (115 paragraphs down one), and an
   earlier Bible Studies edit to eight 'Lamb of God' chapters. The commit gate
   (tools/check-mark-anchors.mjs) stops the next such edit; this puts back the
   marks the past ones moved.

   WHERE A MARK MAY GO is only ever proven history: stores/mark-shifts.js
   (tools/gen-mark-shifts.mjs) lists, per entry, each unchanged block that some
   past version of the corpus held at another index (old -> new). A key whose
   entry and position are not in that list is never touched.

   WHETHER IT GOES is the reader's own words, on screen. LetterView and
   WtlbEntryView tag their body with data-mark-entry (the key prefix) and
   data-mark-blocks (the block count), and after
   every paint (useDomAnnotationSync) each mark of a listed entry is read
   against the words of its block in the form it was recorded in (anchor-view.js
   chromeAwareView, SelectionToolbar's hlDisplayText form). A mark whose own
   block still holds its words, moved or re-punctuated (anchor-resolve.js
   resolveAnchor, all tiers), stays: it was made on today's text. Otherwise it
   moves along a listed move only to a block that holds its recorded words
   EXACTLY at the offsets it was made at (the unchanged block holds them
   there), and only when exactly one such block does. Anything else stays.
   A block drawn another way than when the mark was made (WTLB footnotes on,
   a mid-paragraph ref drawn as a digit) can fail its own block's check, but
   its listed target is another paragraph, drawn the same way, which does not
   hold those words at those offsets: it stays, and moves on a visit in the
   drawing it was made in.

   What never moves: a mark with no recorded words (a bookmark keeps only a
   label, a whole-entry link end only a title, a note follows its segments), an
   entry id two books share (the list leaves them out: 'introduction' is in
   WTLB One, Two and The Blessed). A listed position whose block today has no
   key (a heading where a paragraph was) goes straight to the target check.

   Known and left (refuter r2, low): a block whose index is listed stays listed;
   a later in-place edit that removes a today-made mark's words from it could
   send that mark to its listed target if the same words sit there at the same
   offsets (133 such candidates today, e.g. a lone bullet). The gate lets such
   an edit through.

   The store engine is the journal re-key's (journal-mark-rekey.js
   rekeyMarkStores): segments move one by one, a note's keys follow its
   segments, a moved record is stamped half a millisecond past its own stamp
   so the cross-tab merge keeps the move and a later real edit still wins.
   A pass that moves something writes one DiagnosticLog line, which rides the
   reader's next backup. A moved mark's words are then in its own block, so
   a second pass moves nothing.
   ═══════════════════════════════════════════════════════════════════════ */

import { rekeyMarkStores } from './journal-mark-rekey.js';
import { MARK_SHIFTS } from './mark-shifts.js';
import { resolveAnchor } from '../renderer/anchor-resolve.js';
import { chromeAwareView, viewIndexOf } from '../renderer/anchor-view.js';

/** A range at the end of a link end's key: :<start>-<end> (journal-mark-rekey.js RANGE). */
var RANGE = /:(\d+)-(\d+)$/;

/**
 * @typedef {{ text: string, at: number[] }} BlockView - a block's words as recorded, `at` maps them to textContent
 * @typedef {{
 *   prefix: string,
 *   count: number,
 *   view: (n: number) => BlockView | null,
 * }} MarkEntry - one entry on screen: its key prefix, its block count, the words of a block it keys
 */

/**
 * old index -> the new indices it moved to, per prefix.
 * @param {Record<string, number[]>} shifts
 * @returns {Record<string, Map<number, number[]>>}
 */
function movesByPrefix(shifts) {
  /** @type {Record<string, Map<number, number[]>>} */ var out = Object.create(null);
  Object.keys(shifts || {}).forEach(function(p) {
    var flat = shifts[p] || [];
    /** @type {Map<number, number[]>} */ var m = new Map();
    for (var i = 0; i + 1 < flat.length; i += 2) {
      var to = m.get(flat[i]) || [];
      if (to.indexOf(flat[i + 1]) < 0) to.push(flat[i + 1]);
      m.set(flat[i], to);
    }
    out[p] = m;
  });
  return out;
}

var MOVES = movesByPrefix(MARK_SHIFTS);

/**
 * The stores' data with every mark a listed move displaced, of the entries on
 * screen, put back on its words.
 * @param {MarkEntry[]} entries
 * @param {{annotations?: Record<string, any[]> | null, notes?: Record<string, any> | null, bookmarks?: any[] | null, links?: any[] | null}} data
 * @param {Record<string, number[]>} [shifts] - default MARK_SHIFTS
 * @returns {{annotations?: Record<string, any[]>, notes?: Record<string, any>, bookmarks?: any[], links?: any[], moved: number, left: number}}
 */
export function remapCorpusMarkData(entries, data, shifts) {
  var moves = shifts ? movesByPrefix(shifts) : MOVES;
  // Only entries with listed moves; the longest prefix first, so an id that begins another never takes its keys.
  var list = (entries || []).filter(function(e) { return e && e.prefix && moves[e.prefix]; })
    .sort(function(a, b) { return b.prefix.length - a.prefix.length; });

  /**
   * @param {any} key @param {boolean} ranged
   * @returns {{ entry: MarkEntry, n: number, to: number[], range: string } | null}
   */
  function parse(key, ranged) {
    var k = String(key == null ? '' : key);
    var range = '';
    if (ranged) {
      var r = RANGE.exec(k);
      if (r) { range = r[0]; k = k.slice(0, r.index); }
    }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (k.lastIndexOf(e.prefix, 0) !== 0) continue;
      var tail = k.slice(e.prefix.length);
      if (!/^\d+$/.test(tail)) continue;
      var to = moves[e.prefix].get(Number(tail));
      return to ? { entry: e, n: Number(tail), to: to, range: range } : null;
    }
    return null;
  }

  /**
   * @param {{ entry: MarkEntry, n: number, to: number[] }} p @param {any} _text
   * @param {{start?: any, end?: any, text?: any} | null} at
   * @returns {string | null | false}
   */
  function place(p, _text, at) {
    // Only the words a mark recorded, where it recorded them: never a label or a title.
    var words = at && typeof at.text === 'string' ? at.text : '';
    if (!at || !words.trim() || typeof at.start !== 'number' || typeof at.end !== 'number' || !(at.end > at.start)) return false;
    var e = p.entry, n = p.n;
    // A listed position whose block today has no key (a heading now sits where a
    // paragraph was) holds no mark made on today's text: straight to the targets.
    var own = n < e.count ? e.view(n) : null;
    if (own && resolveAnchor(own.text, { start: viewIndexOf(own.at, at.start), end: viewIndexOf(own.at, at.end), text: words })) return false;
    /** @type {number[]} */ var hits = [];
    p.to.forEach(function(t) {
      var v = t < e.count ? e.view(t) : null;
      if (v && v.text.slice(viewIndexOf(v.at, at.start), viewIndexOf(v.at, at.end)) === words) hits.push(t);
    });
    return hits.length === 1 ? e.prefix + hits[0] : null;
  }

  return rekeyMarkStores(data, { parse: parse, place: place });
}

/** The store versions and entries the last pass saw: nothing changed, nothing to do. */
var lastSeen = '';

/**
 * Check the marks of the listed entries on screen and move the ones a past
 * corpus edit put on other words (see the header). Runs after each paint;
 * nothing to do unless an entry with listed moves is on screen.
 * @param {ParentNode} [root] - where to look (default document)
 * @returns {{ moved: number, left: number } | null} null when it did not run
 */
export function remapCorpusMarks(root) {
  var g = /** @type {any} */ (globalThis);
  var stores = [g.AnnotationStore, g.NoteStore, g.BookmarkStore, g.LinkStore];
  if (stores.some(function(s) { return !s || (typeof s.isReady === 'function' && !s.isReady()); })) return null;
  var scope = root || document;
  /** @type {MarkEntry[]} */ var entries = [];
  /** @type {Record<string, boolean>} */ var seen = Object.create(null);
  scope.querySelectorAll('[data-mark-entry]').forEach(function(el) {
    var prefix = el.getAttribute('data-mark-entry') || '';
    var count = Number(el.getAttribute('data-mark-blocks'));
    if (!prefix || !MOVES[prefix] || seen[prefix] || !(count >= 0)) return;
    seen[prefix] = true;
    /** @type {Map<number, Element>} */ var blocks = new Map();
    el.querySelectorAll('[data-hl-key]').forEach(function(b) {
      var k = b.getAttribute('data-hl-key') || '';
      if (k.lastIndexOf(prefix, 0) !== 0) return;
      var tail = k.slice(prefix.length);
      if (/^\d+$/.test(tail) && !blocks.has(Number(tail))) blocks.set(Number(tail), b);
    });
    /** @type {Map<number, BlockView>} */ var views = new Map();
    entries.push({
      prefix: prefix,
      count: count,
      view: function(n) {
        var v = views.get(n);
        if (v) return v;
        var b = blocks.get(n);
        if (!b) return null;
        v = chromeAwareView(b);
        views.set(n, v);
        return v;
      }
    });
  });
  if (!entries.length) return null;
  var sig = stores.map(function(s) { return typeof s.getVersion === 'function' ? s.getVersion() : ''; }).join('|') + '|' +
    entries.map(function(e) { return e.prefix + e.count; }).join('|');
  if (sig === lastSeen) return null;
  lastSeen = sig;
  var next = remapCorpusMarkData(entries, {
    annotations: g.AnnotationStore.all(),
    notes: g.NoteStore.all(),
    bookmarks: g.BookmarkStore.all(),
    links: g.LinkStore.all()
  });
  if (next.annotations) g.AnnotationStore.replaceAll(next.annotations);
  if (next.notes) g.NoteStore.replaceAll(next.notes);
  if (next.bookmarks) g.BookmarkStore.replaceAll(next.bookmarks);
  if (next.links) g.LinkStore.replaceAll(next.links);
  if (next.moved > 0 && g.DiagnosticLog) {
    try {
      g.DiagnosticLog.warn('corpus-remap', 'moved ' + next.moved + ' in ' + entries.map(function(e) { return e.prefix; }).join(' '));
    } catch (_e) { /* logging must never break the pass */ }
  }
  return { moved: next.moved, left: next.left };
}

/** Tests: forget what the last pass saw. */
export function _resetCorpusRemap() {
  lastSeen = '';
}
