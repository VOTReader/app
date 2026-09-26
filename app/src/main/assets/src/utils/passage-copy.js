/* ═══════════════════════════════════════════════════════════════════════
   passage-copy — what a copied passage says, and where it is from
   ═══════════════════════════════════════════════════════════════════════
   Bundled into bundle-d (SelectionToolbar is the caller: its Copy button,
   and the document `copy` listener it installs for every other way of
   copying — Ctrl+C, the Android WebView / Chrome selection menu, the iOS
   callout).

   cp1 (2026-09-26, a reader's request): a copied passage arrived as

       37On the last day, that great day of the feast, ...
       38He who believes in Me, ...

   with no reference: the reader typed "John 7:37-39" under it by hand. The
   verse number is its own <span> in the gutter, beside the verse text with
   nothing between them, so every copy glued the two; and the browser's own
   copy knows nothing about which verses these are. A copy now reads

       37 On the last day, that great day of the feast, ...
       38 He who believes in Me, ...
       39 But this He spoke concerning the Spirit, ...
       John 7:37-39 (NKJV)

   - one verse per line (they are one per line on screen), each verse whose
     start is copied numbered, then a space; a single verse is numbered only
     when its number was selected;
   - a letter's paragraphs a blank line apart, a poem's lines (<div> or <br>)
     a line apart; footnote digits and note / link / bookmark icons left out
     (ANNOTATION_CHROME, the one list the annotation recorder uses);
   - only the reading blocks: the hero, headings, ornaments and nav cards a
     select-all sweeps up are not the passage, and the swipe previews of the
     next and previous chapters (inert clones in the DOM) are never copied;
   - the reference last, on its own line: a Bible range with the reader's
     translation, a letter's title with its volume. The reader's own journal
     gets no reference and keeps the browser's copy (isPublic false).
   Verse ranges use the ASCII hyphen (Permanent Rule 1).
   ═══════════════════════════════════════════════════════════════════════ */

import { _bookmarkSourceLabel } from './bookmark-source.js';
import { ANNOTATION_CHROME } from '../renderer/anchor-view.js';

/** The swipe previews: inert clones of the neighbour pages (ScreenLayout). */
const OFF_PAGE = '[inert], .pager-peek';
/** Elements that start a line of their own. */
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);
const PUBLIC_KINDS = new Set(['bible', 'study', 'letter', 'wtlb', 'blessed', 'holy-days']);

/** A verse block's key: bible:<book>:<ch>:<v> or study:<book>-<ch>:<v> (a study
    note's key carries a suffix, "12-s0", and is a paragraph, not a verse).
    @param {string} key */
export function isVerseKey(key) {
  return /^bible:[^:]+:\d+:\d+$/.test(key) || /^study:[^:]+-\d+:\d+$/.test(key);
}

/** The reference of a run of blocks by its first and last key: "John 3:16",
    "John 3:16-18", "John 3:36-4:2"; anything else keeps its first block's
    label. (Share and Repeat label a passage the same way.)
    @param {string} firstKey @param {string | null} [lastKey] */
export function passageLabel(firstKey, lastKey) {
  const label = _bookmarkSourceLabel(firstKey);
  if (!lastKey || lastKey === firstKey) return label;
  const a = firstKey.split(':'), b = lastKey.split(':');
  if (a[0] === 'bible' && b[0] === 'bible' && a[1] === b[1] && a[3] && b[3]) {
    return label + '-' + (a[2] === b[2] ? b[3] : b[2] + ':' + b[3]);
  }
  if (isVerseKey(firstKey) && isVerseKey(lastKey) && a[0] === 'study' && b[0] === 'study') {
    const ca = /^(.+)-(\d+)$/.exec(a[1]), cb = /^(.+)-(\d+)$/.exec(b[1]);
    if (ca && cb && ca[1] === cb[1]) return label + '-' + (ca[2] === cb[2] ? b[2] : cb[2] + ':' + b[2]);
  }
  return label;
}

/** n6-10: a Bible quote is in the reader's translation, so its reference names
    it: " (KJV)". Nothing when the settings are not known (no claim is better
    than a wrong one), for a non-Bible key, or for a Bible text that is not a
    translation (TSOT Matthew's own ids carry a '-').
    TRANSLATION_OPTIONS is a top-level `const` in index.html: a global binding
    but NOT a window property, so it is read by bare name (translations.js
    translationLabel does the same). Reading it off window found nothing, and
    every quote said NKJV whatever the reader was reading.
    @param {string} key */
export function translationTag(key) {
  const p = String(key || '').split(':');
  if (p[0] !== 'bible' || !p[1] || p[1].indexOf('-') >= 0) return '';
  if (typeof StateStore === 'undefined' || !StateStore) return '';
  let code = null;
  try { const s = StateStore.get(); code = s && s.settings ? s.settings.translation : null; } catch (_e) { code = null; }
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) ? TRANSLATION_OPTIONS : [];
  const found = opts.find((o) => o.id === (code || 'nkjv'));
  return ' (' + (found ? found.label : 'NKJV') + ')';
}

/** A letter-family entry's reference: its title and its collection,
    "Subject to No Man (Volume Two)". Hidden Manna keeps its title alone: it is
    reached only through the Matthew study chain and is never named as a
    collection in the open. '' when the entry is not known.
    @param {string} key */
function entryReference(key) {
  const p = key.split(':');
  const ctx = typeof findEntryContext === 'function' ? findEntryContext(p[1], p[0]) : null;
  if (!ctx || !ctx.title) return '';
  if (!ctx.collection || ctx.screen === 'hm-letter') return ctx.title;
  return ctx.title + ' (' + ctx.collection + ')';
}

/** The line a copy of these blocks ends with, or '' for none.
    @param {string[]} keys  the copied blocks' keys, in reading order */
export function passageReference(keys) {
  if (!keys.length) return '';
  const kind = keys[0].split(':')[0];
  if (!PUBLIC_KINDS.has(kind)) return '';
  const verses = keys.filter(isVerseKey);
  if (verses.length) return passageLabel(verses[0], verses[verses.length - 1]) + translationTag(verses[0]);
  if (kind === 'study') return _bookmarkSourceLabel(keys[0]);
  return entryReference(keys[0]);
}

/** The reading blocks ([data-hl-key]) the range reaches, in document order —
    never an annotation icon (which carries its block's key too) and never a
    block of a swipe preview.
    @param {Range} range @returns {Element[]} */
export function readingBlocksIn(range) {
  const node = range.commonAncestorContainer;
  const root = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
  if (!root) return [];
  let inside = root.closest('[data-hl-key]');
  if (inside) {
    let up;
    while (inside.parentElement && (up = inside.parentElement.closest('[data-hl-key]'))) inside = up;
    return inside.closest(OFF_PAGE) ? [] : [inside];
  }
  return Array.from(root.querySelectorAll('[data-hl-key]')).filter((el) =>
    range.intersectsNode(el)
    && !el.matches(ANNOTATION_CHROME)
    && !(el.parentElement && el.parentElement.closest('[data-hl-key]'))
    && !el.closest(OFF_PAGE));
}

/** The part of `range` inside `el`, or null when none of `el` is in it.
    @param {Range} range @param {Node} el @returns {Range | null} */
function clipTo(range, el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
  return r.collapsed ? null : r;
}

/** Plain text of a cloned block: whitespace collapsed as the page shows it,
    a line per <br> and per block element, chrome left out, a verse number
    followed by a space (or left out, `numbers` false).
    @param {Node} frag @param {boolean} [numbers] @returns {string} */
function plainText(frag, numbers = true) {
  let out = '';
  const newline = () => { if (out && out[out.length - 1] !== '\n') out += '\n'; };
  /** @param {Node} node */
  const walk = (node) => {
    if (node.nodeType === 3) { out += /** @type {Text} */ (node).data.replace(/\s+/g, ' '); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    const el = node.nodeType === 1 ? /** @type {Element} */ (node) : null;
    if (el) {
      if (el.matches(ANNOTATION_CHROME)) return;
      if (el.tagName === 'BR') { out += '\n'; return; }
      if (el.classList.contains('verse-num')) {
        const n = (el.textContent || '').trim();
        if (n && numbers) out += n + ' ';
        return;
      }
    }
    const block = !!el && BLOCK_TAGS.has(el.tagName);
    if (block) newline();
    node.childNodes.forEach(walk);
    if (block) newline();
  };
  walk(frag);
  return out.split('\n').map((l) => l.replace(/ {2,}/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** The verse number element beside a verse block (Bible and study verses keep
    it outside the block, in the gutter), or null.
    @param {Element} el */
function verseNumberOf(el) {
  let sib = el.previousElementSibling;
  while (sib && !sib.classList.contains('verse-num')) sib = sib.previousElementSibling;
  return sib;
}

/**
 * What a copy of `range` puts on the clipboard, or null when the range holds
 * no reading text (the browser's own copy stands then). `text` is `body`, then
 * `reference` on its own line. With `numbers` false the verse numbers are left
 * out (Share sends the words; its link and reference say which verses).
 * @param {Range} range
 * @param {{ numbers?: boolean }} [opts]
 * @returns {{ text: string, body: string, reference: string, keys: string[], isPublic: boolean } | null}
 */
export function passageCopy(range, { numbers = true } = {}) {
  if (!range || range.collapsed) return null;
  /** @type {{ el: Element, key: string, body: string, fromTop: boolean }[]} */
  const parts = [];
  readingBlocksIn(range).forEach((el) => {
    const clip = clipTo(range, el);
    if (!clip) return;
    const body = plainText(clip.cloneContents(), numbers);
    if (!body) return;
    // Is the block copied from its first word? (nothing of it before the clip)
    const before = document.createRange();
    before.setStart(el, 0);
    before.setEnd(clip.startContainer, clip.startOffset);
    parts.push({ el, key: el.getAttribute('data-hl-key') || '', body, fromTop: !plainText(before.cloneContents()) });
  });
  if (!parts.length) return null;
  const manyVerses = parts.filter((p) => isVerseKey(p.key)).length > 1;
  let text = '';
  parts.forEach((p, i) => {
    let body = p.body;
    const numEl = numbers && isVerseKey(p.key) ? verseNumberOf(p.el) : null;
    if (numEl) {
      const numClip = clipTo(range, numEl);
      const picked = !!numClip && numClip.toString().trim() !== '';
      const n = (numEl.textContent || '').trim();
      if (n && (picked || (manyVerses && p.fromTop))) body = n + ' ' + body;
    }
    if (i > 0) text += isVerseKey(parts[i - 1].key) && isVerseKey(p.key) ? '\n' : '\n\n';
    text += body;
  });
  const keys = parts.map((p) => p.key);
  const reference = passageReference(keys);
  return {
    text: reference ? text + '\n' + reference : text,
    body: text,
    reference,
    keys,
    isPublic: PUBLIC_KINDS.has(keys[0].split(':')[0]),
  };
}
