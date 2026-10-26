/* ═══════════════════════════════════════════════════════════════════════
   FootnoteSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { inertAttr } from '../../utils/inert-attr.js';
import { sheetReference } from '../../utils/passage-copy.js';
import { _fnTextRedundantWithLink } from './VerseWithNumbers.jsx';
import { WebDoorButton } from './footnote-web-door.jsx';
import { EditionCompare } from './EditionCompare.jsx';
import { FootnoteNoteText } from './FootnoteNoteText.jsx';
import { inAppTitleForUrl, findTitleIn } from '../../utils/footnote-note.js';

/** The registry's "<collection>::<title>" keys (index.html builds it from the corpora on the page). */
function registryKeys() {
  return typeof VOT_LETTER_REGISTRY !== 'undefined' && VOT_LETTER_REGISTRY ? VOT_LETTER_REGISTRY.keys() : [];
}

/** A letter, entry or topic by its title, as an in-app link, or null. @param {string} title @param {boolean} [answers] */
export function inAppLinkForTitle(title, answers = false) {
  return findTitleIn(registryKeys(), title, answers);
}

/**
 * Open the in-app page a footnote's web link names (share-fn): an Answers topic
 * may not be on the page yet, so it is fetched first; a page still not found
 * opens on the web, as the link always did.
 * @param {{ title: string, answers: boolean }} page @param {string} url @param {(link: any) => void} onInAppLink
 */
export function openInAppPage(page, url, onInAppLink) {
  const hit = inAppLinkForTitle(page.title, page.answers);
  if (hit) { onInAppLink(hit); return; }
  const web = () => { try { window.open(url, '_blank', 'noopener'); } catch (_e) { /* nothing more to try */ } };
  const load = page.answers && typeof window.__loadAnswersCorpus === 'function' ? window.__loadAnswersCorpus() : null;
  if (!load) { web(); return; }
  Promise.resolve(load).then(() => {
    const found = inAppLinkForTitle(page.title, page.answers);
    if (found) onInAppLink(found); else web();
  }, web);
}

/** A scripture footnote's body, and the verse a reference inside a note opens (share-fn).
    @param {{ refStr: string, verse: string | null, onGoToRef?: any, fn?: any, onBefore?: () => void }} props */
function ScriptureFnBody({ refStr, verse, onGoToRef, fn, onBefore }) {
  return (
    <>
      <span className="fn-sheet-ref">{refStr}</span>
      {verse ? (
        <div className="fn-sheet-verse" data-copy-ref={sheetReference(refStr)}>
          <ScriptureVerseText text={verse} cite={refStr} />
        </div>
      ) : (
        <div className="fn-sheet-verse-missing">
          Verse text isn’t available for this reference. The footnote points to <strong>{refStr}</strong>, but no matching entry was found in this letter’s scripture dictionary.
        </div>
      )}
      {typeof GoToRefButton !== 'undefined' && onGoToRef && (
        <GoToRefButton refStr={refStr} onGo={onGoToRef} />
      )}
      <EditionCompare key={refStr} cite={refStr} />
      {fn && <WebDoorButton fn={fn} onBefore={onBefore} />}
    </>
  );
}

export function FootnoteSheet({ num, fn, nkjv, footnotes, onClose, onInAppLink, onNavigate, onGoToRef }) {
  const isOpen = num != null;
  // Companion rail (2026-08-03): on wide viewports the sheet docks in the
  // right gutter as a NON-modal panel — no trap, no backdrop, complementary
  // role. Bottom-sheet modality is unchanged below the rail threshold.
  const rail = useRailMode();
  const trapRef = useFocusTrap(isOpen, { modal: !rail });   // rail: no trap, but focus returns on close
  // SC5: fall back to the global BOOKS corpus when this letter's own nkjv dict
  // doesn't carry the ref — the inline ref sheet (LetterView) already does this;
  // the data gate is a backstop, not the sole source.
  const verse = fn?.type === "scripture" ? (nkjv?.[fn.ref] || lookupVersesFromBooks(fn.ref) || null) : null;
  // share-fn: a Bible reference inside a note opens its verse IN the sheet, over the
  // note, with a way back to it (the button, Escape, Android Back); another
  // footnote, or closing, leaves it.
  const [inner, setInner] = React.useState(/** @type {string | null} */ (null));
  React.useEffect(() => { setInner(null); }, [num, isOpen]);
  const innerId = React.useId();
  useModalRegistry({ id: 'fn-sheet-inner-ref:' + innerId, dismiss: () => setInner(null), active: !!inner });
  const innerVerse = inner ? (nkjv?.[inner] || lookupVersesFromBooks(inner) || null) : null;
  const page = fn && fn.type !== 'scripture' && fn.url && !fn.link ? inAppTitleForUrl(fn.url) : null;
  const pageLink = page && onInAppLink ? (inAppLinkForTitle(page.title, page.answers) || (page.answers ? { letterTitle: page.title } : null)) : null;
  // Build ordered key list once we know the footnotes dict; keys are
  // typically numeric strings ("1", "2", "10"), so sort numerically when
  // possible and fall back to lexical order for unusual keys.
  const orderedKeys = footnotes ? Object.keys(footnotes).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  }) : [];
  const curIdx = num != null ? orderedKeys.indexOf(String(num)) : -1;
  const prevKey = curIdx > 0 ? orderedKeys[curIdx - 1] : null;
  const nextKey = curIdx >= 0 && curIdx < orderedKeys.length - 1 ? orderedKeys[curIdx + 1] : null;
  const total = orderedKeys.length;
  const showNav = total > 1 && onNavigate && curIdx !== -1;
  // position:fixed sheet — portal to <body> so it anchors to the viewport, not to
  // the reading screen's `.pager-track` (whose transient page-swipe transform
  // would otherwise become its containing block and drop it off-screen — see
  // ScriptureSheet for the full rationale).
  return ReactDOM.createPortal(
    <>
      {!rail && <div className={`fn-sheet-backdrop${isOpen ? ' open' : ''}`} aria-hidden="true" onClick={isOpen ? onClose : undefined} />}
      <div className={`fn-sheet${isOpen ? ' open' : ''}${rail ? ' rail' : ''}`} ref={trapRef} role={rail ? 'complementary' : 'dialog'} aria-modal={!rail && isOpen ? 'true' : undefined} aria-live={rail ? 'polite' : undefined} aria-atomic={rail ? 'true' : undefined} aria-hidden={!isOpen} {...inertAttr(!isOpen)} aria-label={fn ? `Footnote ${num}` : 'Footnote'}>
        <SheetHandle onClose={onClose} />
        {fn && (
          <>
            <div className="fn-sheet-num-row">
              <div className="fn-sheet-num">
                Footnote {num}
                {showNav && <span className="fn-sheet-num-of"> of {total}</span>}
              </div>
              {showNav && (
                <div className="fn-sheet-nav">
                  <button
                    className="fn-sheet-nav-btn"
                    onClick={() => prevKey != null && onNavigate(prevKey)}
                    disabled={prevKey == null}
                    aria-label="Previous footnote"
                    title="Previous footnote"
                  >
                    ‹
                  </button>
                  <button
                    className="fn-sheet-nav-btn"
                    onClick={() => nextKey != null && onNavigate(nextKey)}
                    disabled={nextKey == null}
                    aria-label="Next footnote"
                    title="Next footnote"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
            {inner ? (
              <>
                <button type="button" className="fn-sheet-back" onClick={() => setInner(null)}>
                  <span aria-hidden="true">‹</span>Back to footnote {num}
                </button>
                <ScriptureFnBody refStr={inner} verse={innerVerse} onGoToRef={onGoToRef} />
              </>
            ) : fn.type === "scripture" ? (
              <>
                <ScriptureFnBody refStr={fn.ref} verse={verse} onGoToRef={onGoToRef} fn={fn} onBefore={onClose} />
                {fn.seeAlso && (
                  <div className="fn-sheet-see-also">
                    <span className="fn-sheet-see-also-label">Also see</span>
                    <InAppLinkButton
                      link={{ collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt }}
                      onActivate={onInAppLink}
                      label={fn.seeAlso.label || fn.seeAlso.letterTitle}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                {fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && (
                  <div className="fn-sheet-note">
                    <FootnoteNoteText
                      text={fn.text}
                      onRef={setInner}
                      onLetter={onInAppLink ? (title, excerpt) => { const l = inAppLinkForTitle(title); if (l) onInAppLink(excerpt ? { ...l, excerpt } : l); } : null}
                      canOpenLetter={(title) => !!inAppLinkForTitle(title)}
                    />
                  </div>
                )}
                {fn.link && <InAppLinkButton link={fn.link} onActivate={onInAppLink} />}
                {pageLink && page && <InAppLinkButton link={pageLink} onActivate={() => openInAppPage(page, fn.url, onInAppLink)} />}
                {fn.url && (
                  <div className={(fn.link || fn.text) ? "fn-sheet-url-extra" : "fn-sheet-note"}>
                    <a href={fn.url} target="_blank" rel="noopener noreferrer" className="fn-link">
                      {(fn.link || fn.text) ? "Open external link" : fn.url}
                    </a>
                  </div>
                )}
                {!fn.text && !fn.link && !fn.url && (
                  <div className="fn-sheet-verse-missing">This footnote has no content attached.</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>,
    document.body
  );
}
