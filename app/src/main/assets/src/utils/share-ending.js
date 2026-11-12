/* ===================================================================
   share-ending - what Copy and Share add after the words (SHARE1, 2026-11-12)
   ===================================================================
   Corbin 2026-11-11: "For links, make it controllable. For scriptures,
   default is the verse and range and normal info, no version number, for
   letters there should be like 3 tiers, just the letter's online website
   link as the default minimal. Share should be a different thing though."

   One builder for every Copy and Share of a passage: the selection's Copy,
   Share (tap, hold, "Use the other link") and every other way of copying
   (Ctrl+C, the phone's selection menu), a note's Share, a mark's Copy and
   Share. Pure apart from reading the settings (StateStore, at the moment
   of the copy, like the translation and the link target).

   A passage's source says what it can add:
     kind         'scripture' (a Bible or study passage, a verse sheet) or
                  'letter' (the letters and the other writings with a page)
     place        "John 3:16-18" (no translation)
     translation  "NKJV", "Study Bible" ('' when unknown)
     title        "The Wide Path"
     citation     "Volume Two, Letter 1: The Wide Path · 3/28/05"
     siteLink     its page on the website ('' where it has none: the Bible)
     appLink      the link that opens it in the app ('' for the journal)

   Settings (Settings > Sharing), each its own key for Copy and for Share:
     copyScripture / shareScripture: reference | translation | link | none
     copyLetters / shareLetters:     link | title | citation | none
   and shareLink ('site' | 'app'), the link added wherever one is.

   Where the chosen link does not exist the other one stands in (the Bible
   has no page on the website: its link is the app's); where neither does,
   the name stays (a letter's "Link" gives its title) and nothing is made up.
   =================================================================== */

/** @typedef {{ kind: 'scripture' | 'letter', place: string, translation: string, title: string, citation: string,
     siteLink: string, appLink: string }} PassageSource */
/** @typedef {'copy' | 'share'} ShareAction */

/** Settings > Sharing > From the Scriptures. */
export const SCRIPTURE_CHOICES = Object.freeze([
  { id: 'reference', label: 'Reference', desc: 'John 3:16-18' },
  { id: 'translation', label: 'Reference and translation', desc: 'John 3:16-18 (NKJV)' },
  { id: 'link', label: 'Reference and link', desc: 'The reference, then the link under it' },
  { id: 'none', label: 'Nothing', desc: 'The words alone' },
]);
/** Settings > Sharing > From the letters. */
export const LETTER_CHOICES = Object.freeze([
  { id: 'link', label: 'Link', desc: 'The letter’s page alone' },
  { id: 'title', label: 'Title and link', desc: 'The letter’s title, then the link' },
  { id: 'citation', label: 'Full citation and link', desc: 'Volume, letter number, title and date, then the link' },
  { id: 'none', label: 'Nothing', desc: 'The words alone' },
]);
/** The settings keys and their defaults. */
export const SHARE_ENDING_DEFAULTS = Object.freeze({
  copyScripture: 'reference', copyLetters: 'link', shareScripture: 'reference', shareLetters: 'link',
});

/** The settings key for an action and a kind.
    @param {ShareAction} action @param {'scripture' | 'letter'} kind */
export function endingKey(action, kind) {
  return action + (kind === 'scripture' ? 'Scripture' : 'Letters');
}

/** A stored choice, or the default when it is missing or unknown.
    @param {Record<string, any> | null | undefined} settings @param {ShareAction} action @param {'scripture' | 'letter'} kind */
export function endingChoice(settings, action, kind) {
  const key = endingKey(action, kind);
  const list = kind === 'scripture' ? SCRIPTURE_CHOICES : LETTER_CHOICES;
  const v = settings ? settings[key] : null;
  return list.some((o) => o.id === v) ? v : /** @type {Record<string, string>} */ (SHARE_ENDING_DEFAULTS)[key];
}

/** The reader's settings, or null (tests, a cold start). */
function liveSettings() {
  try {
    const s = typeof StateStore !== 'undefined' && StateStore ? StateStore.get() : null;
    return s && s.settings ? s.settings : null;
  } catch (_e) { return null; }
}

/** cp4: words as a quotation, in ASCII double quotes; words that are already one quotation are not quoted twice.
    @param {string} body */
export function quotedPassage(body) {
  const b = String(body || '').trim();
  if (!b) return '';
  const marks = b.match(/["“”]/g) || [];
  if (marks.length === 2 && /^["“]/.test(b) && /["”]$/.test(b)) return b;
  return '"' + b + '"';
}

/** The link to add: the chosen one, else the other, else ''.
    @param {PassageSource} src @param {'site' | 'app'} target */
export function sourceLink(src, target) {
  return target === 'app' ? (src.appLink || src.siteLink || '') : (src.siteLink || src.appLink || '');
}

/** What goes after the words for this source and choice ('' for nothing).
    @param {PassageSource} src @param {string} choice @param {'site' | 'app'} target */
export function endingFor(src, choice, target) {
  if (choice === 'none') return '';
  const link = sourceLink(src, target);
  /** @param {string} a @param {string} b */
  const lines = (a, b) => [a, b].filter(Boolean).join('\n');
  if (src.kind === 'scripture') {
    if (choice === 'translation') return src.place + (src.translation ? ' (' + src.translation + ')' : '');
    if (choice === 'link') return lines(src.place, link);
    return src.place;
  }
  if (choice === 'title') return lines(src.title, link);
  if (choice === 'citation') return lines(src.citation || src.title, link);
  return link || src.title;
}

/**
 * The whole text a Copy or Share of these words sends: the words quoted, a blank line, then what the
 * reader's setting adds; with a note, "My note: ..." between them. Words with no source (the reader's
 * own journal), or a setting of Nothing, travel alone (a note's words still quoted, with its note).
 * @param {string} words
 * @param {PassageSource | null | undefined} src
 * @param {{ action: ShareAction, target?: 'site' | 'app', choice?: string, note?: string, settings?: Record<string, any> | null }} opts
 * @returns {string}
 */
export function sharedText(words, src, opts) {
  const note = opts.note ? String(opts.note).trim() : '';
  if (!src) return [String(words || '').trim(), note].filter(Boolean).join('\n\n');
  const settings = opts.settings !== undefined ? opts.settings : liveSettings();
  const choice = opts.choice || endingChoice(settings, opts.action, src.kind);
  const target = opts.target || (settings && settings.shareLink === 'app' ? 'app' : 'site');
  const end = endingFor(src, choice, target);
  if (!end && !note) return String(words || '').trim();
  return [quotedPassage(words), note ? 'My note: ' + note : '', end].filter(Boolean).join('\n\n');
}

/** Does this source's added text carry a link that could be swapped for the other one (the note after a
    share, "Use the other link", and holding Share)? Only when it has both links and the choice adds one.
    @param {PassageSource | null | undefined} src @param {ShareAction} action */
export function canSwapLink(src, action) {
  if (!src || !src.siteLink || !src.appLink) return false;
  const choice = endingChoice(liveSettings(), action, src.kind);
  return src.kind === 'scripture' ? choice === 'link' : choice !== 'none';
}
