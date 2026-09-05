/* ═══════════════════════════════════════════════════════════════════════
   font-scale — ONE formula for the app's text scale
   ═══════════════════════════════════════════════════════════════════════
   Pure helpers. No DOM, no bridge, no storage.

   THE PROBLEM (FS-INV): `settings.fontScale` defaults to the string "1", so
   the app cannot tell "the reader never opened Text Size" from "the reader
   deliberately chose 100%". On a phone whose system font is set large, the
   first population is being shown text too small for them and does not know
   the setting exists — a silent, ongoing accessibility harm. The second gets
   one visible, reversible surprise. `fontScaleSource` names which input wins,
   so nobody has to guess again.

     'reader' → settings.fontScale, the slider
     'system' → the OS text scale, read from the Android bridge

   THREE RULES WORTH KNOWING BEFORE YOU EDIT:

   1. HYDRATION AND IMPORT ARE DIFFERENT EVENTS, and the legacy default
      differs. A backup carrying `fontScale: "1"` with no source must restore
      as 'reader' — the reader is asking for their state back, not asking the
      app to re-decide — or a 100% export restores at the new phone's scale,
      which is a restore that did not restore. At hydration the same data
      means the opposite: nobody chose anything, so defer to the phone.
      One function, one parameter. Never two implementations.

   2. AN UNKNOWN VALUE BEHAVES AS ABSENT, never as 'system'. A corrupt or
      hand-edited `fontScaleSource` in a backup would otherwise silently adopt
      the device scale, which is the same restore-that-did-not-restore failure
      wearing different clothes.

   3. THE BOOT SCRIPT CANNOT IMPORT THIS FILE. `index.html`'s inline writer
      runs before any bundle, so it carries a LITERAL COPY of `resolveScale`'s
      arithmetic, and `font-scale.boot.test.js` asserts the two agree. That is
      the type-scale gate's pattern and it is deliberate: two definitions that
      must agree is normally a defect, but one of them has to live in
      index.html, so the answer is a test that fails when they diverge rather
      than a collapse that is not available.

   AND ONE THING THE BOOT WRITER MUST NOT DO: call the bridge. It runs before
   any bundle, so `AndroidBridge.getSystemFontScale()` there depends on the
   JavascriptInterface being injected before a document-start inline script —
   probably true, NOT proved on this platform, and a `?? 1` would swallow the
   failure into a resize on every launch. Instead React reads the live bridge
   and writes what it saw back as `settings.systemFontScale`; the boot writer
   reads three strings and calls nothing.
   ═══════════════════════════════════════════════════════════════════════ */

/** The slider's range. Anything outside it is clamped, never rejected. */
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 3;

/** @typedef {'system' | 'reader'} FontScaleSource */

/**
 * What an ABSENT source means at hydration — and therefore at export.
 *
 * Export's job is to record what the reader is currently SEEING, so its
 * default is not a second decision: it is this one, by definition. Naming it
 * once means that if hydration's default ever changes, export follows without
 * anyone remembering to look. (Import is the deliberate exception and passes
 * `'reader'` explicitly — it restores what was asked for, not what this
 * device would decide.)
 *
 * @type {FontScaleSource}
 */
export const HYDRATION_FONT_SCALE_SOURCE = 'system';

/**
 * Which input decides the scale, resolving the legacy shape.
 *
 * @param {{ fontScale?: unknown, fontScaleSource?: unknown }} settings
 * @param {FontScaleSource} legacyDefault what an ABSENT (or unknown) source
 *   means for this event: `'system'` at hydration, `'reader'` at import.
 *   See rule 1 in the header — this parameter is the whole reason the
 *   function takes one.
 * @returns {FontScaleSource}
 */
export function normalizeFontScaleSource(settings, legacyDefault) {
  const s = settings || {};
  if (s.fontScaleSource === 'reader' || s.fontScaleSource === 'system') return s.fontScaleSource;
  // Absent, or unknown-and-therefore-untrusted (rule 2).
  if (legacyDefault === 'reader') return 'reader';
  // Hydration: a scale other than 1 is unambiguous evidence the slider was
  // used. Exactly 1 is the ambiguous case, and it resolves toward the phone.
  const n = parseFloat(String(s.fontScale));
  return (Number.isFinite(n) && n !== 1) ? 'reader' : 'system';
}

/**
 * Clamp one candidate scale. Non-numeric or absent is 1, not a throw and not
 * a NaN: a NaN reaching `--font-scale` gives an unreadable app rather than a
 * crash, which is worse because nobody reports it as a bug.
 *
 * @param {unknown} v
 * @returns {number}
 */
export function clampFontScale(v) {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n)) : 1;
}

/**
 * THE formula. Every writer calls this; nobody applies `fontScale` directly.
 *
 * `index.html`'s inline boot writer carries a literal copy of the expression
 * below — see rule 3 in the header, and `font-scale.boot.test.js`.
 *
 * @param {{ fontScale?: unknown, fontScaleSource?: unknown, systemFontScale?: unknown }} settings
 * @param {FontScaleSource} [source] the already-normalized source; omit to
 *   normalize with the hydration default.
 * @returns {number} the value for --font-scale
 */
export function resolveFontScale(settings, source) {
  const s = settings || {};
  const src = source || normalizeFontScaleSource(s, 'system');
  return src === 'reader' ? clampFontScale(s.fontScale) : clampFontScale(s.systemFontScale);
}

/**
 * The EXACT source of `index.html`'s inline boot writer.
 *
 * The boot script runs before any bundle, so it cannot import this file — it
 * carries a copy. Two definitions that must agree is normally the defect, and
 * everywhere else in this codebase the answer is to delete one; here one of
 * them has to live in index.html, so the answer is instead a test that fails
 * the moment they diverge. `font-scale.boot.test.js` asserts BOTH that
 * index.html contains this string verbatim AND that evaluating it produces
 * what `resolveFontScale` produces, over a table of inputs. A string match
 * alone would pass for two expressions that agree on nothing.
 *
 * It reads `s.settings` and calls NO bridge — see rule 3 in the header. The
 * old `isFinite(fsc) && fsc !== 1` early-out is deliberately gone: with a
 * system source, 1 is no longer a safe "nothing to do".
 */
export const BOOT_FONT_SCALE_EXPR =
  'var st=s.settings||{};var src=st.fontScaleSource;'
  + 'if(src!=="reader"&&src!=="system"){var n0=parseFloat(st.fontScale);'
  + 'src=(isFinite(n0)&&n0!==1)?"reader":"system";}'
  + 'var n1=parseFloat(src==="reader"?st.fontScale:st.systemFontScale);'
  + 'var fsc=isFinite(n1)?Math.min(3,Math.max(0.8,n1)):1;'
  + 'document.documentElement.style.setProperty("--font-scale",String(fsc));';
