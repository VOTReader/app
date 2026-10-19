/* ═══════════════════════════════════════════════════════════════════════
   SrchCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { translationLabel } from '../../data/translations.js';
import { recall, remember, docKey } from './srch-memory.js';
import { formsToMark } from '../../utils/marked-forms.js';
import { snippetText } from './SrchSnippet.jsx';

/* What one unit of a kind is called in "3 more places in this letter": the kinds
   whose one doc is a whole letter, entry, topic or study chapter, so its text can
   say the words in more than one place. A verse is one place by definition. */
const PLACE_UNIT = {
  letter: 'letter',
  wtlb: 'entry',
  blessed: 'entry',
  'holy-day': 'entry',
  answers: 'topic',
  'bible-study': 'chapter',
};

/**
 * The words a card marks. Merge the engine's per-result matched terms (MiniSearch only — the
 * doc-side words a fuzzy/prefix search actually hit, e.g. typed "sheperd" matched "shepherd")
 * into the query-level term list, so a typo-corrected match still gets its <mark> in the
 * snippet. Classic results carry no entry.terms and pass through unchanged. A typed small
 * word's own forms stay out (formsToMark).
 * @param {any} entry @param {string[]} terms @param {string[] | undefined} stopTyped
 */
function cardTerms(entry, terms, stopTyped) {
  return (entry && entry.terms && entry.terms.length)
    ? (terms || []).concat(formsToMark(entry.terms.filter((/** @type {string} */ t) => (terms || []).indexOf(t) < 0), terms, stopTyped || []))
    : terms;
}

/** Where a hit's quote opens: a text only the meaning search found (engine.js meaningFirst)
 *  names the passage the model matched (sweep W33). @param {any} entry @param {any} doc */
function cardPlaceStart(entry, doc) {
  return doc && typeof entry.placeStart === 'number' && entry.placeStart >= 0 &&
    entry.placeStart < String(doc.text || '').length ? entry.placeStart : undefined;
}

/** @type {Record<string, 1>} */
const TITLED = { heading: 1, 'chapter-title': 1, 'letter-title': 1, 'wtlb-title': 1, 'blessed-title': 1, 'holy-day-title': 1, 'answers-title': 1 };

/** What a card quotes from: a title hit its title, a heading its heading, else its text. @param {any} doc */
function cardBody(doc) {
  const titled = Object.prototype.hasOwnProperty.call(TITLED, doc.kind);
  const body = doc.kind === 'heading' ? (doc.heading || doc.text) : titled ? (doc.title || doc.text) : doc.text;
  return { titled, body };
}

/**
 * What a card leads with and where it is filed. Named items (letters / WTLB / Blessed /
 * Holy-Days / studies) lead with their NAME so a result is identifiable at a glance;
 * verses/headings lead with their reference. The location (ref) becomes a muted sub-line
 * when it isn't the name. @param {any} doc
 */
function cardHeads(doc) {
  const refLine = doc.ref || (doc.title || '') + (doc.chapterNum ? ' ' + doc.chapterNum : '');
  const named = doc.kind !== 'verse' && doc.kind !== 'heading' && doc.kind !== 'chapter-title' && !!doc.title;
  let headline = named ? doc.title : refLine;
  let locLine = (named && refLine && refLine !== doc.title) ? refLine : '';
  // A study chapter leads with its own title. The index folds the study's name into
  // both its title and its location, so the card said the long name twice.
  const cut = doc.kind === 'bible-study' && doc.title ? doc.title.indexOf(' \u2014 ') : -1;
  if (cut > 0) {
    const study = doc.title.slice(0, cut);
    const num = String(doc.ref || '').indexOf(study) === 0 ? String(doc.ref).slice(study.length).trim() : '';
    headline = doc.title.slice(cut + 3);
    locLine = study + (num ? ' \u00b7 Chapter ' + num : '');
  }
  return { named, headline, locLine };
}

/**
 * The passage a card shows, as plain words: what Best Matches compares to fold a reprint
 * under its original (srch-reprints.js, search200 UX B10 2). '' with no snippet engine.
 * @param {any} entry @param {string[]} terms @param {string[]} [stopTyped]
 */
export function cardPassage(entry, terms, stopTyped) {
  const doc = entry && entry.doc;
  const sm = /** @type {any} */ (window).VotSearchMini;
  if (!doc || !sm || typeof sm.snippet !== 'function') return '';
  const { titled, body } = cardBody(doc);
  if (!body) return '';
  return snippetText(sm, body, cardTerms(entry, terms, stopTyped), titled ? undefined : cardPlaceStart(entry, doc), 180) || '';
}

/* `also`: the reprints Best Matches folded under this card (search200 UX B10 2), offered in an
   "Also in N places" row after the snippet, each its own tap. */
export function SrchCard({ entry, terms, onSelect, isDirect, memo = '', where = '', stopTyped = undefined, also = undefined }) {
  const doc = (!isDirect && entry && entry.doc) || null;
  const hlTerms = cardTerms(entry, terms, stopTyped);
  // Every OTHER place this unit says the words (Brianna, 2026-09-26): a letter's
  // snippet shows one passage, and the passage she was looking for sat three
  // hits further down the same letter with nothing to say it was there.
  const unit = doc ? PLACE_UNIT[doc.kind] : undefined;
  const placeText = unit ? doc.text || '' : '';
  const termsKey = (hlTerms || []).join('\u0001');
  // A text only the meaning search found (engine.js meaningFirst) names the passage the model
  // matched: the snippet quotes the window that opens there, where the reader will land, and
  // not the typed words' densest window further on (sweep W33), which the places list offers.
  const placeStart = cardPlaceStart(entry, doc);
  const places = React.useMemo(() => {
    const sm = /** @type {any} */ (window).VotSearchMini;
    if (!placeText || !sm || typeof sm.morePlaces !== 'function') return [];
    return sm.morePlaces(placeText, hlTerms || [], undefined, typeof sm.snippetAt === 'function' ? placeStart : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- termsKey is hlTerms by value; the array is rebuilt every render.
  }, [placeText, termsKey, placeStart]);
  // `memo` names the search: a "more places" list the reader opened is open again on Back.
  // `where` is the row the card sits in: a letter in Best Matches and in its group is two
  // cards, and opening one opened both on Back.
  const placesKey = doc ? 'places|' + where + '|' + docKey(doc) : '';
  const [placesOpen, setPlacesOpen] = React.useState(() => !!(placesKey && recall(memo, placesKey)));
  const togglePlaces = () => {
    remember(memo, placesKey, !placesOpen);
    setPlacesOpen(!placesOpen);
  };
  const alsoKey = doc ? 'also|' + where + '|' + docKey(doc) : '';
  const [alsoOpen, setAlsoOpen] = React.useState(() => !!(alsoKey && recall(memo, alsoKey)));
  const toggleAlso = () => {
    remember(memo, alsoKey, !alsoOpen);
    setAlsoOpen(!alsoOpen);
  };

  if (isDirect) {
    return (
      <button className="srch-card card-direct" onClick={() => onSelect(entry)}>
        <div className="srch-card-top">
          <span className="srch-card-ref">{entry.__label}</span>
        </div>
        <div className="srch-card-snippet">{entry.__sub || 'Go'}</div>
      </button>
    );

  }
  const meta = SRCH_KIND_LABEL[doc.kind] || { label: doc.kind, cls: '' };
  const { named, headline, locLine } = cardHeads(doc);
  const { titled, body } = cardBody(doc);
  // A title marks the typed words it holds (search200 B6): a letter found by its title, whose
  // body never says them, showed no mark anywhere. A reference ("Psalms 23:1") is a place, unmarked.
  const smHead = /** @type {any} */ (window).VotSearchMini;
  const headSpans = named && hlTerms && hlTerms.length && smHead && typeof smHead.highlightSpans === 'function'
    ? smHead.highlightSpans(headline, hlTerms, terms) : null;
  const card = (
    <button className="srch-card" onClick={() => onSelect(entry)}>
      <div className="srch-card-top">
        <span className="srch-card-ref">{headSpans ? headSpans.map((/** @type {{text:string, hit:boolean}} */ s, /** @type {number} */ i) =>
          s.hit ? <mark key={i} className="search-highlight">{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>
        ) : headline}</span>
        <span className={"srch-card-badge " + (meta.cls || '')}>{meta.label}</span>
        {/* W0: resolve the engine's raw translation id ('rnkjv') through the
            TRANSLATION_OPTIONS registry ('NKJV-R') — the same label the rest
            of the app shows. Never render the raw id uppercased ('RNKJV');
            translationLabel falls back to the NKJV default for unknown ids. */}
        {doc.translation && doc.translation !== 'nkjv' && <span className="srch-card-badge">{translationLabel(doc.translation)}</span>}
        {doc.heading && doc.kind === 'verse' && <span className="srch-card-badge badge-heading">{doc.heading.length > 28 ? doc.heading.slice(0, 28) + '…' : doc.heading}</span>}
      </div>
      {locLine && <div className="srch-card-loc">{locLine}</div>}
      <div className="srch-card-snippet">
        <SrchSnippet text={body || ''} terms={hlTerms} typed={terms} start={titled ? undefined : placeStart} />
      </div>
    </button>
  );
  const reprints = (also || []).filter((r) => r && r.doc);
  if (!places.length && !reprints.length) return card;
  const n = places.length;
  const sm = /** @type {any} */ (window).VotSearchMini;
  // A place is its own tap: `placeStart` rides the entry to the dispatcher, which
  // lands the reader on THAT passage instead of the snippet's (use-search.js).
  // The reprints row comes first: it is about the passage the snippet shows.
  return (
    <div className="srch-card-wrap">
      {card}
      {reprints.length ? (
        <button type="button" className="srch-also-toggle" aria-expanded={alsoOpen} onClick={toggleAlso}>
          <span>Also in {reprints.length} {reprints.length === 1 ? 'place' : 'places'}</span>
          <span className={"srch-places-chevron" + (alsoOpen ? " open" : "")} aria-hidden="true">▸</span>
        </button>
      ) : null}
      {reprints.length && alsoOpen ? (
        <ul className="srch-also">
          {reprints.map((r) => {
            const h = cardHeads(r.doc);
            const kind = SRCH_KIND_LABEL[r.doc.kind];
            return (
              <li key={docKey(r.doc)}>
                <button type="button" className="srch-also-item" onClick={() => onSelect(r)}>
                  <span className="srch-also-title">{h.headline}</span>
                  <span className="srch-also-where">{h.locLine || (kind && kind.label) || ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {n ? <button
        type="button"
        className="srch-places-toggle"
        aria-expanded={placesOpen}
        onClick={togglePlaces}
      >
        <span>{n} more {n === 1 ? 'place' : 'places'} in this {unit}</span>
        <span className={"srch-places-chevron" + (placesOpen ? " open" : "")} aria-hidden="true">▸</span>
      </button> : null}
      {n && placesOpen ? (
        <ul className="srch-places">
          {places.map((p) => (
            <li key={p.start}>
              <button type="button" className="srch-place" onClick={() => onSelect({ ...entry, placeStart: p.start })}>
                <span className="srch-place-text">
                  {sm.highlightSpans(p.clip, hlTerms || [], terms).map((s, i) =>
                    s.hit ? <mark key={i} className="search-highlight">{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>
                  )}
                </span>
                <span className="srch-place-go" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

}
