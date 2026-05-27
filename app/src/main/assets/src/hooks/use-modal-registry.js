/* ═══════════════════════════════════════════════════════════════════════
   useModalRegistry — centralized "any modal open?" signal + dispatcher
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   THE PROBLEM W1.5(c) NEEDS THIS TO SOLVE — single-source Escape:
     The desktop PWA's Escape key must close the topmost modal when one
     is open, and navigate back when none are. Two listeners on the same
     keydown event race: a per-modal listener fires first → modal dismisses
     and unregisters → app-level handler runs, reads isAnyOpen() as false
     → fires handleAndroidBack. One Escape press = dismiss AND navigate.

     Resolution (locked in PLAN.txt W1.5 DISPATCHER CONTRACT): the app-
     level keydown handler is the ONLY Escape dispatcher. Modals do NOT
     listen for Escape themselves; they REGISTER a `{ id, dismiss }`
     entry. When Escape fires and isAnyOpen() returns true, the
     dispatcher calls peek().dismiss() — never both dismiss and navigate.

   OWNS:
     - A module-level Map<string, () => void> mapping registered modal
       IDs to their dismiss callbacks. Map insertion order is the
       z-order: peek() returns the LAST registered entry. Re-registering
       an existing id deletes-and-re-sets so the entry moves to "topmost."
     - The imperative `modalRegistry` API used by the app-level dispatcher.
     - The React `useModalRegistry({ id, dismiss, active? })` hook that
       handles register/unregister lifecycle for consumers.

   DOES NOT OWN:
     - The Escape keydown listener itself (lives in useAndroidBack via
       W1.5(c) — the dispatcher reads from this registry but isn't part
       of it).
     - Modal rendering logic — consumers control their own visibility;
       this hook just lets them participate in the gate.

   API — IMPERATIVE (named export `modalRegistry`):
     register({ id, dismiss })  — add or move-to-top. Re-registers
                                  delete-then-set to update insertion order.
     unregister(id)             — remove. Idempotent.
     isAnyOpen()                — boolean. O(1) (Map.size).
     openIds()                  — string[] in insertion order. For debug.
     peek()                     — { id, dismiss } | null. Last registered.
     _reset()                   — TEST-ONLY. Clears registry between runs.

   API — REACT HOOK (named export `useModalRegistry`):
     useModalRegistry({ id, dismiss, active = true })
       Registers `id` while mounted + active; unregisters on unmount or
       when `active` flips false. `dismiss` is mirrored via useRefMirror
       so inline arrow-prop dismiss callbacks don't cause re-registration
       churn (which would otherwise disturb insertion order on every
       parent render). The effect's deps are [id, active] only.

   STRICTMODE BEHAVIOR (verified in tests):
     React 18+ StrictMode in dev invokes setup-cleanup-setup to surface
     side-effect bugs. Sequence: register(id) → unregister(id) →
     register(id). The Map.delete-then-set in register() means the
     final state is one entry per id, idempotent.

   CONFIRMSTRIP UNIQUE-ID CONTRACT (per PLAN.txt):
     Components with multiple potentially-concurrent instances (e.g.
     ConfirmStrip rendered in N rows of a list) MUST generate per-
     instance unique IDs via React.useId() — not a shared literal.
     Shared IDs collapse to one Map entry; one instance unmounting
     unregisters the shared key while the other is still rendering.
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

/** @type {Map<string, () => void>} */
const _registry = new Map();

/**
 * Imperative modal-registry API. Used by the app-level Escape dispatcher
 * (W1.5(c) in useAndroidBack) and any non-React code that needs to read
 * or mutate the registry. React components should prefer the
 * `useModalRegistry` hook below.
 */
export const modalRegistry = {
  /**
   * Add a modal to the registry, or move an existing entry to the top.
   * Re-registering an existing id deletes-then-sets so the entry moves
   * to the end of the Map's insertion order (= "topmost"). Silently
   * ignores invalid input rather than throwing — registration failure
   * should NOT prevent a modal from rendering.
   *
   * @param {{ id: string, dismiss: () => void }} entry
   * @returns {void}
   */
  register(entry) {
    if (!entry || !entry.id || typeof entry.dismiss !== 'function') return;
    // delete-then-set so a re-registration (e.g. a parent re-render
    // triggering the effect after a dep change) lands at the END of the
    // Map's insertion order — peek() = topmost-by-most-recently-registered.
    _registry.delete(entry.id);
    _registry.set(entry.id, entry.dismiss);
  },

  /**
   * Remove a modal from the registry. Idempotent — unregistering an
   * unknown id is a no-op.
   *
   * @param {string} id
   * @returns {void}
   */
  unregister(id) {
    if (!id) return;
    _registry.delete(id);
  },

  /**
   * @returns {boolean} true iff at least one modal is currently registered.
   */
  isAnyOpen() {
    return _registry.size > 0;
  },

  /**
   * @returns {string[]} all registered IDs in insertion order (first = oldest,
   *                     last = topmost). Useful for debug output.
   */
  openIds() {
    return Array.from(_registry.keys());
  },

  /**
   * @returns {{ id: string, dismiss: () => void } | null}
   *   The most-recently-registered entry (= topmost modal), or null if
   *   the registry is empty. Returns a fresh object each call.
   */
  peek() {
    if (_registry.size === 0) return null;
    /** @type {string} */
    let lastId = '';
    /** @type {(() => void) | null} */
    let lastDismiss = null;
    for (const [id, dismiss] of _registry) {
      lastId = id;
      lastDismiss = dismiss;
    }
    if (!lastDismiss) return null;
    return { id: lastId, dismiss: lastDismiss };
  },

  /**
   * Clear the registry. TEST-ONLY: production code MUST go through
   * register/unregister so component lifecycles stay symmetric. Test
   * harnesses call this in `beforeEach` since the registry is a
   * module-level singleton that survives between renderHook calls.
   *
   * @returns {void}
   */
  _reset() {
    _registry.clear();
  },
};

/**
 * Register a modal with the central registry for the duration of the
 * component's mount (or while `active` is true). The dispatcher in
 * W1.5(c) — useAndroidBack's Escape keydown listener — reads from
 * this registry and calls `dismiss()` on the topmost entry instead
 * of firing handleAndroidBack when at least one modal is open.
 *
 * `dismiss` is mirrored via useRefMirror so consumers can pass an
 * inline arrow function (`dismiss={() => setOpen(false)}`) without
 * the effect re-firing on every parent render. The effect's deps
 * are [id, active] only.
 *
 * @param {{
 *   id: string,
 *   dismiss: () => void,
 *   active?: boolean
 * }} args
 *   id      — globally-unique registry key. Components with multiple
 *             potentially-concurrent instances MUST derive this from
 *             React.useId() (e.g. `'confirm-strip:' + useId`). Shared
 *             literals across instances cause one unmount to deregister
 *             all instances.
 *   dismiss — callback the dispatcher invokes on Escape when this
 *             entry is the topmost. Typically the same function the
 *             modal's onCancel / onClose / × button calls.
 *   active  — defaults to true. Set false when the hook is called
 *             unconditionally but the modal is currently hidden (e.g.
 *             SelectionToolbar's `visible` internal state).
 * @returns {void}
 */
export function useModalRegistry({ id, dismiss, active = true }) {
  // Mirror the dismiss callback so the effect doesn't need to re-fire
  // when the consumer's render produces a new arrow-function identity.
  // The wrapper registered below reads dismissRef.current at Escape
  // time — call-time fresh, not effect-time frozen.
  const dismissRef = useRefMirror(dismiss);
  React.useEffect(() => {
    if (!active) return undefined;
    if (!id) return undefined;
    modalRegistry.register({
      id,
      dismiss: () => {
        const fn = dismissRef.current;
        if (typeof fn === 'function') fn();
      },
    });
    return () => modalRegistry.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss is intentionally read via dismissRef (useRefMirror) at dispatch time, not effect-attach time. Including it in deps would re-register the entry on every parent render whenever the consumer passes an inline arrow, disturbing insertion order (= z-order) and producing register/unregister churn. dismissRef itself is a stable ref-object identity per React invariant. See file header §"useModalRegistry".
  }, [id, active]);
}
