/* inertAttr - the `inert` attribute in the form the SHIPPED React writes (n7-03).
   ─────────────────────────────────────────────────────────────────────────────
   Readers run the vendored React 18.2.0 (react.min.js). React 18 does not know
   `inert`, so `inert={true}` is dropped with a console warning and the element
   stays focusable and readable - a closing sheet, a pre-rendered neighbour page.
   The tests ran React 19 (which does know it) until 2026-09-25, so they passed.
   React 18 writes an unknown attribute's STRING value: '' gives `inert=""`, the
   HTML boolean form. Spread it: <div {...inertAttr(!isOpen)}>. The `any` keeps
   @types/react 19 (boolean inert) from refusing the string. */

/**
 * @param {boolean} on
 * @returns {any} `{ inert: '' }` when on, else `{}`
 */
export function inertAttr(on) {
  return on ? { inert: '' } : {};
}
