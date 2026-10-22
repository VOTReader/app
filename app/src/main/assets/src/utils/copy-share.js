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

   sh1 (Corbin 2026-09-27): the Android app's WebView has no
   navigator.share, so until now Share there always copied instead. The
   phone's own share sheet (Messages, WhatsApp, email…) now comes through
   the bridge (PlatformBridge.shareText, AppInterface.shareText) and is
   tried first. Android cannot say whether the reader then shared or
   closed the sheet, so its answer is 'shared' (quiet, as a cancel is); a
   text it refuses (empty, or too long for one share) is copied instead.
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
 * The Android app's share sheet (sh1): true when the phone took the text.
 * False on the web (no bridge), and when the bridge refuses or throws.
 * @param {string} text
 * @returns {boolean}
 */
function appShareSheet(text) {
  try {
    return typeof PlatformBridge !== 'undefined' && !!PlatformBridge && PlatformBridge.isAndroid === true
      && typeof PlatformBridge.shareText === 'function' && PlatformBridge.shareText(text) === true;
  } catch (_e) {
    return false;
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
  if (appShareSheet(text)) return Promise.resolve(/** @type {ShareOutcome} */ ('shared'));
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

/** @typedef {'shared' | 'cancelled' | 'saved' | 'failed'} ImageShareOutcome */

/**
 * A card drawn on the device (AnswersCardSheet) to the phone's share sheet, and only there or to the
 * reader's downloads: nothing is sent anywhere else. The Android app takes the PNG through the bridge
 * (PlatformBridge.shareImage); a browser that can share files gets navigator.share with it; one that
 * cannot, or whose share fails for any reason but the reader closing it, saves the PNG instead
 * (PlatformBridge.saveToFile, the app's one download path). Never rejects.
 * Pass the PNG made when the card was painted (`ready`) so navigator.share runs inside the tap
 * itself: a share called after toBlob's callback can outlive the tap's activation (a slow phone,
 * Safari) and be refused with NotAllowedError, which would save the PNG instead of sharing it.
 * @param {HTMLCanvasElement} canvas
 * @param {string} name the file's name
 * @param {Blob | null} [ready] the canvas's PNG, made ahead
 * @returns {Promise<ImageShareOutcome>}
 */
export function shareCanvasImage(canvas, name, ready) {
  const PB = typeof PlatformBridge !== 'undefined' ? PlatformBridge : null;
  if (PB && PB.isAndroid === true) {
    try {
      const url = canvas.toDataURL('image/png');
      const ok = typeof PB.shareImage === 'function' && PB.shareImage(url.slice(url.indexOf(',') + 1)) === true;
      return Promise.resolve(ok ? 'shared' : 'failed');
    } catch (_e) {
      return Promise.resolve('failed');
    }
  }
  /** @param {Blob} blob @returns {Promise<ImageShareOutcome>} */
  const saveInstead = (blob) => new Promise((resolve) => {
    if (!PB || typeof PB.saveToFile !== 'function') { resolve('failed'); return; }
    const w = /** @type {any} */ (window);
    w.__onExportComplete = (/** @type {string} */ r) => { w.__onExportComplete = null; resolve(r === 'ok' ? 'saved' : 'failed'); };
    try { PB.saveToFile(name, blob); } catch (_e) { w.__onExportComplete = null; resolve('failed'); }
  });
  /** @param {Blob | null} blob @returns {Promise<ImageShareOutcome>} */
  const withBlob = (blob) => {
    if (!blob) return Promise.resolve(/** @type {ImageShareOutcome} */ ('failed'));
    const nav = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator) : null;
    let file = null;
    try { file = new File([/** @type {Blob} */ (blob)], name, { type: 'image/png' }); } catch (_e) { file = null; }
    let can = false;
    try { can = !!(file && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })); } catch (_e) { can = false; }
    if (!can) return saveInstead(/** @type {Blob} */ (blob));
    /** @type {Promise<void>} */
    let pending;
    try { pending = Promise.resolve(nav.share({ files: [file] })); } catch (e) { pending = Promise.reject(e); }
    return pending.then(
      () => /** @type {ImageShareOutcome} */ ('shared'),
      (err) => (err && err.name === 'AbortError' ? /** @type {ImageShareOutcome} */ ('cancelled') : saveInstead(/** @type {Blob} */ (blob))),
    );
  };
  if (ready) return withBlob(ready);
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch (_e) { resolve(null); }
  }).then((blob) => withBlob(/** @type {Blob | null} */ (blob)));
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
