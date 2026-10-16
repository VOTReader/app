/* links.js - links between passages in v2 (mw8, v2-gaps 24; design dz22 4b, 4d-4i), written and read through main's own
   LinkStore (vot-links: { id, source, target, created }, read from either end), so a link made in either app shows in
   both, Notes > Links lists it and main's painter marks it in the text. v2 links a whole paragraph (it marks paragraphs):
   the source is main's endpoint for the tapped block, its start/end spanning the paragraph's words. Targets are main's
   too: a place from main's nav index (utils/nav-index.js, the picker's Places), refined to a verse, a run of verses or
   some words when the reader chooses them (main's VersePickerScreen / LetterExcerptPickerScreen keys).
   The stores (bundle-b) and main's nav index (bundle-d publishes it on window, with its cache) are window globals, read
   through `env` so tests hand in fakes; v2 bundles no second copy. */
import { bibleHlKey } from '../utils/hl-keys.js';
import { placeOfKey, dayLabel } from './notes-facts.js';
import { bookOf } from './bible-facts.js';

const g = /** @type {any} */ (globalThis);

/** One of main's nav-index functions as bundle-d publishes it, or null before it has loaded. @param {string} name */
export function nav(name, env = g) {
  const f = env[name];
  return typeof f === 'function' ? f : null;
}

/** main's "Linking from" quote: the source's words cut at 90 characters, ending on the word (LinkPicker.jsx, design 4d).
 *  @param {string} text */
export function sourceQuote(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return '“' + (t.length > 90 ? t.slice(0, 90).trimEnd() + '…' : t) + '”';
}

/**
 * main's source endpoint for a paragraph (buildSourceEndpoint: its kind, screen and collection from the key) under the
 * letter's title (main's label for a letter source).
 * @param {{ key: string, start: number, end: number, text: string }} para @param {string} title
 */
export function sourceOf(para, title) {
  const build = nav('buildSourceEndpoint');
  try { if (build) return build(para.key, title, para.start, para.end, para.text); } catch (_e) { /* the plain endpoint below */ }
  return { type: String(para.key).split(':')[0], key: para.key, label: title, start: para.start, end: para.end, text: para.text };
}

/**
 * Saves a link as main's persistLink does (an existing link between the two places is reused). `fresh` says whether
 * this call made it, so Undo removes only a link it made. Null when the stores are not there.
 * @param {any} source @param {any} target @returns {{ link: any, fresh: boolean } | null}
 */
export function makeLink(source, target, env = g) {
  const L = env.LinkStore;
  if (!L || typeof env.persistLink !== 'function' || !source || !source.key || !target || !target.key) return null;
  const before = new Set((L.getForKey(source.key) || []).map((l) => l.id));
  const link = env.persistLink(source, target);
  return link ? { link, fresh: !before.has(link.id) } : null;
}

/**
 * The one toast links say things in ("Linked to ...", "Link removed."), each with its Undo: the shell's Links overlay
 * shows it, so a new one replaces the last wherever it was said (a letter's link, then a Remove in the Links sheet).
 * @typedef {{ text: string, act?: string, onAct?: () => void }} LinkToast
 */
let toastNow = /** @type {LinkToast | null} */ (null);
let toastVer = 0;
const toastSubs = new Set();
export const linkToast = {
  /** @returns {LinkToast | null} */
  get: () => toastNow,
  /** @param {LinkToast | null} t */
  set(t) { toastNow = t; toastVer += 1; toastSubs.forEach((cb) => cb()); },
  /** @param {() => void} cb */
  subscribe(cb) { toastSubs.add(cb); return () => { toastSubs.delete(cb); }; },
  version: () => toastVer,
};

/** Takes a link away (main's LinkStore.remove). @param {string} id */
export function removeLink(id, env = g) {
  if (env.LinkStore && typeof env.LinkStore.remove === 'function') env.LinkStore.remove(id);
}

/** Puts a removed link back as it was (the toast's Undo). @param {any} link */
export function restoreLink(link, env = g) {
  const L = env.LinkStore;
  if (!L || !link || typeof L.add !== 'function') return;
  if ((L.getForKey(link.source.key) || []).some((l) => l.id === link.id)) return;
  L.add(link);
}

/** True when `key` is the block `block` or a range inside it ("letter:id:0" holds "letter:id:0:10-40"). */
export function inBlock(key, block) {
  return !!key && (key === block || key.indexOf(block + ':') === 0);
}

/**
 * The links touching a block, either way (main's LinkSidebar block scope), newest first.
 * @param {string} block a block's key @returns {any[]}
 */
export function linksOn(block, env = g) {
  const L = env.LinkStore;
  if (!L || !block) return [];
  const all = typeof L.getForKeyPrefix === 'function' ? L.getForKeyPrefix(block) : L.getForKey(block);
  return (all || []).filter((l) => l && l.source && l.target && (inBlock(l.source.key, block) || inBlock(l.target.key, block)))
    .sort((a, b) => (b.created || 0) - (a.created || 0));
}

/** "New Testament" / "Old Testament" for a Bible book (v2's canon table), '' for none. @param {string} id */
export function testamentOf(id) {
  const b = bookOf(id);
  return b ? (b.testament === 'old' ? 'Old Testament' : 'New Testament') : '';
}

/**
 * What a Links card says about the other end of a link from `block` (4i; main's LinkCard): "To" when this block made
 * it, "From" when another place did; the other place's kind (its testament, the Study Bible, or where it sits: "Volume
 * One · Letter 16"), its title, its words (2 lines), the day it was made, and where tapping it goes.
 * @param {any} link @param {string} block @param {number} now
 * @returns {{ id: string, eyebrow: string, title: string, text: string, day: string, open: any }}
 */
export function linkCard(link, block, now, env = g) {
  const outbound = inBlock(link.source.key, block);
  const other = outbound ? link.target : link.source;
  const place = placeOfKey(other.key, env);
  const kind = other.type === 'bible' ? testamentOf(other.bookId || String(other.key).split(':')[1])
    : other.type === 'study' ? 'Matthew Study Bible'
    : place.where || other.collection || '';
  let text = other.text || other.preview || '';
  if (!text && typeof env.resolveVerseText === 'function') { try { text = env.resolveVerseText(other) || ''; } catch (_e) { text = ''; } }
  const day = dayLabel(link.created || 0, now);
  return {
    id: link.id,
    eyebrow: (outbound ? 'To' : 'From') + (kind ? ' · ' + kind : ''),
    title: other.label || place.title,
    text: String(text).replace(/\s+/g, ' ').trim(),
    day: day ? 'Linked ' + (day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day) : '',
    open: place.open,
  };
}

/* ---- the picker's places (main's nav index) ------------------------------------------------------------------- */

/**
 * @typedef {{ item: any, t: string, s: string, v: string, icon: string, direct: boolean }} PlaceRow
 *   direct: one tap links it (a verse); otherwise its words open first (a chapter, a letter)
 */

/** A nav item as a Places row: its name, its kind under it, a verse's words (2 lines). @returns {PlaceRow} */
export function placeRow(item) {
  const bible = item.kind === 'bible-chapter' || item.kind === 'study-chapter';
  let v = '';
  const preview = nav('navItemPreview');
  if (bible && item.verse != null && preview) { try { v = preview(item) || ''; } catch (_e) { v = ''; } }
  const s = item.kind === 'bible-chapter' ? testamentOf(item.bookId) || item.category || ''
    : item.kind === 'study-chapter' ? 'Matthew Study Bible' : item.category || item.collection || '';
  return { item, t: item.label, s, v, icon: bible ? 'book' : 'lines', direct: bible && item.verse != null };
}

/** main's title search (searchNavIndex: a reference first, then names), as Places rows. @param {string} q */
export function findPlaces(q, limit = 30) {
  const query = String(q || '').trim();
  const search = nav('searchNavIndex');
  if (!query || !search) return [];
  try { return search(query, limit).map((s) => placeRow(s.item)); } catch (_e) { return []; }
}

/** main's endpoint for a nav item (navItemToEndpoint), or null. */
export function targetOf(item) {
  const toEndpoint = nav('navItemToEndpoint');
  try { return item && toEndpoint ? toEndpoint(item) : null; } catch (_e) { return null; }
}

/* ---- choosing the words (4f, 4g) ------------------------------------------------------------------------------- */

/** main's word characters (annotation-engine snapRangeToWords). */
const WORD = /[\w’'-]/;

/** [start, end) pulled in to whole words: no leading or trailing spaces or punctuation. @param {string} text */
export function snapWords(text, start, end) {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s < e && !WORD.test(text[s])) s++;
  while (e > s && !WORD.test(text[e - 1])) e--;
  // a range that starts or ends inside a word takes the whole word
  while (s > 0 && WORD.test(text[s - 1]) && WORD.test(text[s])) s--;
  while (e < text.length && WORD.test(text[e]) && WORD.test(text[e - 1])) e++;
  return { start: s, end: e };
}

/**
 * The Bible target for verses chosen in a chapter (main's VersePickerScreen confirm): a verse or a run of verses, or
 * some words of them (`partial`, its characters in the key). `verses` the chapter's [{ n, text }].
 * @param {any} target the chapter's endpoint @param {{ v1: number, v2: number, start: number, end: number, text: string }} pick
 * @param {Array<{ n: number, text: string }>} verses @param {string} bookTitle
 */
export function verseTarget(target, pick, verses, bookTitle) {
  const study = target.type === 'study';
  const v1 = pick.v1;
  const v2 = pick.v2 && pick.v2 !== v1 ? pick.v2 : null;
  const lastLen = ((verses.find((x) => x.n === (v2 || v1)) || {}).text || '').length;
  const partial = pick.start > 0 || pick.end < lastLen;
  const frag = v1 + (v2 ? '-' + v2 : '');
  const base = study ? 'study:' + target.bookId + '-' + target.chapter + ':' + frag
    : bibleHlKey(target.bookId, target.chapter, v1) + (v2 ? '-' + v2 : '');
  const out = { ...target, verse: v1, key: partial ? base + ':' + pick.start + '-' + pick.end : base,
    label: bookTitle + ' ' + target.chapter + ':' + frag, text: pick.text, preview: pick.text };
  if (v2) out.verseEnd = v2; else delete out.verseEnd;
  if (partial) Object.assign(out, { charStart: pick.start, charEnd: pick.end, partial: true });
  return out;
}

/**
 * The letter target for words chosen in one of its blocks (main's LetterExcerptPickerScreen confirm), or the whole
 * letter when nothing is chosen. `block` is the block's own key ("letter:id:3").
 * @param {any} target @param {{ block: string, start: number, end: number, text: string } | null} pick
 */
export function wordsTarget(target, pick) {
  if (!pick) return { ...target };
  return { ...target, blockKey: pick.block.split(':').pop(), start: pick.start, end: pick.end, text: pick.text,
    preview: pick.text, partial: true, key: pick.block + ':' + pick.start + '-' + pick.end };
}

/** What a target is called in the footer and the toast ("John 15:16", a letter's title). */
export function targetLabel(target) {
  return (target && target.label) || '';
}

/* ---- the link icon at the end of a linked passage (4h) --------------------------------------------------------- */

/**
 * main's painter (applyDOMLinks) puts its chain icon at the end of every linked range, gold where the passage made the
 * link (inline-link-icon-source), dim where it is only a target. v2 draws it as the kit's (.lki: the kit's link icon, gold;
 * `.to` the second colour), keeping main's element, its role, label and tap. Safe to run again.
 * @param {ParentNode} root
 */
export function dressLinkIcons(root, svg) {
  root.querySelectorAll('.inline-link-icon:not(.lki)').forEach((el) => {
    el.classList.add('lki');
    if (!el.classList.contains('inline-link-icon-source')) el.classList.add('to');
    el.innerHTML = svg;
  });
}

/**
 * A gate boot's icons, from its row's links (the stores are never read there): one at the end of each block a link
 * touches, as main's painter places a link that spans the whole paragraph. Inert.
 * @param {ParentNode} root @param {any[]} links @param {string} svg
 */
export function gateLinkIcons(root, links, svg) {
  root.querySelectorAll('[data-hl-key]').forEach((block) => {
    const key = block.getAttribute('data-hl-key') || '';
    const here = links.filter((l) => inBlock(l.source.key, key) || inBlock(l.target.key, key));
    if (!here.length || block.querySelector('.inline-link-icon')) return;
    const icon = document.createElement('span');
    const source = here.some((l) => inBlock(l.source.key, key));
    icon.className = 'inline-link-icon' + (source ? ' inline-link-icon-source' : '');
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', here.length === 1 ? 'Open link' : 'Open ' + here.length + ' links');
    block.appendChild(icon);
  });
  dressLinkIcons(root, svg);
}
