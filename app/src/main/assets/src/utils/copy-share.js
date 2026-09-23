/* ═══════════════════════════════════════════════════════════════════════
   copy-share — what happened when a reader copied or shared a passage
   ═══════════════════════════════════════════════════════════════════════
   Pure outcome helpers (inlined into bundle-d; SelectionToolbar and
   NoteSheet are the callers). Until A15 (2026-09-22) both callers fired
   navigator.clipboard.writeText / navigator.share, swallowed the promise
   with `.catch(() => {})` and cleared the selection in the same tick. A
   browser that denies clipboard access (an iframe without clipboard-write,
   an insecure origin, a WebView without the async Clipboard API, a denied
   permission prompt) therefore lost the reader's quote in silence: the
   toolbar closed and nothing reached the clipboard.

   These helpers never reject. They resolve one word the caller acts on:

     'copied'          the text is on the clipboard          -> say "Copied"
     'copied-instead'  no share target, so it was copied     -> say so, and
                                                                 to paste it
     'shared'          the native share sheet completed      -> quiet (the
                                                                 sheet was the
                                                                 feedback)
     'cancelled'       the reader closed the share sheet     -> quiet: an
                       (AbortError)                             intentional
                                                                 cancel is not
                                                                 an error
     'failed'          nothing reached the clipboard or a    -> keep the text
                       share target                             on screen with
                                                                 a retry
                                                                 (CopyFallbackSheet)

   copyFromSelection() is the retry path: it runs synchronously inside the
   reader's tap on "Try again", with the fallback sheet's textarea
   selected, so the legacy execCommand('copy') can succeed where the async
   API was refused, and the async API gets a fresh user activation.
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {'copied' | 'failed'} CopyOutcome */
/** @typedef {'shared' | 'cancelled' | 'copied-instead' | 'failed'} ShareOutcome */

/**
 * Put `text` on the clipboard with the async Clipboard API.
 * @param {string} text
 * @returns {Promise<CopyOutcome>}
 */
export function copyText(text) {
  try {
    const cb = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!cb || typeof cb.writeText !== 'function') return Promise.resolve('failed');
    return Promise.resolve(cb.writeText(text)).then(
      () => /** @type {CopyOutcome} */ ('copied'),
      () => /** @type {CopyOutcome} */ ('failed'),
    );
  } catch (_e) {
    // A getter or writeText itself can throw synchronously in exotic hosts.
    return Promise.resolve('failed');
  }
}

/**
 * Share `text` through the native share sheet; without one, or when the
 * share fails for any reason other than the reader cancelling, copy it.
 * @param {string} text
 * @returns {Promise<ShareOutcome>}
 */
export function shareText(text) {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const copyInstead = () => copyText(text).then(
    (r) => /** @type {ShareOutcome} */ (r === 'copied' ? 'copied-instead' : 'failed'),
  );
  if (!nav || typeof nav.share !== 'function') return copyInstead();
  /** @type {Promise<void>} */
  let pending;
  try {
    pending = Promise.resolve(nav.share({ text }));
  } catch (e) {
    pending = Promise.reject(e);
  }
  return pending.then(
    () => /** @type {ShareOutcome} */ ('shared'),
    (err) => (err && err.name === 'AbortError'
      ? /** @type {ShareOutcome} */ ('cancelled')
      : copyInstead()),
  );
}

/**
 * The "Try again" path. Call it synchronously from the tap handler with
 * `field`'s text selected: execCommand('copy') copies the live selection
 * inside the gesture; when that is refused, the async API is tried again.
 * @param {HTMLTextAreaElement | null} field
 * @param {string} text
 * @returns {Promise<CopyOutcome>}
 */
export function copyFromSelection(field, text) {
  try {
    if (field) {
      field.focus();
      field.select();
    }
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function'
        && document.execCommand('copy')) {
      return Promise.resolve('copied');
    }
  } catch (_e) {
    // execCommand throws in some hosts; the async API below still gets a try.
  }
  return copyText(text);
}
