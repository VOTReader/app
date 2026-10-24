/* ═══════════════════════════════════════════════════════════════════════
   wait-notice — one "Loading… / Couldn't open" toast for taps that wait (s03.2, s04.5, s04.6, s05.1, s05.3, s14.3)
   ═══════════════════════════════════════════════════════════════════════
   Several taps wait on content that loads on demand (a letter link before the letters, Next Book from Revelation
   22, Surprise Me on a cold start, Go to Scripture before the Bible) or fail for a reason the reader cannot see (a
   search result whose letter is gone, an edition that did not download). Each used to wait in silence and then
   give up in silence: the tap read as dead. They now say so, all in the same words and the same place:

     noteLoading('Loading the letters…')   while the tap waits; it stays up until noteDone or noteGaveUp
     noteDone()                            the wait ended (the jump ran, or the reader moved on)
     noteGaveUp('Couldn’t open …', { retry, retryLabel })   the tap gave up; an optional button tries again

   One toast id (WAIT_TOAST_ID) for the lot, so a later wait replaces an earlier one rather than stacking; a caller
   with its own toast (the translation notice) passes its own `id`. Text goes in by textContent and the button is
   built by DOM, so a dynamic label (an edition's name) needs no trusted markup.
   ═══════════════════════════════════════════════════════════════════════ */

import { showToast, hideToast } from './toast.js';

export const WAIT_TOAST_ID = 'vot-toast-wait';
/** A loading notice that outlives its wait (a loader that never settles) clears itself. */
const LOADING_MAX_MS = 15000;

/** @param {string} text @param {{ id?: string }} [opts] */
export function noteLoading(text, opts) {
  showToast({ id: (opts && opts.id) || WAIT_TOAST_ID, className: 'vot-toast', text, durationMs: LOADING_MAX_MS, ariaLive: 'polite' });
}

/** @param {{ id?: string }} [opts] */
export function noteDone(opts) {
  hideToast((opts && opts.id) || WAIT_TOAST_ID);
}

/**
 * The tap gave up. With `retry`, the toast carries a button that hides it and runs `retry`.
 * @param {string} text
 * @param {{ id?: string, retry?: () => void, retryLabel?: string, durationMs?: number }} [opts]
 */
export function noteGaveUp(text, opts) {
  const id = (opts && opts.id) || WAIT_TOAST_ID;
  const retry = opts && typeof opts.retry === 'function' ? opts.retry : null;
  showToast({
    id, className: retry ? 'vot-toast vot-toast-action' : 'vot-toast', text,
    durationMs: (opts && opts.durationMs) || (retry ? 8000 : 5000), ariaLive: 'assertive',
  });
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (!el) return;
  // showToast sets the class on a NEW element only; a reused one keeps its first (cf. update-toast.js). Only a
  // toast with a button takes the finger.
  el.classList.toggle('vot-toast-action', !!retry);
  if (!retry) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vot-escape-btn';
  btn.textContent = (opts && opts.retryLabel) || 'Try again';
  btn.addEventListener('click', () => { hideToast(id); retry(); }, { once: true });
  el.appendChild(document.createTextNode(' '));
  el.appendChild(btn);
}
