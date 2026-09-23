/* ═══════════════════════════════════════════════════════════════════════
   CopyFallbackSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The passage a Copy or Share could not deliver (A15, 2026-09-22). When
   the browser refuses the clipboard (utils/copy-share.js resolves
   'failed'), the reader's quote must not vanish with the selection
   toolbar: this bottom sheet keeps it on screen in a read-only, selectable,
   scrollable box, says how to copy it by hand, and offers "Try again".

   Try again runs copyFromSelection() synchronously inside the tap, with
   the box's text selected, so execCommand('copy') can succeed where the
   async Clipboard API was refused, and the async API gets a fresh user
   activation. A second refusal changes the instruction to the manual
   route (press and hold, Select all, Copy) instead of looping.

   Design: Codex mockup variant 2A (lanes/docs/out/a15-mockups.html).
   Participates in the modal registry (Escape / Android back close it
   first) and traps focus while open. Mounted by SelectionToolbar.
   ═══════════════════════════════════════════════════════════════════════ */

import { copyFromSelection } from '../../utils/copy-share.js';

/**
 * @param {{ text: string, verb?: 'copy' | 'share', onClose: () => void, onCopied: () => void }} props
 */
export function CopyFallbackSheet({ text, verb, onClose, onCopied }) {
  const fieldRef = React.useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const [stillBlocked, setStillBlocked] = React.useState(false);
  const trapRef = useFocusTrap(true);
  useModalRegistry({ id: 'copy-fallback', dismiss: () => onClose() });

  // Select the passage on open, so the platform's own Copy is one gesture away.
  React.useEffect(() => {
    const f = fieldRef.current;
    if (!f) return;
    try { f.focus(); f.select(); } catch (_e) { /* focus can throw in exotic hosts */ }
  }, []);

  const retry = () => {
    copyFromSelection(fieldRef.current, text).then((r) => {
      if (r === 'copied') onCopied();
      else setStillBlocked(true);
    });
  };

  const rows = Math.min(7, Math.max(2, Math.ceil(text.length / 38)));

  return (
    <div className="copy-fallback-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        className="copy-fallback"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-fallback-title"
        aria-describedby="copy-fallback-help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="copy-fallback-handle" aria-hidden="true" />
        <h2 id="copy-fallback-title" className="copy-fallback-title">
          {verb === 'share' ? 'Couldn’t share' : 'Couldn’t copy'}
        </h2>
        <p id="copy-fallback-help" className="copy-fallback-help">
          {stillBlocked
            ? 'Still blocked. Press and hold the passage, choose Select all, then Copy.'
            : 'Copy the selected passage below, or try again.'}
        </p>
        <textarea
          ref={fieldRef}
          className="copy-fallback-text"
          readOnly
          value={text}
          rows={rows}
          aria-label="The passage"
        />
        <div className="copy-fallback-actions">
          <button type="button" className="copy-fallback-btn primary" onClick={retry}>Try again</button>
          <button type="button" className="copy-fallback-btn" onClick={() => onClose()}>Close</button>
        </div>
      </div>
    </div>
  );
}
