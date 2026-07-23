/* ═══════════════════════════════════════════════════════════════════════
   SrchCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { translationLabel } from '../../data/translations.js';

export function SrchCard({ entry, terms, onSelect, isDirect }) {
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
  const doc = entry.doc;
  const meta = SRCH_KIND_LABEL[doc.kind] || { label: doc.kind, cls: '' };
  const refLine = doc.ref || (doc.title || '') + (doc.chapterNum ? ' ' + doc.chapterNum : '');
  // Named items (letters / WTLB / Blessed / Holy-Days / studies) lead with their
  // NAME so a result is identifiable at a glance; verses/headings lead with their
  // reference. The location (ref) becomes a muted sub-line when it isn't the name.
  const named = doc.kind !== 'verse' && doc.kind !== 'heading' && doc.kind !== 'chapter-title' && !!doc.title;
  const headline = named ? doc.title : refLine;
  const locLine = (named && refLine && refLine !== doc.title) ? refLine : '';
  const body = doc.kind === 'heading' ? (doc.heading || doc.text) :
  (doc.kind === 'chapter-title' || doc.kind === 'letter-title' || doc.kind === 'wtlb-title' || doc.kind === 'blessed-title' || doc.kind === 'holy-day-title') ?
  (doc.title || doc.text) :
  doc.text;
  // Merge the engine's per-result matched terms (MiniSearch only — the
  // doc-side words a fuzzy/prefix search actually hit, e.g. typed "sheperd"
  // matched "shepherd") into the query-level term list, so a typo-corrected
  // match still gets its <mark> in the snippet. Classic results carry no
  // entry.terms and pass through unchanged.
  const hlTerms = (entry.terms && entry.terms.length)
    ? (terms || []).concat(entry.terms.filter((t) => (terms || []).indexOf(t) < 0))
    : terms;
  return (
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

}
