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

   findBook needs the lazy Bible corpus. The button warms __loadBibleCorpus
   (idempotent, async-notify-only — the Q8 loader contract) when it comes
   into view, and again on pointerdown/focus, so the corpus is usually ready
   by tap time; a tap that still can't resolve retries briefly on an
   interval — the same pattern as the journal viewer's {{ref:}} links.

   NOT AT MOUNT. FootnoteListSection mounts one button per footnote at the
   foot of every footnoted letter, so a mount-time warm downloaded the whole
   Bible (1.4 MB gzip, a ~0.6 s parse) on every letter open, before any tap
   (docs/perf/lighthouse-2026-09.md, item 2). The view warm observes against
   the reading column's scroll box (.screen-scroll) with a look-ahead margin,
   so the corpus starts as the reader nears the footnote list; a sheet's
   button is in view the moment the sheet opens, which keeps the old
   warm-on-open timing there. Without IntersectionObserver it falls back to
   the old mount warm.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ refStr?: string | null, onGo?: ((endpoint: any) => void) | null }} props
 */
const WARM_LOOKAHEAD = '800px 0px';

function warmBibleCorpus() {
  if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
}

export function GoToRefButton({ refStr, onGo }) {
  const retryRef = React.useRef(/** @type {any} */ (null));
  const firstBtnRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  React.useEffect(() => () => {
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
  }, []);
  const targets = (refStr && typeof splitCompoundRef === 'function')
    ? splitCompoundRef(refStr)
    : [];
  const shown = targets.length > 0 && !!onGo;
  React.useEffect(() => {
    const el = firstBtnRef.current;
    if (!shown || !el) return undefined;
    const IO = /** @type {any} */ (globalThis).IntersectionObserver;
    if (typeof IO !== 'function') { warmBibleCorpus(); return undefined; }
    const io = new IO((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      warmBibleCorpus();
    }, { root: el.closest('.screen-scroll'), rootMargin: WARM_LOOKAHEAD });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  if (!shown) return null;
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
        <button key={i} ref={i === 0 ? firstBtnRef : undefined} type="button" className="fn-sheet-link-btn sc-sheet-goto-btn"
          onPointerDown={warmBibleCorpus} onFocus={warmBibleCorpus} onClick={() => go(part.parsed)}>
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
