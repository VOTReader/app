/* ═══════════════════════════════════════════════════════════════════════
   site-link — where a copied passage lives on thevolumesoftruth.com
   ═══════════════════════════════════════════════════════════════════════
   Bundled into bundle-d (utils/passage-copy.js is the caller). Pure: no
   DOM, no state, no network.

   cp2 (Corbin 2026-09-27): a copy from a letter ends with the letter's name
   AND the closest link to it on the website proper, so a reader pasting it
   never hunts for the link. The site is a MediaWiki (1.32) that names every
   letter's page by the letter's own title, and 349 of the app's 350 letter
   titles are that name exactly, so no list of links ships: the address is
   built from the title.
   - SITE_ALIASES / SECTION_ALIASES: the few titles the site spells
     differently.
   - COMPILATION_PAGES: Words To Live By and The Blessed are ONE page each,
     an entry a section of it: the page, then "#" and the entry's title as
     MediaWiki anchors it (wikiAnchor).
   - A Letter Study is one page; HUB_PAGES are pages that hold a study's
     description and its PDF rather than its words (the Matthew Study Bible
     among them), so a link there quotes nothing.
   Then the passage itself: a text fragment ("#:~:text=first words,last
   words"), which Chrome, Edge, Safari and Firefox scroll to and highlight;
   the letters' own links already use them. Words the page does not have
   open the page (or the section) as a plain link would, so the quote can
   make a link better and never worse.

   tools/site-pages.json is the site's page list (tools/fetch-site-pages.py
   refreshes it); site-link.test.js resolves every letter, preface, entry,
   study and Answers source against it, so a title the site does not have
   fails the build instead of shipping a dead link.
   ═══════════════════════════════════════════════════════════════════════ */

export const SITE_URL = 'https://www.thevolumesoftruth.com/';

/** App titles whose page the site names differently. @type {Record<string, string>} */
export const SITE_ALIASES = {
  'Do Not Look Back; Escape to The Fathers House': 'Do Not Look Back; Escape to The Father’s House',
  'YahuShua The Messiah, The Lamb of God': 'YahuShua... The Lamb of God: The TRUE Chronology of The Messiah’s Crucifixion and Resurrection',
  'The False Doctrine of "The Trinity" Exposed - The Holy Spirit is Not a Person': 'The False Doctrine of “The Trinity” Exposed - The Holy Spirit is Not a Person',
};

/** Compilation entries whose section the site heads differently. @type {Record<string, string>} */
export const SECTION_ALIASES = {
  'Bound by The Word': 'Back Cover: "Bound by The Word"',
};

/** A compilation's collection name (the app's, or an Answers source line's) → its one page. @type {Record<string, string>} */
export const COMPILATION_PAGES = {
  'Words To Live By: Part One': 'Words To Live By: Part One',
  'Words To Live By: Part Two': 'Words To Live By: Part Two',
  'The Blessed': 'The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior',
};

export const MATTHEW_STUDY_PAGE = 'The Volumes of Truth New Testament Study Bible - The Book of Matthew';

/** Pages that describe a study and offer its PDF: a link there quotes no words. */
export const HUB_PAGES = new Set([
  MATTHEW_STUDY_PAGE,
  'YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)',
  'YahuShua... The Lamb of God: The TRUE Chronology of The Messiah’s Crucifixion and Resurrection',
]);

/** How many words a text fragment quotes from each end of the passage. */
const QUOTE_WORDS = 4;

/**
 * @typedef {{ page?: string, href?: string, anchor?: string, hub?: boolean }} SiteTarget
 *   page: a page of this site by title; href: a whole address instead (an
 *   Answers topic's page on answersonlygodcangive.com); anchor: its section;
 *   hub: the page does not hold the words (quote none).
 */

/** A page by title, through its alias. @param {string} title @returns {SiteTarget | null} */
export function pageTarget(title) {
  const page = SITE_ALIASES[title] || title;
  return page ? { page, hub: HUB_PAGES.has(page) } : null;
}

/**
 * Where an entry lives on the site, from what findEntryContext says of it;
 * null when the site has no page for it (an Answers topic is another site).
 * @param {{ kind?: string, screen?: string, collection?: string, title?: string, entry?: any } | null | undefined} ctx
 * @returns {SiteTarget | null}
 */
export function siteTarget(ctx) {
  if (!ctx || !ctx.title || ctx.screen === 'answers-entry') return null;
  // A Letter Study: its one page (its chapters are sections of it).
  if (ctx.kind === 'study-letter') return pageTarget(ctx.collection || '');
  // A compilation entry, or a Holy Days entry taken from one (its sourceLabel names it).
  const from = ctx.entry && ctx.entry.type === 'wtlb' ? ctx.entry.sourceLabel : null;
  return sourceTarget(ctx.title, (from && COMPILATION_PAGES[from]) ? from : (ctx.collection || ''));
}

/**
 * Where a letter named by title and collection lives: an Answers source line
 * ("~ [From “Title” ~ Volume 2]"), or an entry of the app's own.
 * @param {string} title @param {string} collection @returns {SiteTarget | null}
 */
export function sourceTarget(title, collection) {
  const compilation = COMPILATION_PAGES[collection];
  if (compilation) return { page: compilation, anchor: wikiAnchor(SECTION_ALIASES[title] || title) };
  return pageTarget(title);
}

/** A page title as the site's own links write it ("Words_To_Live_By:_Part_One"). @param {string} title */
export function wikiPath(title) {
  return encodeURIComponent(title.replace(/ /g, '_'))
    .replace(/'/g, '%27')
    .replace(/%(3B|40|24|2C|2F|3A)/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * A section heading's anchor as MediaWiki 1.32 writes it (its "legacy" ids,
 * the site's default): spaces to "_", every byte but [A-Za-z0-9_.:-] as ".XX".
 * "Come, Love Awaits You" → "Come.2C_Love_Awaits_You".
 * @param {string} heading
 */
export function wikiAnchor(heading) {
  let out = '';
  for (const byte of new TextEncoder().encode(heading.trim().replace(/ +/g, '_'))) {
    const c = String.fromCharCode(byte);
    out += /[A-Za-z0-9_.:-]/.test(c) ? c : '.' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

/** One term of a text fragment, its syntax characters ("-", "," and "&") escaped. @param {string} s */
function fragmentTerm(s) {
  return encodeURIComponent(s).replace(/-/g, '%2D');
}

/**
 * The text fragment for a passage whose words, line by line, are `lines`
 * (a line never runs across a paragraph, a poem's line or a footnote, where
 * the site's words may break): its first and last few words, or all of
 * them when they are few. '' when there are no words.
 * @param {string[][]} lines  each line's whole words
 */
export function textFragment(lines) {
  const rows = lines.filter((l) => l.length);
  if (!rows.length) return '';
  const first = rows[0], last = rows[rows.length - 1];
  if (rows.length === 1 && first.length <= QUOTE_WORDS * 2) return ':~:text=' + fragmentTerm(first.join(' '));
  return ':~:text=' + fragmentTerm(first.slice(0, QUOTE_WORDS).join(' '))
    + ',' + fragmentTerm(last.slice(-QUOTE_WORDS).join(' '));
}

/**
 * The link: the page, its section, and the quoted words (none on a hub page).
 * @param {SiteTarget | null} target
 * @param {string[][]} [lines]  the passage's whole words, line by line
 * @returns {string}
 */
export function siteUrl(target, lines) {
  const base = !target ? '' : target.href ? target.href.split('#')[0] : target.page ? SITE_URL + wikiPath(target.page) : '';
  if (!base) return '';
  const quote = !target.hub && lines ? textFragment(lines) : '';
  const hash = (target.anchor || '') + quote;
  const url = base + (hash ? '#' + hash : '');
  // A chat app's link-finder leaves a closing mark off a link's end ("…(Part 2)").
  return url.replace(/[.,:;!?)'*]$/, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** "Volume 7" (an Answers source line) → "Volume Seven" (the app's name for it). @param {string} name */
export function collectionName(name) {
  const m = /^Volume (\d)$/.exec(name);
  const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
  return m && words[+m[1]] ? 'Volume ' + words[+m[1]] : name;
}
