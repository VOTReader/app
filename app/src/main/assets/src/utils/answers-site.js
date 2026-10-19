/* ═══════════════════════════════════════════════════════════════════════
   answers-site — answersonlygodcangive.com's own contents and reading order
   ═══════════════════════════════════════════════════════════════════════
   The site files its 120 topics in the left column (MediaWiki:Sidebar) under
   24 headings, and reads them in that order: Main Page, then every topic as
   listed, ending at Regarding the Flat Earth Theory ("This ends Answers Only
   God Can Give - Topics", "Proceed to: False Doctrines Within the Churches
   (Index)"), then the False Doctrines index (Previous = Flat Earth, "Return to
   Main Page"). These are the site's words, held here so every screen imports
   one copy (aogcg brief 3.1, 3.4, D6):

     10  the commandment headings, word for word ("2. You Shall Not Commit
         Idolatry."), 19 topics;
      1  "Other Topics:", 15 topics, plus Come Out and Fight Against Me, a page
         outside the menu (`notInMenu`);
     12  "N. Thus Says The Lord...", 85 topics in groups of 7/6/4/7/9/7/5/6/8/12/6/8.
         The site leaves them unnamed; each has a short name that is OURS
         (ANSWERS_GROUP_NOTE says so wherever they show);
      1  "Index of False Doctrines Within the Churches of Men", its one entry
         listed as "False Doctrines Within the Churches (Index)".

   A topic's group: the corpus keeps the sidebar's order (entry.num, written by
   tools/fetch-answers.py), so each group is the run of topics from its FIRST
   topic below up to the next group's. answers-site.test.js holds every group
   to the converter's siteGroup sidecar and to the sidebar captured from the
   site, so a re-vendor that moves a topic fails the build instead of filing it
   wrong.

   The reading order replaces the array order (brief 3.4). It keeps every
   Previous / Next the site's pages carry but two, each taken from the
   neighbour's reciprocal link: The Volumes of Truth's Previous (the site's
   points at the False Doctrines index; Covetousness's Next points here) and
   THERE IS NO OTHER's, which the site leaves out (the Main Page's Next points
   here). The page outside the menu keeps the neighbours its own page claims,
   outside the chain. The index's external "Proceed to TheVolumesofTruth.com"
   (siteNav.proceed in the sidecar) is left to the screen that shows it.

   Pure data: no DOM, no React.
   ═══════════════════════════════════════════════════════════════════════ */

import { ANSWERS_COMMANDMENTS, ANSWERS_MAIN_PAGE_ID } from './answers-shelves.js';

/** The False Doctrines index: the sidebar's last group, and the chain's last page. */
export const ANSWERS_FD_INDEX_ID = 'false-doctrines-within-the-churches-of-men-regarding';
/** How the sidebar lists it (its title is "False Doctrines Within the Churches of Men Regarding..."). */
export const ANSWERS_FD_INDEX_TEXT = 'False Doctrines Within the Churches (Index)';
/** Flat Earth's "Next topic:" on the site, the end of the topics. */
export const ANSWERS_END_CARD = 'This ends Answers Only God Can Give - Topics';
/** The one line every screen showing the twelve short names carries. */
export const ANSWERS_GROUP_NOTE = 'The site numbers these groups; the short names are ours.';
/** What a page outside the site's menu says where it is listed. */
export const ANSWERS_NOT_IN_MENU = 'Not in the site’s menu';

/* The site's pages outside its menu: listed after Other Topics, never in the
   chain; prev/next are the neighbours the page's own Navigation claims (neither
   points back). */
const UNLISTED = Object.freeze([
  Object.freeze({ id: 'come-out-and-fight-against-me', prev: 'new-heights-in-wickedness', next: 'nature-shall-rise-up-and-fight-against-this-generation' }),
]);

/* [sidebar heading, word for word; the group's first topic; our short name for a numbered group]. */
const SIDEBAR = [
  ['1. You Shall Have No Other gods Before Me.', 'there-is-no-other'],
  ['2. You Shall Not Commit Idolatry.', 'god-speaks-about-idolatry'],
  ['3. You Shall Not Take the Name of The Lord Your God in Vain.', 'god-speaks-regarding-those-who-take-his-name-in-vain'],
  ['4. Remember The Sabbath Day, to Keep it Holy.', 'god-speaks-about-the-sabbath'],
  ['5. Honor Your Father and Your Mother.', 'god-speaks-about-honoring-your-father-and-your-mother'],
  ['6. You Shall Not Murder.', 'thus-says-the-lord-regarding-abortion'],
  ['7. You Shall Not Commit Adultery.', 'god-speaks-regarding-adultery-committed-against-him'],
  ['8. You Shall Not Steal.', 'god-speaks-regarding-those-who-steal-from-him'],
  ['9. You Shall Not Bear False Witness Against Your Neighbor.', 'god-speaks-regarding-those-who-bear-false-witness-in-his-name'],
  ['10. You Shall Not Covet.', 'god-speaks-regarding-covetousness'],
  ['Other Topics:', 'answers-the-volumes-of-truth'],
  ['1. Thus Says The Lord...', 'regarding-what-is-an-abomination-to-the-lord', 'Signs of this generation'],
  ['2. Thus Says The Lord...', 'regarding-prophets-true', 'Prophets, witnesses & gifts'],
  ['3. Thus Says The Lord...', 'regarding-the-united-states', 'The nations'],
  ['4. Thus Says The Lord...', 'regarding-the-churches-of-men', 'The churches'],
  ['5. Thus Says The Lord...', 'regarding-the-mistranslation-and-misinterpretation-of-the-scriptures', 'Scripture & doctrine'],
  ['6. Thus Says The Lord...', 'regarding-the-holy-days-of-god', 'Holy Days, cross & resurrection'],
  ['7. Thus Says The Lord...', 'regarding-forgiveness', 'Forgiveness to salvation'],
  ['8. Thus Says The Lord...', 'regarding-the-day-and-hour-unknown', 'The end & the Kingdom'],
  ['9. Thus Says The Lord...', 'regarding-spiritual-warfare', 'Warfare, sin, death & judgment'],
  ['10. Thus Says The Lord...', 'regarding-patience', 'The walk of faith'],
  ['11. Thus Says The Lord...', 'regarding-health', 'Body, marriage & family'],
  ['12. Thus Says The Lord...', 'regarding-the-book-of-ezekiel', 'People of the Bible & creation'],
  ['Index of False Doctrines Within the Churches of Men', ANSWERS_FD_INDEX_ID],
];

/** The sidebar's 24 headings in order, word for word (ANSWERS_SITE_META.sidebar). */
export const ANSWERS_SIDEBAR = Object.freeze(SIDEBAR.map((r) => r[0]));

/**
 * @typedef {object} AnswersShelf
 * @property {number} n  1..24, the heading's place in the sidebar (siteGroup.n)
 * @property {'commandment' | 'other' | 'tstl' | 'index'} kind
 * @property {string} label  the sidebar heading, word for word
 * @property {number | null} num  the commandment (1..10) or the "Thus Says The Lord..." group (1..12)
 * @property {string | null} short  a numbered group's short name (ours); a commandment's tablet label
 * @property {any} commandment  the ANSWERS_COMMANDMENTS row, for a commandment
 * @property {any[]} topics  the topics the sidebar lists under it, in its order
 * @property {any[]} notInMenu  pages outside the menu listed after them (Other Topics only)
 */

/** The shelf skeletons, in sidebar order (topics filled per corpus). */
const SHELVES = SIDEBAR.map(([label, first, short], i) => {
  const n = i + 1;
  const kind = n <= 10 ? 'commandment' : n === 11 ? 'other' : n <= 23 ? 'tstl' : 'index';
  const num = kind === 'commandment' ? n : kind === 'tstl' ? n - 11 : null;
  const commandment = kind === 'commandment' ? ANSWERS_COMMANDMENTS[n - 1] : null;
  return { n, kind, label, first, num, short: short || (commandment ? commandment.label : null), commandment };
});

let _of = null, _len = -1, _site = null;

/** Build (once per corpus array) the shelves, the chain and an id → place map. */
function site(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list === _of && list.length === _len && _site) return _site;
  const unlisted = new Set(UNLISTED.map((u) => u.id));
  const byId = new Map();
  for (const e of list) if (e && e.id) byId.set(e.id, e);
  const topics = list.filter((e) => e && e.id !== ANSWERS_MAIN_PAGE_ID && !unlisted.has(e.id))
    .slice().sort((a, b) => (a.num || 0) - (b.num || 0));
  const starts = SHELVES.map((s) => { const e = byId.get(s.first); return e ? e.num : Infinity; });
  /** @type {AnswersShelf[]} */
  const shelves = SHELVES.map((s) => ({
    n: s.n, kind: /** @type {any} */ (s.kind), label: s.label, num: s.num, short: s.short,
    commandment: s.commandment, topics: [], notInMenu: [],
  }));
  const shelfOf = new Map();
  for (const e of topics) {
    let g = -1;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= e.num) g = i;
    if (g < 0) continue;
    shelves[g].topics.push(e);
    shelfOf.set(e.id, shelves[g]);
  }
  const other = shelves[10];
  for (const u of UNLISTED) {
    const e = byId.get(u.id);
    if (e) { other.notInMenu.push(e); shelfOf.set(e.id, other); }
  }
  const main = byId.get(ANSWERS_MAIN_PAGE_ID);
  const order = (main ? [main] : []).concat(...shelves.map((s) => s.topics));
  const place = new Map();
  order.forEach((e, i) => place.set(e.id, i));
  _of = list; _len = list.length;
  _site = { shelves, order, place, shelfOf, byId };
  return _site;
}

/**
 * The sidebar's 24 shelves for a corpus, in its order, each with its topics.
 * Commandments: shelves 1-10; Other Topics: 11 (with its `notInMenu` page);
 * "Thus Says The Lord...": 12-23; the False Doctrines index: 24.
 * @param {any[]} entries ANSWERS
 * @returns {AnswersShelf[]}
 */
export function answersSiteShelves(entries) {
  return site(entries).shelves;
}

/**
 * The shelf a topic sits on (Other Topics for a page outside the menu), or
 * null for the Main Page or an id the corpus lacks.
 * @param {any[]} entries ANSWERS
 * @param {string} id
 * @returns {AnswersShelf | null}
 */
export function answersSiteShelfOf(entries, id) {
  return site(entries).shelfOf.get(id) || null;
}

/**
 * The site's reading chain: the Main Page, then the 120 topics in sidebar
 * order, Flat Earth then the False Doctrines index last. Pages outside the
 * menu are not in it. The same array comes back for the same corpus array.
 * @param {any[]} entries ANSWERS
 * @returns {any[]}
 */
export function answersSiteOrder(entries) {
  return site(entries).order;
}

/**
 * @typedef {object} AnswersSiteNav
 * @property {string | null} prev
 * @property {string | null} next
 * @property {string | null} end  Flat Earth: the site's end card
 * @property {{ id: string, title: string } | null} proceed  Flat Earth: on to the False Doctrines index
 * @property {string | null} ret  the index: "Return to Main Page"
 * @property {boolean} notInMenu  a page outside the menu (its claimed neighbours, outside the chain)
 */

/**
 * Previous / Next for one page in the site's chain (ids), with the site's end
 * card and its two hand-offs; a page outside the menu gets the neighbours its
 * own page claims. null for an id the corpus lacks.
 * @param {any[]} entries ANSWERS
 * @param {string} id
 * @returns {AnswersSiteNav | null}
 */
export function answersSiteNav(entries, id) {
  const s = site(entries);
  /** @type {AnswersSiteNav} */
  const nav = { prev: null, next: null, end: null, proceed: null, ret: null, notInMenu: false };
  const u = UNLISTED.find((x) => x.id === id);
  if (u) {
    if (!s.byId.has(id)) return null;
    return { ...nav, prev: s.byId.has(u.prev) ? u.prev : null, next: s.byId.has(u.next) ? u.next : null, notInMenu: true };
  }
  const i = s.place.get(id);
  if (i == null) return null;
  const last = s.order.length - 1;
  nav.prev = i > 0 ? s.order[i - 1].id : null;
  nav.next = i < last ? s.order[i + 1].id : null;
  if (id === ANSWERS_FD_INDEX_ID) {
    nav.ret = s.byId.has(ANSWERS_MAIN_PAGE_ID) ? ANSWERS_MAIN_PAGE_ID : null;
  } else if (nav.next === ANSWERS_FD_INDEX_ID) {
    // The last topic: the site ends the topics here and hands on to the index.
    nav.next = null;
    nav.end = ANSWERS_END_CARD;
    nav.proceed = { id: ANSWERS_FD_INDEX_ID, title: ANSWERS_FD_INDEX_TEXT };
  }
  return nav;
}
