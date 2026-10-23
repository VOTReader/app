/* answers-links — resolve an answersonlygodcangive.com URL (a letter's
   relatedTopics row) to the vendored Answers topic, so the row opens IN-APP
   and offline. The URL index ships in bundle-d (answers-url-index.js, written
   by tools/fetch-answers.py), so a row knows it has an in-app destination
   before the lazy corpus (src/data/answers.js) has been fetched; opening it
   fetches the corpus first. The key normalisation mirrors norm() in
   tools/fetch-answers.py: decode, underscores → spaces, lower-case, every
   non-alphanumeric run → one space.

   A URL also names a SECTION after its '#' (aogcg 1b, brief 7.2 / C11): both
   forms the site writes keep it, /Title#Section and
   /index.php?title=Title#Section, and answersIdForUrl hands it on as
   `anchor` (answers-sections.js turns it into a paragraph once the topic is
   on screen). */
import { ANSWERS_URL_INDEX, ANSWERS_TITLES } from './answers-url-index.js';
import { loadAnswers } from './sync-loaders.js';
import { answersAnchorKey, answersSectionAnchor } from './answers-sections.js';

export const ANSWERS_COLLECTION_LABEL = 'Answers Only God Can Give';

// findEntryContext (bundle-b) names a topic from this index while the corpus
// is still unloaded — a saved note or bookmark on a topic, in a new session.
if (typeof window !== 'undefined') window.__answersTitles = ANSWERS_TITLES;
// v2's letter foot (src/v2/screens/LetterFoot.jsx) places a Related Topics row
// with this, so bundle-v2 needs no second copy of the index.
if (typeof window !== 'undefined') window.__answersIdForUrl = answersIdForUrl;

const HOST_RE = /(^|\.)answersonlygodcangive\.com$/i;

/* A fragment that names a PAGE, not a section of the page before it. The site's
   own Related Topics on Regarding the Day of The Lord (item 6) link
   I_Am_Calling_You_Out#Come_Out_and_Fight_Against_Me: that page never had such
   a section, and the words are the title of the page outside the site's menu
   (brief 2.4). Keyed `<page key>#<anchor key>`. */
const FRAGMENT_PAGES = {
  'i am calling you out#come out and fight against me': 'come-out-and-fight-against-me',
};

/** The URL, parsed, when it is the site's; else null. */
function siteUrl(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch (_e) { return null; }
  return HOST_RE.test(u.hostname) ? u : null;
}

/** The page part of a site URL, decoded: the path, or index.php's ?title=. */
function pagePath(u) {
  let path = u.pathname.replace(/^\/+/, '');
  if (/^index\.php$/i.test(path)) path = u.searchParams.get('title') || '';
  try { path = decodeURIComponent(path); } catch (_e) { /* keep the raw path */ }
  return path;
}

/**
 * The words a URL's #:~:text= fragment starts on, decoded ('' without one): the site's "find in letter".
 * "start,end" lands on start; a "prefix-," or ",-suffix" part is context around the words, not them.
 * @param {string} url
 */
export function answersFragmentStart(url) {
  const s = String(url || '');
  const at = s.indexOf(':~:text=');
  if (at < 0) return '';
  const parts = s.slice(at + 8).split('&')[0].split(',').filter((p) => p && !p.endsWith('-') && !p.startsWith('-'));
  try { return parts.length ? decodeURIComponent(parts[0]).trim() : ''; } catch (_e) { return ''; }
}

/** The page key a site URL names (its #fragment is not part of it), or null. */
export function answersUrlKey(url) {
  const u = siteUrl(url);
  if (!u) return null;
  const key = pagePath(u).split('#')[0].replace(/_/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return key || null;
}

/**
 * The section a site URL names after its '#', as the site wrote it
 * ('For_the_Sake_of_Pride', '.22In_My_Name.22'), percent-escapes decoded; null
 * for none. index.php?title=X%23Y (an escaped '#') counts too.
 * @param {string} url
 * @returns {string | null}
 */
export function answersUrlAnchor(url) {
  const u = siteUrl(url);
  if (!u) return null;
  let frag = u.hash ? u.hash.slice(1) : '';
  if (!frag) { const p = pagePath(u); const i = p.indexOf('#'); if (i >= 0) frag = p.slice(i + 1); }
  else { try { frag = decodeURIComponent(frag); } catch (_e) { /* keep it as written */ } }
  return frag || null;
}

/**
 * The topic a site URL names and the section in it, or null when it names no
 * vendored page (the site's search, a page the app does not carry).
 * @param {string} url
 * @returns {{ id: string, anchor: string | null } | null}
 */
export function answersIdForUrl(url) {
  const key = answersUrlKey(url);
  if (!key) return null;
  const anchor = answersUrlAnchor(url);
  const page = anchor ? FRAGMENT_PAGES[key + '#' + answersAnchorKey(anchor)] : null;
  if (page && ANSWERS_TITLES[page]) return { id: page, anchor: null };
  const id = ANSWERS_URL_INDEX[key];
  return id && ANSWERS_TITLES[id] ? { id, anchor } : null;
}

/** {collection, letterTitle} for an in-app link to the topic a site URL names, or null. */
export function answersLinkForUrl(url) {
  const t = answersIdForUrl(url);
  return t ? { collection: ANSWERS_COLLECTION_LABEL, letterTitle: ANSWERS_TITLES[t.id] } : null;
}

/**
 * The navigateToLink endpoint that opens the topic a site URL names: at the
 * section it names, or with any earlier landing cleared (surpriseAnchor null)
 * so the topic opens where its own scroll memory says. null when the URL names
 * no vendored page.
 * @param {string} url
 */
export function answersEndpointForUrl(url) {
  const t = answersIdForUrl(url);
  return t ? { type: 'wtlb', screen: 'answers-entry', letterId: t.id, surpriseAnchor: answersSectionAnchor(t.id, t.anchor) } : null;
}

/**
 * Open an Answers link through `open` (LetterView's in-app link handler) once
 * the corpus is in: the letter registry learns the topics only when their
 * file has run (index.html __finishVotInit, the loader's finish hook).
 * @param {{collection: string, letterTitle: string}} link
 * @param {(link: any) => void} open
 */
export function openAnswersLink(link, open) {
  return loadAnswers().then(() => open(link));
}
