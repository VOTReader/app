/* answers-links — resolve an answersonlygodcangive.com URL (a letter's
   relatedTopics row) to the vendored Answers topic, so the row opens IN-APP
   and offline. The URL index ships in bundle-d (answers-url-index.js, written
   by tools/fetch-answers.py), so a row knows it has an in-app destination
   before the lazy corpus (src/data/answers.js) has been fetched; opening it
   fetches the corpus first. The key normalisation mirrors norm() in
   tools/fetch-answers.py: decode, underscores → spaces, lower-case, every
   non-alphanumeric run → one space. */
import { ANSWERS_URL_INDEX, ANSWERS_TITLES } from './answers-url-index.js';
import { loadAnswers } from './sync-loaders.js';

export const ANSWERS_COLLECTION_LABEL = 'Answers Only God Can Give';

// findEntryContext (bundle-b) names a topic from this index while the corpus
// is still unloaded — a saved note or bookmark on a topic, in a new session.
if (typeof window !== 'undefined') window.__answersTitles = ANSWERS_TITLES;

const HOST_RE = /(^|\.)answersonlygodcangive\.com$/i;

export function answersUrlKey(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch (_e) { return null; }
  if (!HOST_RE.test(u.hostname)) return null;
  let path = u.pathname.replace(/^\/+/, '');
  if (/^index\.php$/i.test(path)) path = u.searchParams.get('title') || '';
  try { path = decodeURIComponent(path); } catch (_e) { /* keep the raw path */ }
  const key = path.replace(/_/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return key || null;
}

/** The topic id a site URL names, or null. */
export function answersIdForUrl(url) {
  const key = answersUrlKey(url);
  const id = key ? ANSWERS_URL_INDEX[key] : null;
  return id && ANSWERS_TITLES[id] ? id : null;
}

/** {collection, letterTitle} for an in-app link to the topic a site URL names, or null. */
export function answersLinkForUrl(url) {
  const id = answersIdForUrl(url);
  return id ? { collection: ANSWERS_COLLECTION_LABEL, letterTitle: ANSWERS_TITLES[id] } : null;
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
