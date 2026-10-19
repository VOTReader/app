/* ═══════════════════════════════════════════════════════════════════════
   answers-sections — where in an Answers topic a site #fragment points
   ═══════════════════════════════════════════════════════════════════════
   answersonlygodcangive.com links name a section of a page by its MediaWiki
   anchor: the heading with spaces as "_" and every other byte outside
   [A-Za-z0-9_.:-] as ".XX" ('"In My Name"' -> '.22In_My_Name.22', "The One Who
   Stays, Lets" -> 'The_One_Who_Stays.2C_Lets'). 224 letter rows and 13 Main
   Page links carry one (brief C10/C11). An anchor is a place to scroll to: the
   paragraph the section starts at (a topic's data-hl-key is wtlb:<id>:<index>).

   The sections come from the converter's sidecar (ANSWERS_META[id].sections,
   aogcg 1a: every site heading with its parse-API anchor and level, the
   "Section One" headings the text drops as `synthetic`) once that lazy file is
   in; until then from the topic's own headings (a centred **bold** paragraph,
   answers-contents.js), which every non-synthetic section has.

   A link the site itself left stale still lands where it plainly means
   (answersAnchorPara, rules 2-3): "#Polluting_the_Name_of_The_Lord" on a page
   whose headings gained "(Section One)…(Section Three)", and
   "#Section_2_-_The_True_Bride" / "#More_False_Doctrines_-_The_Catholic_Church"
   whose headings dropped their lead-in. Nothing else is guessed: an anchor
   that matches no heading opens the topic at its top, as the site does.

   Pure data: no DOM, no React.
   ═══════════════════════════════════════════════════════════════════════ */

import { answersContents } from './answers-contents.js';

/**
 * @typedef {{ title: string, level: number, at: number, anchor?: string, synthetic?: boolean }} AnswersSection
 *   at: the paragraph the section starts at (its heading's, or for a synthetic one the first under it).
 */

/** ".22" / ".E2.80.99" runs back to the characters they encode (MediaWiki's legacy anchor form). */
function decodeDots(s) {
  return s.replace(/(?:\.[0-9A-F]{2})+/g, (run) => {
    try { return decodeURIComponent(run.replace(/\./g, '%')); } catch (_e) { return run; }
  });
}

/** Lower-case words joined by single spaces: what two spellings of one heading share. */
function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * A comparable key for a MediaWiki anchor or a link's #fragment: percent- and
 * dot-escapes decoded, underscores as spaces, case and punctuation dropped.
 * 'Woe_to_Those_Who_Celebrate_Pagan-laced_Holidays' and the heading's own
 * 'Woe_to_Those_Who_Celebrate_Pagan-Laced_Holidays' share one key.
 * @param {unknown} anchor
 * @returns {string} '' for no anchor
 */
export function answersAnchorKey(anchor) {
  let s = String(anchor || '').replace(/^#/, '');
  try { s = decodeURIComponent(s); } catch (_e) { /* a stray %: keep it as written */ }
  return words(decodeDots(s).replace(/_/g, ' '));
}

/**
 * The sidecar for one entry, when answers-meta.js has loaded (sync-loaders.js
 * loadAnswersMeta); null before that.
 * @param {string} id
 * @returns {any}
 */
export function answersMetaFor(id) {
  const M = typeof window !== 'undefined' ? /** @type {any} */ (window).ANSWERS_META : undefined;
  return (M && id && Object.prototype.hasOwnProperty.call(M, id)) ? M[id] : null;
}

/**
 * A topic's sections in page order: the sidecar's when given, else the
 * headings its text carries (all level 1; no synthetic ones).
 * @param {{ paragraphs?: any[] } | null | undefined} entry
 * @param {{ sections?: AnswersSection[] } | null} [meta]
 * @returns {AnswersSection[]}
 */
export function answersSections(entry, meta) {
  if (meta && Array.isArray(meta.sections)) return meta.sections;
  return answersContents(entry).sections
    .filter((s) => s.title)
    .map((s) => ({ title: s.title, level: 1, at: s.index }));
}

/** The first section whose key passes `test`, or null. */
function findSection(sections, test) {
  for (const s of sections) {
    const keys = s.anchor ? [answersAnchorKey(s.anchor), words(s.title)] : [words(s.title)];
    if (keys.some(test)) return s;
  }
  return null;
}

/**
 * The paragraph a #fragment lands on, or -1 for none (open at the top).
 *   1. the section whose anchor (or heading) has the fragment's key;
 *   2. else the first section whose key STARTS with it as whole words
 *      ("polluting the name of the lord" -> "… (Section One)");
 *   3. else the part after the fragment's last " - ", by 1 then 2
 *      ("Section 2 - The True Bride" -> "The True Bride").
 * @param {{ paragraphs?: any[] } | null | undefined} entry
 * @param {unknown} anchor the fragment as the link wrote it ('For_the_Sake_of_Pride')
 * @param {{ sections?: AnswersSection[] } | null} [meta] the entry's sidecar, when loaded
 * @returns {number}
 */
export function answersAnchorPara(entry, anchor, meta) {
  const key = answersAnchorKey(anchor);
  if (!key || !entry) return -1;
  const sections = answersSections(entry, meta);
  const lookup = (k) => findSection(sections, (sk) => sk === k)
    || findSection(sections, (sk) => sk.length > k.length && sk.lastIndexOf(k + ' ', 0) === 0);
  let hit = lookup(key);
  if (!hit) {
    let raw = String(anchor).replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch (_e) { /* keep it */ }
    const parts = decodeDots(raw).replace(/_/g, ' ').split(' - ');
    const tail = parts.length > 1 ? words(parts[parts.length - 1]) : '';
    if (tail) hit = lookup(tail);
  }
  return hit && typeof hit.at === 'number' ? hit.at : -1;
}

/**
 * The section a paragraph sits in: the innermost one starting at or before it
 * (a level-2 section under its level-1 parent), with that parent. null before
 * the first section.
 * @param {AnswersSection[] | null | undefined} sections in page order
 * @param {number} index a paragraph index
 * @returns {{ section: AnswersSection, parent: AnswersSection | null } | null}
 */
export function answersSectionOf(sections, index) {
  const list = Array.isArray(sections) ? sections : [];
  let at = -1;
  for (let i = 0; i < list.length; i++) if (list[i].at <= index) at = i;
  if (at < 0) return null;
  const section = list[at];
  let parent = null;
  if (section.level > 1) {
    for (let i = at - 1; i >= 0; i--) if (list[i].level < section.level) { parent = list[i]; break; }
  }
  return { section, parent };
}

/**
 * The landing a link to a topic's section makes (a tab's surpriseAnchor;
 * WtlbEntryView resolves it once the topic is on screen), or null for none.
 * @param {string} id the topic
 * @param {string | null | undefined} anchor the link's #fragment
 * @returns {{ type: 'section', letterId: string, anchor: string } | null}
 */
export function answersSectionAnchor(id, anchor) {
  return id && anchor ? { type: 'section', letterId: id, anchor: String(anchor) } : null;
}
