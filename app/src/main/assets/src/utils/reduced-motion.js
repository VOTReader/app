/* ═══════════════════════════════════════════════════════════════════════
   reduced-motion — the OS "reduce motion" setting, for the JS side
   ═══════════════════════════════════════════════════════════════════════
   Pure helper. Read at CALL time, never cached: Android and desktop both
   let the setting change while the app is open, and a cached boot-time
   answer would keep animating for the rest of the session.

   WHY THIS EXISTS, given app.css already has a
   `@media (prefers-reduced-motion: reduce)` block (app.css ~:533):

     That block sets `scroll-behavior: auto !important`, which governs
     CSS-DRIVEN scrolling — anchor jumps, `html { scroll-behavior: smooth }`,
     and any scrollIntoView/scrollTo call that does NOT name a behavior.
     Per CSSOM-View the `behavior` option is only resolved from the computed
     `scroll-behavior` property when it is 'auto'; an explicit 'smooth'
     argument wins over the CSS property, `!important` included. So every
     call site that passes a behavior has to make the decision in JS.

   Use `scrollBehavior()` in place of a hard-coded 'smooth':

     el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });

   Calls that pass no behavior at all already default to 'auto' and are
   reached by the CSS block — leave them alone.

   Absent/throwing matchMedia (some embedded WebViews) falls back to MOTION,
   not to reduced: a smooth scroll is a comfort loss, an exception thrown
   inside a click handler is a dead button.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Is the OS asking for reduced motion right now?
 *
 * @returns {boolean} false when the query is unavailable or throws.
 */
export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_e) { return false; }   // matchMedia absent in some embedded webviews
}

/**
 * The `behavior` to hand scrollIntoView / scrollTo / scrollBy.
 *
 * @returns {'auto' | 'smooth'}
 */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
