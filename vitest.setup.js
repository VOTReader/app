/* Vitest setup file (Q5.1).
   ─────────────────────────
   Runs before every test. Two responsibilities:

     1. Make `React` available as a global. The codebase's hooks reference
        `React.useRef`, `React.useEffect`, etc. (no `import { useRef } from
        'react'` syntax — historical decision tied to the classic-script
        bundle approach). Tests need `React` accessible without each test
        file importing it.

     2. Stub `window.__*` runtime bridges. The hooks reach into these for
        cross-component coordination (close-sheet, open-sheet, scroll-to,
        etc.). jsdom provides `window` but not the app-specific bridges,
        so hook bodies would throw on first bridge access without stubs.

        The stub list is mechanically extracted — re-run after any hook
        edit that introduces a new bridge:

          grep -hoE 'window\.__[A-Za-z_]+' app/src/main/assets/src/hooks/*.js | sort -u

   Future setup expansion: if hook tests need TabsContext or other React
   contexts, add a default `wrapper` component here that tests can opt
   into via the renderHook `wrapper` option.
*/

import * as React from 'react';
import { modalRegistry, useModalRegistry } from './app/src/main/assets/src/hooks/use-modal-registry.js';

// (1) React as a global.
globalThis.React = React;
// (1b) W1.5(a.2) — useModalRegistry + modalRegistry as globals.
//      ConfirmStrip (and any other component that participates in the
//      Escape-key gate) references useModalRegistry as a free variable
//      at function-call time — matches the production reality, where
//      _entry-b.js Object.assigns it onto window. Without this, tests
//      that render ConfirmStrip (or any registered modal component)
//      throw "useModalRegistry is not defined".
globalThis.useModalRegistry = useModalRegistry;
globalThis.modalRegistry = modalRegistry;

// (2) window.__* bridges. Stub each as a no-op so hook bodies that touch
//     them at attach time (window.__closeSheet = onClose, etc.) don't
//     throw. Tests that care about a specific bridge can override the
//     stub in beforeEach.
const _bridgeStubs = [
  '__bookmarkCreate',
  '__bookmarkEdit',
  '__closeSheet',
  '__hideSelectionToolbar',
  '__onDwellCommit',
  '__onReadingComplete',
  '__open',
  '__openBookmarkPopover',
  '__openJournalInbound',
  '__openLinkPicker',
  '__openLinkPickerForTarget',
  '__openLinkSidebar',
  '__openNote',
  '__openX',
  '__pendingHighlight',
  '__pendingLinkExcerpt',
  '__pendingScrollHlKey',
  '__showAnnChip',
  '__showMultiNote',
];

const _noop = () => {};
for (const name of _bridgeStubs) {
  if (!(name in window)) {
    window[name] = _noop;
  }
}
