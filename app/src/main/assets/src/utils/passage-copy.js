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

   ALWAYS (cp1 follow-up, Corbin 2026-09-26: "It should always append the
   highlighted section name and range and detect what translation is currently
   selected in settings"). Every copy of reading text ends with where it is
   from, and names the translation of the words it holds:
   - the Bible reader: the translation selected in Settings, Matthew included
     (its id there is "matthew-plain", and a rule meant for TSOT Matthew had
     dropped the tag for every id with a '-');
   - the Matthew Study Bible: "(Study Bible)", its own corrected text, which
     Settings does not change (naming the Settings translation would be false);
   - a footnote or scripture sheet, a letter's footnote list and the Answers
     Ten Commandments sheet: the reference it shows, "(NKJV)" unless the
     reference names its own (their verse text is the NKJV the letters cite):
     data-copy-ref;
   - words on a reading page outside its verse blocks (a heading, a letter's
     intro quote): the page's own name, from its data-copy-key.

   THE LINK (cp2, Corbin 2026-09-27: "inserts the name of the letter at the
   bottom AND provides the closest possible link to it on the website proper,
   thevolumesoftruth.com, so flock members can copy-paste easily"). Under the
   reference, a copy of the Volumes of Truth carries its address on the site
   (utils/site-link.js): the letter's page, a compilation entry's section, and
   the copied words as a text fragment, so the link opens on the passage. A
   passage quoted in an Answers topic names the letter it is from (its
   "~ [From …]" source line) and links there; words across several of its
   passages name the topic and link its answersonlygodcangive.com page. The
   Bible has no page on the site: a verse copy keeps its reference alone.
   cp3: the quote is the reader's option (Settings › Copy & Share › Highlight
   the Passage, off by default); by default the link names the letter alone.

   THE QUOTE (cp4, Corbin 2026-10-05, from a note he pasted a verse into):
   a copy that names where it is from reads as a quotation: the words in
   double quotes, a blank line, then the reference (and the link):

       "For I know that this will turn out for my deliverance ..."

       Philippians 1:19 (NKJV-R)

   A single verse carries no verse number (the reference names it), however
   it was selected; a run of verses keeps a number on each. A Volumes of
   Truth copy is quoted the same way. Words with no reference (the reader's
   own journal) are never quoted.
   ═══════════════════════════════════════════════════════════════════════ */

import { _bookmarkSourceLabel } from './bookmark-source.js';
import { ANNOTATION_CHROME } from '../renderer/anchor-view.js';
import { siteTarget, sourceTarget, pageTarget, siteUrl, collectionName, MATTHEW_STUDY_PAGE } from './site-link.js';
import { passageSource, isQuotedWords } from './answers-contents.js';

/** The swipe previews: inert clones of the neighbour pages (ScreenLayout). */
const OFF_PAGE = '[inert], .pager-peek';
/** A verse number: the Bible reader's gutter number and a sheet's gold superscript. */
const VERSE_NUMBER = '.verse-num, .verse-sup';
/** The Matthew Study Bible's text is its own (corrected) edition, not a translation Settings picks. */
const STUDY_TAG = ' (Study Bible)';
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
    it: " (KJV)", read from Settings at the moment of the copy. Nothing when the
    settings are not known (no claim is better than a wrong one), for a
    non-Bible key, or for a book the Bible reader does not translate.
    TRANSLATION_OPTIONS is a top-level `const` in index.html: a global binding
    but NOT a window property, so it is read by bare name (translations.js
    translationLabel does the same). Reading it off window found nothing, and
    every quote said NKJV whatever the reader was reading.
    @param {string} key */
export function translationTag(key) {
  const p = String(key || '').split(':');
  if (p[0] !== 'bible' || !p[1] || !isTranslatedBook(p[1])) return '';
  if (typeof StateStore === 'undefined' || !StateStore) return '';
  let code = null;
  try { const s = StateStore.get(); code = s && s.settings ? s.settings.translation : null; } catch (_e) { code = null; }
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) ? TRANSLATION_OPTIONS : [];
  const found = opts.find((o) => o.id === (code || 'nkjv'));
  return ' (' + (found ? found.label : 'NKJV') + ')';
}

/** cp3 (Corbin 2026-09-27): "the attached link actually HIGHLIGHTS the shared
    text on the website proper. Great idea, but that should be an option, not
    the default. Default should just be the link to the main letter." A website
    link names the letter's page (a compilation entry's section) unless
    Settings › Copy & Share › Highlight the Passage is on; then it quotes the
    copied words as well (#:~:text=), and the site opens on them highlighted.
    Read from Settings at the moment of the copy, like the translation.
    @returns {boolean} */
export function highlightLinks() {
  if (typeof StateStore === 'undefined' || !StateStore) return false;
  try { const s = StateStore.get(); return !!(s && s.settings && s.settings.linkHighlight); } catch (_e) { return false; }
}

/** Does the Bible reader show this book in the reader's translation? Every
    book on its canonical list does. Matthew is "matthew-plain" there: the plain
    NKJV Matthew, translated like the rest; the old test for a '-' (meant for
    TSOT Matthew's own text) dropped its tag. Before the list is known (tests,
    a cold start) the key is taken at its word.
    @param {string} id */
function isTranslatedBook(id) {
  const list = typeof BIBLE_BOOK_LIST !== 'undefined' && Array.isArray(BIBLE_BOOK_LIST) ? BIBLE_BOOK_LIST : null;
  if (!list || !list.length) return true;
  return list.some((b) => !!b && b.id === id);
}

/**
 * @typedef {{ reference: string, target: import('./site-link.js').SiteTarget | null, quoteKeys?: Set<string> }} Origin
 *   reference: the line a copy ends with ('' for none); target: where the words
 *   live on the site (null: nowhere, as for the Bible); quoteKeys: the blocks
 *   whose words the site's page has (all of them when absent).
 */

/** What a copy of these blocks ends with, and where they live on the site.
    A letter-family entry is named by its title and its collection, "Subject
    to No Man (Volume Two)"; Hidden Manna keeps its title alone: it is reached
    only through the Matthew study chain and is never named as a collection in
    the open.
    @param {string[]} keys  the copied blocks' keys, in reading order
    @returns {Origin} */
function passageOrigin(keys) {
  /** @type {Origin} */
  const none = { reference: '', target: null };
  if (!keys.length) return none;
  const p = keys[0].split(':');
  const kind = p[0];
  if (!PUBLIC_KINDS.has(kind)) return none;
  const verses = keys.filter(isVerseKey);
  if (verses.length) {
    const label = passageLabel(verses[0], verses[verses.length - 1]);
    return kind === 'study'
      ? { reference: label + STUDY_TAG, target: pageTarget(MATTHEW_STUDY_PAGE) }
      : { reference: label + translationTag(verses[0]), target: null };
  }
  // A whole chapter (a page's own key): "John 7 (NKJV)", "Matthew 5 (Study Bible)".
  if (kind === 'bible') return { reference: p.length === 3 ? _bookmarkSourceLabel(keys[0]) + translationTag(keys[0]) : '', target: null };
  if (kind === 'study') {
    const ch = p.length === 2 ? /^(.+)-(\d+)$/.exec(p[1] || '') : null;
    const reference = p.length !== 2 ? _bookmarkSourceLabel(keys[0])
      : ch ? ch[1].charAt(0).toUpperCase() + ch[1].slice(1) + ' ' + ch[2] + STUDY_TAG : '';
    return { reference, target: pageTarget(MATTHEW_STUDY_PAGE) };
  }
  const ctx = typeof findEntryContext === 'function' ? findEntryContext(p[1], kind) : null;
  if (!ctx || !ctx.title) return none;
  if (ctx.screen === 'answers-entry') return answersOrigin(ctx, keys);
  const reference = !ctx.collection || ctx.screen === 'hm-letter' ? ctx.title : ctx.title + ' (' + ctx.collection + ')';
  return { reference, target: siteTarget(ctx) };
}

/** An Answers topic is passages quoted from the letters. Copied words within
    one passage name the letter they are from (the passage's "~ [From …]" line)
    and link there, quoting only the letter's own words (not the source line,
    a divider or the site's section headings); words across passages name the
    topic and link its page on answersonlygodcangive.com.
    @param {{ title: string, collection?: string, entry?: any }} ctx
    @param {string[]} keys
    @returns {Origin} */
function answersOrigin(ctx, keys) {
  const paras = ctx.entry && Array.isArray(ctx.entry.paragraphs) ? ctx.entry.paragraphs : [];
  const at = keys.map((k) => Number(k.split(':')[2])).filter((n) => Number.isInteger(n));
  const src = at.length ? passageSource(paras, Math.min(...at), Math.max(...at)) : null;
  const quoteKeys = new Set(keys.filter((k) => isQuotedWords(paras[Number(k.split(':')[2])])));
  if (src) return { reference: src.title + ' (' + collectionName(src.collection) + ')', target: sourceTarget(src.title, src.collection), quoteKeys };
  const href = ctx.entry && typeof ctx.entry.siteUrl === 'string' ? ctx.entry.siteUrl : '';
  return { reference: ctx.title + ' (' + ctx.collection + ')', target: href ? { href } : null, quoteKeys };
}

/** cp4: copied words as a quotation, in ASCII double quotes (as the phone's
    keyboard types them). Words that are already one quotation (an intro
    quote copied alone) are not quoted twice.
    @param {string} body */
export function quotedPassage(body) {
  const b = String(body || '').trim();
  if (!b) return '';
  const marks = b.match(/["\u201C\u201D]/g) || [];
  if (marks.length === 2 && /^["\u201C]/.test(b) && /["\u201D]$/.test(b)) return b;
  return '"' + b + '"';
}

/** The line a copy of these blocks ends with, or '' for none.
    @param {string[]} keys  the copied blocks' keys, in reading order */
export function passageReference(keys) {
  return passageOrigin(keys).reference;
}

/** A sheet's reference for the verse text it shows: the reference itself when
    it names its translation ("John 14:6 (KJV)"), otherwise with " (NKJV)" (the
    letters cite the NKJV, and a sheet falls back to the NKJV corpus).
    @param {string} ref */
export function sheetReference(ref) {
  const r = String(ref || '').trim();
  if (!r) return '';
  return /\([A-Za-z][A-Za-z0-9-]*\)$/.test(r) ? r : r + ' (NKJV)';
}

/** What a page or a sheet declares for its words outside any verse block:
    data-copy-ref (a literal: a sheet's "John 3:16 (NKJV)") or data-copy-key
    (named, and placed on the site, like a passage: "letter:the-wide-path" is
    "The Wide Path (Volume Two)" at its page). null when the range is under
    neither.
    @param {Range} range
    @returns {Origin | null} */
function declaredOrigin(range) {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
  const host = el && el.closest ? el.closest('[data-copy-ref], [data-copy-key]') : null;
  if (!host || host.closest(OFF_PAGE)) return null;
  const literal = host.getAttribute('data-copy-ref');
  if (literal) return { reference: literal, target: null };
  const key = host.getAttribute('data-copy-key') || '';
  const origin = key ? passageOrigin([key]) : null;
  return origin && origin.reference ? origin : null;
}

/** The reading page on screen as a link to its place on the site (a letter's
    page, a compilation entry's section, an Answers topic's own page), with its
    name: what the ⋯ menu's "Copy website link" copies (cp2). The page is the
    one whose data-copy-key is not a swipe preview's. null on a screen that is
    no reading page, or a page the site does not have (the Bible).
    @param {ParentNode} [root]
    @returns {{ link: string, reference: string } | null} */
export function pageSiteLink(root = document) {
  const host = Array.from(root.querySelectorAll('[data-copy-key]')).find((el) => !el.closest(OFF_PAGE));
  const key = host ? host.getAttribute('data-copy-key') || '' : '';
  const origin = key ? passageOrigin([key]) : null;
  const link = origin && origin.target ? siteUrl(origin.target) : '';
  return origin && link ? { link, reference: origin.reference } : null;
}

/** Does the boundary at `offset` in `node` fall inside a word ("Bel|oved")?
    @param {Node} node @param {number} offset */
function splitsWord(node, offset) {
  if (node.nodeType !== 3) return false;
  const s = /** @type {Text} */ (node).data;
  return offset > 0 && offset < s.length && /[\p{L}\p{N}]/u.test(s[offset - 1]) && /[\p{L}\p{N}]/u.test(s[offset]);
}

/** The copied words, line by line, for the link's quote: a line never runs
    across a paragraph, a poem's line, a footnote bubble or a verse number
    (where the site's words break as well: its footnotes are "[1]" marks), and
    a word the selection cuts in two is left out (the page has no "eloved").
    @param {Range[]} clips  the copied parts of the passage's blocks, in order
    @returns {string[][]} */
function quoteLines(clips) {
  /** @type {string[][]} */
  const lines = [];
  let line = '';
  // A line of marks alone ("dunghill³..." leaves "...") is nothing to find.
  const flush = () => { const t = line.trim(); if (/[\p{L}\p{N}]/u.test(t)) lines.push(t.split(/\s+/)); line = ''; };
  /** @param {Node} node */
  const walk = (node) => {
    if (node.nodeType === 3) { line += /** @type {Text} */ (node).data; return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    const el = node.nodeType === 1 ? /** @type {Element} */ (node) : null;
    if (el && (el.matches(ANNOTATION_CHROME) || el.matches(VERSE_NUMBER) || el.tagName === 'BR' || el.tagName === 'BUTTON')) { flush(); return; }
    const block = !!el && BLOCK_TAGS.has(el.tagName);
    if (block) flush();
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  clips.forEach((c, i) => {
    const start = lines.length;
    walk(c.cloneContents());
    flush();
    if (i === 0 && lines.length > start && splitsWord(c.startContainer, c.startOffset)) lines[start].shift();
    if (i === clips.length - 1 && lines.length > start && splitsWord(c.endContainer, c.endOffset)) lines[lines.length - 1].pop();
  });
  return lines;
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
      if (el.tagName === 'BUTTON') return;   // a control's label ("Go to John 3:16") is not the passage
      if (el.matches(VERSE_NUMBER)) {
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
 * `reference` and `link` (its place on thevolumesoftruth.com, cp2) each on its
 * own line; with a reference, `text` quotes `body` and leaves a blank line
 * before the reference (cp4). With `numbers` false the verse numbers are left
 * out, and a single verse never has one. The link
 * names the letter's page (a compilation entry's section) and quotes the copied
 * words only with `quote` (by default the reader's Highlight the Passage, cp3).
 * @param {Range} range
 * @param {{ numbers?: boolean, quote?: boolean }} [opts]
 * @returns {{ text: string, body: string, reference: string, link: string, keys: string[], isPublic: boolean } | null}
 */
export function passageCopy(range, { numbers = true, quote = highlightLinks() } = {}) {
  if (!range || range.collapsed) return null;
  /** @type {{ el: Element, key: string, body: string, clip: Range, fromTop: boolean }[]} */
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
    parts.push({ el, key: el.getAttribute('data-hl-key') || '', body, clip, fromTop: !plainText(before.cloneContents()) });
  });
  const ending = (/** @type {string} */ body, /** @type {string} */ reference, /** @type {string} */ link) =>
    (reference ? quotedPassage(body) + '\n\n' + reference : body) + (link ? '\n' + link : '');
  if (!parts.length) {
    // No verse block in it: words a page or a sheet declares a reference for
    // (a heading, an intro quote, a footnote's verse), or none of ours.
    const declared = declaredOrigin(range);
    // A sheet's one verse is named by its reference: no number (cp4).
    const frag = range.cloneContents();
    const several = frag.querySelectorAll(VERSE_NUMBER).length > 1;
    const words = declared ? plainText(frag, numbers && several) : '';
    if (!declared || !words) return null;
    const link = declared.target ? siteUrl(declared.target, quote ? quoteLines([range]) : undefined) : '';
    return { text: ending(words, declared.reference, link), body: words, reference: declared.reference, link, keys: [], isPublic: true };
  }
  const manyVerses = parts.filter((p) => isVerseKey(p.key)).length > 1;
  let text = '';
  parts.forEach((p, i) => {
    let body = p.body;
    const numEl = numbers && isVerseKey(p.key) ? verseNumberOf(p.el) : null;
    if (numEl) {
      const numClip = clipTo(range, numEl);
      const picked = !!numClip && numClip.toString().trim() !== '';
      const n = (numEl.textContent || '').trim();
      // cp4: one verse is named by its reference alone, never numbered.
      if (n && manyVerses && (picked || p.fromTop)) body = n + ' ' + body;
    }
    if (i > 0) text += isVerseKey(parts[i - 1].key) && isVerseKey(p.key) ? '\n' : '\n\n';
    text += body;
  });
  const keys = parts.map((p) => p.key);
  const isPublic = PUBLIC_KINDS.has(keys[0].split(':')[0]);
  // A block whose entry cannot be named still carries its page's name.
  let origin = passageOrigin(keys);
  if (!origin.reference && isPublic) origin = declaredOrigin(range) || origin;
  const quoted = origin.quoteKeys;
  const link = origin.target
    ? siteUrl(origin.target, quote ? quoteLines(parts.filter((p) => !quoted || quoted.has(p.key)).map((p) => p.clip)) : undefined)
    : '';
  return {
    text: ending(text, origin.reference, link),
    body: text,
    reference: origin.reference,
    link,
    keys,
    isPublic,
  };
}
