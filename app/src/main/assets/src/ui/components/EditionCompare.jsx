/* ═══════════════════════════════════════════════════════════════════════
   EditionCompare — "Compare editions" on the scripture sheets (n166)
   ═══════════════════════════════════════════════════════════════════════
   Under a sheet's NKJV verse: a quiet toggle that opens the same reference
   in every other edition on this device, each beside its short name, then
   one dim line naming the editions not downloaded (Codex mockup
   lanes/myweb/out/id1/F/mockup/board-r1.png, A; the text is never cut). Nothing is fetched until
   the reader opens it, and nothing is downloaded: utils/edition-compare.js
   reads only what is in memory or already on the device.
   ═══════════════════════════════════════════════════════════════════════ */

import { translationLabel, translationName, translationLang } from '../../data/translations.js';
import { OfflineEditions } from '../../utils/offline-editions.js';
import { bibleReady, compareEditions, compareParts, readCompare } from '../../utils/edition-compare.js';

/** @typedef {import('../../utils/edition-compare.js').CompareText} CompareText */

/** @param {{ text: CompareText }} props */
function CompareVerses({ text }) {
  const many = text.length > 1;
  return (
    <>
      {text.map((part) => {
        const shown = part.verses.filter((v) => v.text);
        const range = part.verses.length > 1;
        return (
          <p key={part.label} className="sc-compare-text">
            {many ? <span className="sc-compare-part">{part.label + ' '}</span> : null}
            {shown.length
              ? shown.map((v, i) => (
                <React.Fragment key={v.n}>
                  {i ? ' ' : null}
                  {range ? <sup className="sc-compare-vn">{v.n}</sup> : null}
                  {v.text}
                </React.Fragment>
              ))
              : <span className="sc-compare-none">Not in this edition</span>}
          </p>
        );
      })}
    </>
  );
}

/** @param {{ cite: string | null | undefined }} props */
export function EditionCompare({ cite }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState(/** @type {{ phase: 'idle' | 'loading' | 'ready', shown: string[], missing: string[], rows: Record<string, CompareText | null | undefined>, none: boolean }} */ ({ phase: 'idle', shown: [], missing: [], rows: {}, none: false }));
  const listId = React.useId();

  React.useEffect(() => {
    if (!open || !cite) return undefined;
    let live = true;
    const isLive = () => live;
    setState({ phase: 'loading', shown: [], missing: [], rows: {}, none: false });
    (async () => {
      const w = /** @type {any} */ (window);
      if (!bibleReady() && typeof w.__loadBibleCorpus === 'function') {
        try { await w.__loadBibleCorpus(); } catch (_e) { /* the parts below come back empty */ }
      }
      try { await OfflineEditions.check(); } catch (_e) { /* the store says what it can */ }
      if (!live) return;
      const parts = compareParts(cite);
      const { shown, missing } = compareEditions();
      if (!parts.length) { setState({ phase: 'ready', shown: [], missing: [], rows: {}, none: true }); return; }
      setState({ phase: 'ready', shown, missing, rows: {}, none: false });
      await readCompare(cite, parts, shown, (code, text) => {
        setState((s) => ({ ...s, rows: { ...s.rows, [code]: text } }));
      }, isLive);
    })();
    return () => { live = false; };
  }, [open, cite]);

  if (!cite) return null;
  return (
    <div className="sc-compare">
      <button type="button" className="sc-compare-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <span>Compare editions</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sc-compare-chev"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="sc-compare-list" id={listId} aria-busy={state.phase !== 'ready' || state.shown.some((c) => state.rows[c] === undefined)}>
          {state.phase === 'loading' ? <p className="sc-compare-note">Loading…</p> : null}
          {state.none ? <p className="sc-compare-note">This reference can’t be compared.</p> : null}
          {state.shown.map((code) => {
            const text = state.rows[code];
            return (
              <div key={code} className="sc-compare-row">
                <span className="sc-compare-ed">{translationLabel(code)}<span className="sr-only">{', ' + translationName(code)}</span></span>
                {text === undefined ? <p className="sc-compare-text sc-compare-wait">Reading…</p>
                  : text === null ? <p className="sc-compare-text sc-compare-none">Could not be read</p>
                    : <div className="sc-compare-body" lang={translationLang(code)}><CompareVerses text={text} /></div>}
              </div>
            );
          })}
          {state.phase === 'ready' && !state.none && !state.shown.length ? (
            <p className="sc-compare-note">No other editions on this device yet.</p>
          ) : null}
          {state.missing.length ? (
            <p className="sc-compare-note">{'Not downloaded: ' + state.missing.map(translationLabel).join(', ')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
