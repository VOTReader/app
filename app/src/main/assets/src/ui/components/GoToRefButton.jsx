/* ═══════════════════════════════════════════════════════════════════════
   GoToRefButton — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The "Go to Scripture" action on every scripture-reference bottom sheet
   (FootnoteSheet, ScriptureSheet, the LetterView / WtlbEntryView inline
   ref sheets). Parses the sheet's ref string; when it reads as a Bible
   reference, renders the gold in-app-link-style button. A tap resolves
   the ref to a {type:'bible'} endpoint and hands it to `onGo` — the host
   closes its sheet and routes the endpoint through navigateToLink, which
   owns the scroll-to-verse flash highlight, the "Back to …" pill, and
   Android-back (via the from-letter stack).

   COMPOUND CITES: the Matthew study cites are often semicolon lists
   ("Psalm 118:14; Isaiah 12:2") — each part gets its OWN button, so every
   listed passage is one tap away. splitCompoundRef (data/scripture-resolution)
   is the shared decomposer: it also carries the book forward across bookless
   segments ("Daniel 9:27; 11:31") and expands comma verse lists
   ("Matthew 5:3-4, 7"), both of which the old local `.split(';')` dropped on
   the floor. A ref string with no parseable part renders nothing.

   findBook needs the lazy Bible corpus. The mount effect pre-warms
   __loadBibleCorpus (idempotent, async-notify-only — the Q8 loader
   contract) so the corpus is usually ready by tap time; a tap that still
   can't resolve retries briefly on an interval — the same pattern as the
   journal viewer's {{ref:}} links.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ refStr?: string | null, onGo?: ((endpoint: any) => void) | null }} props
 */
export function GoToRefButton({ refStr, onGo }) {
  const retryRef = React.useRef(/** @type {any} */ (null));
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
    return () => {
      if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    };
  }, []);
  const targets = (refStr && typeof splitCompoundRef === 'function')
    ? splitCompoundRef(refStr)
    : [];
  if (targets.length === 0 || !onGo) return null;
  const go = (parsed) => {
    if (retryRef.current) return; // a resolve retry is already pending
    const tryNav = () => {
      var bookKey = (typeof findBook === 'function') ? findBook(parsed.rawBook) : null;
      if (!bookKey) return false; // corpus not loaded yet
      var endpoint = { type: 'bible', bookId: bookKey, chapter: parsed.chapter };
      if (parsed.verse != null) endpoint.verse = parsed.verse;
      if (parsed.verseEnd != null) endpoint.verseEnd = parsed.verseEnd;
      onGo(endpoint);
      return true;
    };
    if (tryNav()) return;
    if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
    var tries = 0;
    retryRef.current = setInterval(() => {
      if (tryNav() || ++tries >= 40) { clearInterval(retryRef.current); retryRef.current = null; }
    }, 250);
  };
  return (
    <>
      {targets.map((part, i) => (
        // part.ref is the canonical self-contained label — "(TAG)" suffix
        // dropped, dash variants normalized, an inherited book spelled out.
        <button key={i} type="button" className="fn-sheet-link-btn sc-sheet-goto-btn" onClick={() => go(part.parsed)}>
          <span className="fn-sheet-link-body">
            <span className="fn-sheet-link-eyebrow">Go to Scripture</span>
            <span className="fn-sheet-link-title">{part.ref}</span>
          </span>
          <span className="fn-sheet-link-chevron">{"›"}</span>
        </button>
      ))}
    </>
  );
}
