/* ===================================================================
   passage-link — a passage as a link that opens there (A8, 2026-09-22)
   ===================================================================
   Pure, no state. Imported by SelectionToolbar (bundle-d: Share adds the
   link under the quote) and by hooks/use-shared-passage-link.js (bundle-b:
   the app opens one at boot); a copy in each bundle is harmless.

   A link carries ONE public corpus key, the canonical hlKey of
   utils/hl-keys.js: bible:<book>:<ch>:<v>, study:<chapter>:<block>, or
   letter|wtlb|blessed|holy-days:<id>:<block>. Never journal (the reader's
   own writing), never a note, a highlight, playback or backup data.
   The address is the public site, because the APK's own origin is not
   reachable from someone else's phone.
   =================================================================== */

export const PUBLIC_APP_URL = 'https://votreader.github.io/app/';

const PUBLIC_KEY = /^(?:bible:[a-z0-9-]{2,40}:\d{1,3}:\d{1,3}|study:[a-z0-9-]{2,60}:[a-z0-9-]{1,16}|(?:letter|wtlb|blessed|holy-days):[A-Za-z0-9._-]{1,120}:\d{1,4})$/;

/**
 * The key a link may carry, or null. A trailing character range
 * (":<start>-<end>", a selection inside the block) is dropped.
 * @param {unknown} key
 * @returns {string | null}
 */
export function publicPassageKey(key) {
  if (typeof key !== 'string') return null;
  const k = key.replace(/:\d+-\d+$/, '');
  return PUBLIC_KEY.test(k) ? k : null;
}

/**
 * @param {unknown} key
 * @returns {string | null} the public address that opens this passage
 */
export function passageLinkFor(key) {
  const k = publicPassageKey(key);
  return k ? PUBLIC_APP_URL + '?p=' + encodeURIComponent(k) : null;
}

/**
 * The public key an address names (`?p=`), or null.
 * @param {string} search  location.search
 * @returns {string | null}
 */
export function sharedPassageKey(search) {
  let p = null;
  try { p = new URLSearchParams(search || '').get('p'); } catch (_e) { return null; }
  return publicPassageKey(p);
}

/**
 * What Share sends: the quote, then the reference and the link, or the
 * quote alone when the passage may not travel.
 * @param {string} text
 * @param {unknown} key
 * @param {string | null | undefined} label  e.g. "John 3:16"
 * @returns {string}
 */
export function withPassageLink(text, key, label) {
  const link = passageLinkFor(key);
  if (!link) return text;
  return text + '\n\n' + (label ? label + '\n' : '') + link;
}
