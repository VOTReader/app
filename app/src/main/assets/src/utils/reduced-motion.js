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

   WHY IT RETURNS 'instant' AND NOT 'auto':

     'auto' means "resolve from the computed `scroll-behavior`", and
     app.css:481 sets `html { scroll-behavior: smooth }`. So 'auto' lands
     instantly ONLY because the reduce block at ~:542 overrides that
     property with `!important` — i.e. the JS fix would be load-bearing on a
     CSS rule in another file. Narrow that block, scope it off `*`, or drop
     the `!important`, and every call site here silently animates again with
     every test still green, because a test can only assert the ARGUMENT
     PASSED, not the behavior the browser resolved.

     'instant' jumps regardless of the computed property, so the argument IS
     the outcome and the test that asserts it is sufficient. Shipped in
     Chrome 97; the build targets chrome108. `VolumeLetterIndex.jsx:24`
     already used this idiom before any of this.

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
 * 'instant', not 'auto' — see the header. 'auto' would defer to the computed
 * `scroll-behavior`, which app.css sets to `smooth` at the root.
 *
 * @returns {'instant' | 'smooth'}
 */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'instant' : 'smooth';
}
