/* ═══════════════════════════════════════════════════════════════════════
   SrchCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { translationLabel } from '../../data/translations.js';
import { recall, remember, docKey } from './srch-memory.js';

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

export function SrchCard({ entry, terms, onSelect, isDirect, memo = '' }) {
  const doc = (!isDirect && entry && entry.doc) || null;
  // Merge the engine's per-result matched terms (MiniSearch only — the
  // doc-side words a fuzzy/prefix search actually hit, e.g. typed "sheperd"
  // matched "shepherd") into the query-level term list, so a typo-corrected
  // match still gets its <mark> in the snippet. Classic results carry no
  // entry.terms and pass through unchanged.
  const hlTerms = (entry && entry.terms && entry.terms.length)
    ? (terms || []).concat(entry.terms.filter((t) => (terms || []).indexOf(t) < 0))
    : terms;
  // Every OTHER place this unit says the words (Brianna, 2026-09-26): a letter's
  // snippet shows one passage, and the passage she was looking for sat three
  // hits further down the same letter with nothing to say it was there.
  const unit = doc ? PLACE_UNIT[doc.kind] : undefined;
  const placeText = unit ? doc.text || '' : '';
  const termsKey = (hlTerms || []).join('\u0001');
  const places = React.useMemo(() => {
    const sm = /** @type {any} */ (window).VotSearchMini;
    if (!placeText || !sm || typeof sm.morePlaces !== 'function') return [];
    return sm.morePlaces(placeText, hlTerms || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- termsKey is hlTerms by value; the array is rebuilt every render.
  }, [placeText, termsKey]);
  // `memo` names the search: a "more places" list the reader opened is open again on Back.
  const placesKey = doc ? 'places|' + docKey(doc) : '';
  const [placesOpen, setPlacesOpen] = React.useState(() => !!(placesKey && recall(memo, placesKey)));
  const togglePlaces = () => {
    remember(memo, placesKey, !placesOpen);
    setPlacesOpen(!placesOpen);
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
  const refLine = doc.ref || (doc.title || '') + (doc.chapterNum ? ' ' + doc.chapterNum : '');
  // Named items (letters / WTLB / Blessed / Holy-Days / studies) lead with their
  // NAME so a result is identifiable at a glance; verses/headings lead with their
  // reference. The location (ref) becomes a muted sub-line when it isn't the name.
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
  const body = doc.kind === 'heading' ? (doc.heading || doc.text) :
  (doc.kind === 'chapter-title' || doc.kind === 'letter-title' || doc.kind === 'wtlb-title' || doc.kind === 'blessed-title' || doc.kind === 'holy-day-title' || doc.kind === 'answers-title') ?
  (doc.title || doc.text) :
  doc.text;
  const card = (
    <button className="srch-card" onClick={() => onSelect(entry)}>
      <div className="srch-card-top">
        <span className="srch-card-ref">{headline}</span>
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
        <SrchSnippet text={body || ''} terms={hlTerms} />
      </div>
    </button>
  );
  if (!places.length) return card;
  const n = places.length;
  const sm = /** @type {any} */ (window).VotSearchMini;
  // A place is its own tap: `placeStart` rides the entry to the dispatcher, which
  // lands the reader on THAT passage instead of the snippet's (use-search.js).
  return (
    <div className="srch-card-wrap">
      {card}
      <button
        type="button"
        className="srch-places-toggle"
        aria-expanded={placesOpen}
        onClick={togglePlaces}
      >
        <span>{n} more {n === 1 ? 'place' : 'places'} in this {unit}</span>
        <span className={"srch-places-chevron" + (placesOpen ? " open" : "")} aria-hidden="true">▸</span>
      </button>
      {placesOpen ? (
        <ul className="srch-places">
          {places.map((p) => (
            <li key={p.start}>
              <button type="button" className="srch-place" onClick={() => onSelect({ ...entry, placeStart: p.start })}>
                <span className="srch-place-text">
                  {sm.highlightSpans(p.clip, hlTerms || []).map((s, i) =>
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
