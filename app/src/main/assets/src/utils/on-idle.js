/* onIdle — schedule work for an idle moment, on every engine.
   ═══════════════════════════════════════════════════════════════════════
   `requestIdleCallback` HAS NEVER SHIPPED IN WEBKIT. Not Safari, and not any
   iOS browser of any brand, because every iOS engine is WebKit. So a bare
   `requestIdleCallback(fn)` is not a progressive enhancement on those devices,
   it is a `ReferenceError` — and every call site has to carry the same guard.

   "Remember the guard" is an instruction, and instructions do not hold. Both
   call sites in this codebase did carry it, correctly, and the one added most
   recently carried it by hand again. This is the guard, once, plus an eslint
   rule that stops the bare global coming back.

   WHY IT RETURNS A CANCEL RATHER THAN A TOKEN, and this is the part that was
   actually wrong before: in a browser BOTH `requestIdleCallback` and
   `setTimeout` return a number, so `typeof tok === 'number'` cannot tell the
   two apart. MyProgressScreen's cleanup tested exactly that and then called
   `cancelIdleCallback` on it — correct today only because `requestIdleCallback`
   and `cancelIdleCallback` have always shipped together. That is a coincidence
   the code was relying on, not a rule. This closure remembers which branch it
   took, so the pairing cannot come apart. */

/**
 * Run `fn` at the next idle moment, falling back to a timer where
 * `requestIdleCallback` does not exist.
 *
 * @param {() => void} fn
 * @param {{ timeout?: number, fallbackDelay?: number }} [opts]
 *   `timeout` bounds the idle wait (a permanently busy main thread would
 *   otherwise starve the callback forever). `fallbackDelay` is the timer delay
 *   on the WebKit path — the call sites differ here on purpose, so it is a
 *   parameter rather than a constant.
 * @returns {() => void} cancel — idempotent, safe after the callback has run.
 */
export function onIdle(fn, opts) {
  const timeout = (opts && opts.timeout) || 0;
  const fallbackDelay = (opts && opts.fallbackDelay) || 0;

  // Read through globalThis, not as a bare identifier: this module is the one
  // place allowed to touch it, and a bare reference would be a ReferenceError
  // in a host where it is genuinely absent rather than merely undefined.
  const ric = /** @type {any} */ (globalThis).requestIdleCallback;
  if (typeof ric === 'function') {
    const tok = timeout > 0 ? ric(fn, { timeout }) : ric(fn);
    return () => {
      const cancel = /** @type {any} */ (globalThis).cancelIdleCallback;
      if (typeof cancel === 'function') cancel(tok);
    };
  }

  const tok = setTimeout(fn, fallbackDelay);
  return () => clearTimeout(tok);
}
