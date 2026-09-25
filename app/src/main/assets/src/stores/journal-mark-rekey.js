/* ═══════════════════════════════════════════════════════════════════════
   stores/journal-mark-rekey.js — journal marks move from block POSITIONS to block IDS (v05-01)
   ═══════════════════════════════════════════════════════════════════════
   A mark in a journal entry (highlight, underline, squiggle, note, bookmark,
   either end of a link) used to be keyed journal:<entryId>:<blockIndex>, the
   block's POSITION in the entry. The editor moves positions in normal use
   (a photo or voice memo inserted above, a paragraph deleted, a block dragged)
   and nothing re-keyed the marks, so every later mark slid onto another
   paragraph without a word. Marks are now keyed journal:<entryId>:<blockId>
   (JournalBlockView), and a block's id never changes.

   This module moves the marks already on disk. It takes the stores' data and
   returns changed copies (reading nothing else but an inline link's title,
   inlineLinkLabel); JournalStore.rekeyMarks() reads the live stores and
   writes back only what moved. It runs at every boot
   (HydrationGate) and touches only a key whose block part is a whole number
   that is no block's id, so a second run changes nothing and a restored old
   backup is moved on the boot after the restore (which reloads).

   Where an old mark goes: to the block that holds its words. A mark made
   before a photo went in above it sits one position early, and its text says
   where it belongs. A block that holds the words exactly where the mark was
   made (its own start-end offsets) beats one that holds them elsewhere; among
   equals the one nearest the old position wins (the old position itself
   first, then the lower of a tie). With no text, or no block holding it, the
   block now at the old position takes it (what the reader sees today) when
   marks can be painted there. Otherwise the key stays as it is: listed in the
   Library, painted nowhere, never on the wrong words.

   Two Codex refutations (2026-09-24) shaped the rest: a changed note,
   bookmark or link is stamped half a millisecond past its own stamp, or the
   stores' cross-tab merge (store-merge.js: a tie keeps the copy already on
   disk) put the old key back on save, and a real edit, made at a later whole
   millisecond, still beats it; an empty bucket never replaces one a moved
   mark went into; a key is split against the entries that exist, so a
   whole-entry key or a block id is never read as a position whatever the
   ids hold; a segment (its id within its group) found both under its old key
   and under its block's comes out once, the newer.

   Left alone, on purpose: a segment whose WORDS an older tab changed under
   its old key would move apart from this tab's copy (the app never edits a
   segment's words or offsets in place: recolorGroup and convertGroup change
   color and kind only); and an id key of a block whose id is a whole number,
   once that block is deleted, reads as a position (the app has never made
   such an id: journal-helpers blockId is b_<time>_<random>, only an import
   can). Keeping the block-at-the-old-position fallback serves a real reader
   who edited a marked paragraph's words since.
   ═══════════════════════════════════════════════════════════════════════ */

/** journal:<entryId>:<n> - an old POSITION key as the app made it (jrnId never puts a ':' in an id). */
var POSITION_KEY = /^journal:([^:]+):(\d+)$/;

/** A range at the end of a bookmark's hlKey or a link end's key: :<start>-<end>. */
var RANGE = /:(\d+)-(\d+)$/;

/** The block types a mark can be painted on (JournalBlockView's hlProps). */
var MARKABLE = { p: 1, h2: 1, quote: 1 };

/** The inline markup jrnRenderInline draws: bold, italic, a scripture chip, an inline link. */
var INLINE = /\*\*([\s\S]+?)\*\*|_([^_\n]+?)_|\{\{ref:([^}]+)\}\}|\[\[(letter|bookmark|journal):([^\]]+)\]\]/g;

/**
 * The key every mark on a journal block carries.
 * @param {string} entryId @param {string} blockId
 */
export function journalBlockKey(entryId, blockId) {
  return 'journal:' + entryId + ':' + blockId;
}

/**
 * The title an inline [[letter:|bookmark:|journal:]] link shows, read the way
 * jrnRenderInline reads it (JournalViewerScreen.jsx; the two are pinned together
 * by JournalViewerScreen.markkeys.test.jsx), or null when it cannot be known
 * here: a letter whose collection is not loaded, a bookmark or entry that is gone.
 * @param {string} kind - letter | bookmark | journal
 * @param {string} data - what follows the ':' (trimmed)
 * @returns {string | null}
 */
export function inlineLinkLabel(kind, data) {
  try {
    // Like the view, a link whose target is gone (or not loaded) reads as its own data.
    if (kind === 'letter') {
      var ctx = typeof findEntryContext === 'function' ? findEntryContext(data.split('/')[1], 'letter') : null;
      return ctx && ctx.title ? String(ctx.title) : data;
    }
    if (kind === 'bookmark') {
      var b = typeof BookmarkStore !== 'undefined' ? BookmarkStore.get(data) : null;
      return b ? String(b.label || 'Bookmark') : data;
    }
    if (kind === 'journal') {
      var je = typeof JournalStore !== 'undefined' ? JournalStore.get(data) : null;
      return je && typeof JournalHelpers !== 'undefined' ? String(JournalHelpers.entryDisplayTitle(je) || 'Journal Entry') : data;
    }
  } catch (_e) { /* not knowable here */ }
  return null;
}

/**
 * A block's words as the reader sees them: the markup drawn away, a {{ref:}}
 * chip read as its reference, an inline [[...]] link as the title labelOf
 * gives it (inlineLinkLabel unless told otherwise; null gives none). A title
 * nobody can give becomes a character no selection holds.
 * @param {{type?: string, text?: string}} block
 * @param {((kind: string, data: string) => string | null) | null} [labelOf]
 * @returns {string}
 */
export function blockPlainText(block, labelOf) {
  var t = block && typeof block.text === 'string' ? block.text : '';
  var titleOf = labelOf === undefined ? inlineLinkLabel : labelOf;
  return t.replace(INLINE, function(_m, bold, ital, ref, kind, data) {
    if (bold != null) return bold;
    if (ital != null) return ital;
    if (ref != null) return ref.trim();
    var label = titleOf ? titleOf(kind, String(data).trim()) : null;
    return label == null ? '\u0000' : label;
  });
}

/** @param {any} s */
function squash(s) {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
}

/**
 * How far past its own stamp a record the pass changes is stamped: enough for
 * the stores' cross-tab merge to keep the change over the untouched copy on
 * disk (a tie keeps that copy), and short of the next whole millisecond, so a
 * real edit made later (Date.now() is whole) always wins over the re-key.
 */
var STAMP_STEP = 0.5;

/**
 * A record's change stamp, read the way the stores' cross-tab merge reads it
 * (store-merge.js _stamp): updated, else created, else 0.
 * @param {any} r
 */
function stamp(r) {
  if (!r || typeof r !== 'object') return 0;
  if (typeof r.updated === 'number') return r.updated;
  if (typeof r.created === 'number') return r.created;
  return 0;
}

/**
 * Does a block's text hold these words exactly at the offsets the mark was made
 * at? null when the mark carries no offsets or no words. A bookmark's label is
 * its words trimmed, cut to 117 characters + '...' past 120 (SelectionToolbar).
 * @param {any} start @param {any} end @param {any} text
 * @returns {((plain: string) => boolean) | null}
 */
function wordsAt(start, end, text) {
  if (typeof start !== 'number' || typeof end !== 'number' || !(end > start) || typeof text !== 'string') return null;
  var want = text.trim();
  if (!want) return null;
  return function(plain) {
    var got = plain.slice(start, end).trim();
    return got === want || (got.length > 120 && got.slice(0, 117) + '...' === want);
  };
}

/**
 * The id of the block an old position key's mark belongs to, or null.
 * @param {Array<{id?: string, type?: string, text?: string}>} blocks
 * @param {number} idx - the old position
 * @param {string | null} [text] - the mark's own words, when it kept them
 * @param {{
 *   exact?: ((plain: string) => boolean) | null,
 *   plain?: ((block: any) => string) | null,
 *   labelOf?: ((kind: string, data: string) => string | null) | null,
 * }} [opts] - exact: the words sit at the mark's own offsets in this text;
 *   plain: a block's words (default blockPlainText with labelOf, itself inlineLinkLabel by default)
 * @returns {string | null}
 */
export function pickBlock(blocks, idx, text, opts) {
  var o = opts || {};
  var plainOf = o.plain || function(/** @type {any} */ b) { return blockPlainText(b, o.labelOf); };
  var want = squash(text);
  if (want || o.exact) {
    var exact = -1, loose = -1;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b || !b.id || !MARKABLE[b.type]) continue;
      var plain = plainOf(b);
      if (o.exact && o.exact(plain)) {
        if (exact < 0 || Math.abs(i - idx) < Math.abs(exact - idx)) exact = i;
      } else if (want && squash(plain).indexOf(want) >= 0) {
        if (loose < 0 || Math.abs(i - idx) < Math.abs(loose - idx)) loose = i;
      }
    }
    var best = exact >= 0 ? exact : loose;
    if (best >= 0) return /** @type {string} */ (blocks[best].id);
  }
  var at = blocks[idx];
  return at && at.id && MARKABLE[at.type] ? at.id : null;
}

/**
 * One copy of each segment in a bucket a moved mark went into: a tab on an
 * older version can recolor or convert a segment under its old key after this
 * one moved it, and the merge then keeps both. A segment is its id within its
 * group (hlId mints one per segment; a group's segments share the groupId), so
 * two marks that only share an id are two marks. The newer copy stays; on a
 * tie the one that was already on its block. Two copies neither of which moved
 * are left alone.
 * @param {any[]} list @param {Set<any>} moved
 * @returns {any[]}
 */
function oneEach(list, moved) {
  /** @type {Record<string, number>} */ var at = Object.create(null);
  /** @type {any[]} */ var kept = [];
  list.forEach(function(a) {
    var sid = a && a.id != null ? String(a.id) + '\n' + String(a.groupId) : null;
    var i = sid === null ? undefined : at[sid];
    if (i === undefined) {
      if (sid !== null) at[sid] = kept.length;
      kept.push(a);
      return;
    }
    var cur = kept[i];
    if (!moved.has(a) && !moved.has(cur)) { kept.push(a); return; }
    var sa = stamp(a), sc = stamp(cur);
    if (sa > sc || (sa === sc && moved.has(cur) && !moved.has(a))) kept[i] = a;
  });
  return kept;
}

/**
 * Move every journal mark still keyed by position onto its block's id.
 *
 * @param {Array<{id: string, blocks?: any[]}>} entries - JournalStore's list
 * @param {{
 *   annotations?: Record<string, any[]> | null,
 *   notes?: Record<string, any> | null,
 *   bookmarks?: any[] | null,
 *   links?: any[] | null,
 *   inlineLabel?: ((kind: string, data: string) => string | null) | null,
 * }} data - each store's data as it stands (never mutated): annotation segments carry
 *   text/start/end/groupId, notes keys/fullText, bookmarks hlKey/label, link ends
 *   key/text/label/start/end; inlineLabel reads an inline link's title (default inlineLinkLabel, null for none)
 * @returns {{annotations?: Record<string, any[]>, notes?: Record<string, any>, bookmarks?: any[], links?: any[], moved: number, left: number}}
 *   a store appears only when something in it changed; moved/left count records
 */
export function rekeyJournalMarks(entries, data) {
  /** @type {Record<string, any[]>} */ var blocksOf = Object.create(null);
  (entries || []).forEach(function(e) { if (e && e.id) blocksOf[e.id] = Array.isArray(e.blocks) ? e.blocks : []; });
  // Entry ids holding a ':' (none the app makes, an import can) are matched first, longest wins.
  var colonIds = Object.keys(blocksOf).filter(function(id) { return id.indexOf(':') >= 0; });
  var labelOf = data && data.inlineLabel !== undefined ? data.inlineLabel : inlineLinkLabel;
  var out = /** @type {any} */ ({ moved: 0, left: 0 });
  var GONE = { gone: true };

  /** @type {Map<any, string>} */ var plainCache = new Map();
  var plainOf = function(/** @type {any} */ b) {
    var p = plainCache.get(b);
    if (p === undefined) { p = blockPlainText(b, labelOf); plainCache.set(b, p); }
    return p;
  };

  /**
   * What a key names: null for anything but a position key of an entry that
   * exists (an id key, another kind, a whole-entry key), GONE for a position
   * key whose entry is gone, else the entry, the old position and the blocks.
   * @param {any} key
   * @param {boolean} ranged - a bookmark's or link end's key: it may end in :<start>-<end>
   * @returns {any}
   */
  function parse(key, ranged) {
    var k = String(key == null ? '' : key);
    if (k.lastIndexOf('journal:', 0) !== 0) return null;
    var range = '';
    if (ranged) {
      var r = RANGE.exec(k);
      if (r) { range = r[0]; k = k.slice(0, r.index); }
    }
    var rest = k.slice(8);
    if (blocksOf[rest]) return null;                      // a whole-entry key, journal:<id>, whatever the id holds
    // Every way the key splits into an entry that exists and a block part: at the first ':' (every id the app
    // makes), and after each existing id holding a ':' that begins it (only an import can make those).
    /** @type {string[]} */ var owners = [];
    var c = rest.indexOf(':');
    if (c > 0 && blocksOf[rest.slice(0, c)]) owners.push(rest.slice(0, c));
    for (var i = 0; i < colonIds.length; i++) {
      var cid = colonIds[i];
      if (rest.length > cid.length + 1 && rest.charAt(cid.length) === ':' && rest.lastIndexOf(cid, 0) === 0) owners.push(cid);
    }
    if (!owners.length) return POSITION_KEY.test(k) ? GONE : null;
    // Under any split, a block part that is a block's id (a number included) makes it an id key, never a position.
    for (var o = 0; o < owners.length; o++) {
      var own = blocksOf[owners[o]], part = rest.slice(owners[o].length + 1);
      for (var j = 0; j < own.length; j++) if (own[j] && String(own[j].id) === part) return null;
    }
    var eid = owners.reduce(function(a, b) { return b.length > a.length ? b : a; });   // the longest owner
    var tail = rest.slice(eid.length + 1);
    if (!/^\d+$/.test(tail)) return null;                 // a block id already
    return { entryId: eid, n: Number(tail), range: range, blocks: blocksOf[eid] };
  }

  /**
   * The new key for an old position key, null when the key stays.
   * @param {any} key @param {any} text
   * @param {((plain: string) => boolean) | null} exact @param {boolean} ranged
   */
  function move(key, text, exact, ranged) {
    var p = parse(key, ranged);
    if (!p) return null;
    if (p === GONE) { out.left++; return null; }
    var id = pickBlock(p.blocks, p.n, text, { exact: exact, plain: plainOf });
    if (!id) { out.left++; return null; }
    out.moved++;
    return journalBlockKey(p.entryId, id) + p.range;
  }

  // Annotation segments one by one: two marks under one old key can belong to
  // two blocks now. A note's keys follow its own segments (groupId): every
  // block they went to, and the old key too while one of them stays there.
  /** @type {Record<string, string[]>} */ var groupTo = Object.create(null);
  /** @type {Record<string, boolean>} */ var groupStays = Object.create(null);
  var ann = data && data.annotations;
  if (ann) {
    /** @type {Record<string, any[]>} */ var nextAnn = Object.create(null);
    /** @type {Record<string, boolean>} */ var own = Object.create(null);    // buckets this pass made (never the store's own arrays)
    /** @type {Record<string, boolean>} */ var into = Object.create(null);   // buckets a moved segment went into
    var moved = new Set();
    var place = function(/** @type {string} */ dest, /** @type {any} */ a) {
      if (!own[dest]) { nextAnn[dest] = nextAnn[dest] ? nextAnn[dest].slice() : []; own[dest] = true; }
      nextAnn[dest].push(a);
    };
    Object.keys(ann).forEach(function(k) {
      var list = Array.isArray(ann[k]) ? ann[k] : [];
      var p = list.length ? parse(k, false) : null;
      if (p === GONE) out.left += list.length;
      if (!p || p === GONE) {
        // nothing here moves; an empty bucket stays empty and never replaces one a moved mark went into
        if (own[k]) list.forEach(function(a) { nextAnn[k].push(a); });
        else nextAnn[k] = ann[k];
        return;
      }
      list.forEach(function(a) {
        var id = pickBlock(p.blocks, p.n, a && a.text, { exact: a ? wordsAt(a.start, a.end, a.text) : null, plain: plainOf });
        var gk = a && a.groupId ? a.groupId + '\n' + k : null;
        if (!id) {
          out.left++;
          if (gk) groupStays[gk] = true;
          place(k, a);
          return;
        }
        out.moved++;
        var nk = journalBlockKey(p.entryId, id);
        if (gk) {
          var to = groupTo[gk] || (groupTo[gk] = []);
          if (to.indexOf(nk) < 0) to.push(nk);
        }
        moved.add(a);
        into[nk] = true;
        place(nk, a);
      });
    });
    if (moved.size) {
      Object.keys(into).forEach(function(dest) { nextAnn[dest] = oneEach(nextAnn[dest], moved); });
      out.annotations = Object.assign({}, nextAnn);
    }
  }

  var notes = data && data.notes;
  if (notes) {
    /** @type {Record<string, any>} */ var nextNotes = {};
    var notesChanged = false;
    Object.keys(notes).forEach(function(gid) {
      var n = notes[gid];
      var keys = n && Array.isArray(n.keys) ? n.keys : [];
      var changed = false;
      /** @type {string[]} */ var nextKeys = [];
      var keep = function(/** @type {string} */ k) { if (nextKeys.indexOf(k) < 0) nextKeys.push(k); };
      keys.forEach(function(/** @type {string} */ k) {
        var to = groupTo[gid + '\n' + k];
        if (to) {
          changed = true;
          out.moved++;
          to.forEach(keep);
          if (groupStays[gid + '\n' + k]) keep(k);
          return;
        }
        var nk = move(k, keys.length === 1 ? n.fullText : null, null, false);
        if (nk) changed = true;
        keep(nk || k);
      });
      nextNotes[gid] = changed ? Object.assign({}, n, { keys: nextKeys, updated: stamp(n) + STAMP_STEP }) : n;
      if (changed) notesChanged = true;
    });
    if (notesChanged) out.notes = nextNotes;
  }

  var bookmarks = data && data.bookmarks;
  if (bookmarks) {
    var bkChanged = false;
    var nextBk = bookmarks.map(function(b) {
      if (!b || !b.hlKey) return b;
      var r = RANGE.exec(String(b.hlKey));
      var nk = move(b.hlKey, b.label, r ? wordsAt(Number(r[1]), Number(r[2]), b.label) : null, true);
      if (!nk) return b;
      bkChanged = true;
      return Object.assign({}, b, { hlKey: nk, updated: stamp(b) + STAMP_STEP });
    });
    if (bkChanged) out.bookmarks = nextBk;
  }

  var links = data && data.links;
  if (links) {
    var lnChanged = false;
    var end = function(/** @type {any} */ ep) {
      if (!ep || !ep.key) return ep;
      var r = RANGE.exec(String(ep.key));
      var exact = r ? wordsAt(Number(r[1]), Number(r[2]), ep.text) : wordsAt(ep.start, ep.end, ep.text);
      var nk = move(ep.key, ep.text || ep.label, exact, true);
      return nk ? Object.assign({}, ep, { key: nk }) : ep;
    };
    var nextLinks = links.map(function(ln) {
      if (!ln) return ln;
      var s = end(ln.source), t = end(ln.target);
      if (s === ln.source && t === ln.target) return ln;
      lnChanged = true;
      return Object.assign({}, ln, { source: s, target: t, updated: stamp(ln) + STAMP_STEP });
    });
    if (lnChanged) out.links = nextLinks;
  }

  return out;
}
