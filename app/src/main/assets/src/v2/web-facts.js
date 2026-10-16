/* web-facts - the Scripture Web's facts for v2 (zones v2p8, design dz14 5e): where a passage the web opens goes in v2,
   the settings main's screen reads, and the gate's.

   Main's ScriptureWebScreen (bundle-d, on window) hands its navigateToLink a LinkEndpoint: a verse ({ type: 'bible',
   key: 'bible:<book>:<ch>:<v>' }, or the fallback list's { type: 'bible', bookId, chapter, verse }), a study chapter
   ({ type: 'study-letter', studyId, studyChapterId }), a letter or an entry (key 'letter:<id>:0', 'wtlb:...',
   'blessed:...', 'holy-days:...'), or one of the reader's own link ends (journal). v2 opens each in its own place. */
import { placeOfKey } from './notes-facts.js';

const g = /** @type {any} */ (globalThis);

/**
 * The v2 route a web endpoint opens, or null when v2 cannot show it.
 * @param {any} ep @param {any} [env]
 * @returns {Record<string, any> | null}
 */
export function webRoute(ep, env = g) {
  if (!ep || typeof ep !== 'object') return null;
  // a study chapter's key ('study:<study>:<chapter>') is not the Matthew note key placeOfKey reads
  if (ep.type === 'study-letter') {
    return ep.studyId && ep.studyChapterId ? { place: 'study-chapter', study: ep.studyId, chapter: ep.studyChapterId } : null;
  }
  if (ep.type === 'bible' && ep.bookId && ep.chapter) {
    const verse = parseInt(ep.verse, 10);
    return { place: 'bible-chapter', book: ep.bookId, chapter: Number(ep.chapter), verse: verse > 0 ? verse : null };
  }
  if (ep.key) {
    const p = placeOfKey(ep.key, env);
    if (p && p.open) return p.open;
  }
  return null;
}

/** What a gate boot of 5e hands main's screen: the guide seen, Famous (main's default), nothing saved. */
export const GATE_WEB_SETTINGS = Object.freeze({ swGuideSeen: true, webDensity: 'famous' });
