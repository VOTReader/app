/* ═══════════════════════════════════════════════════════════════════════
   SrchTopicCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The topic card above Best Matches for a question (search200 ideas F,
   mockups/F-topic-card/PICK.png): "ANSWERS ONLY GOD CAN GIVE", the topic's
   name, two or three texts it quotes that the search found too (each a tap
   that opens that passage), and "OPEN TOPIC ›". SearchScreen shows it only
   for a pick above the floor (srch-topic.js pickTopic). */

import { cardTerms } from './SrchCard.jsx';

/** Where a quoted text is from: a verse by its reference, a named text by its collection and name
 *  ("Letters from Timothy · Tithing"). @param {any} doc */
export function topicTextRef(doc) {
  if (!doc) return '';
  if (doc.kind === 'verse' || !doc.title) return doc.ref || doc.title || '';
  const where = String(doc.ref || '').split(' · ')[0];
  const cut = doc.kind === 'bible-study' ? doc.title.indexOf(' — ') : -1;
  const name = cut > 0 ? doc.title.slice(cut + 3) : doc.title;
  return where && where !== name ? where + ' · ' + name : name;
}

/**
 * @param {{ topic: { entry: any, texts: Array<{ entry: any, passage: string, own?: boolean }> },
 *   terms: string[], stopTyped?: string[], onSelect: (entry: any) => void }} props
 */
export function SrchTopicCard({ topic, terms, stopTyped = undefined, onSelect }) {
  const sm = /** @type {any} */ (window).VotSearchMini;
  const doc = topic.entry.doc;
  const title = doc.title || 'Answers';
  const spansOf = (/** @type {any} */ e, /** @type {string} */ text) => {
    const hl = cardTerms(e, terms, stopTyped) || [];
    return sm && typeof sm.highlightSpans === 'function' ? sm.highlightSpans(text, hl, terms) : [{ text, hit: false }];
  };
  return (
    <section className="srch-topic" aria-label={'Answers Only God Can Give: ' + title}>
      <div className="srch-topic-eyebrow">Answers Only God Can Give</div>
      <h2 className="srch-topic-title">{title}</h2>
      {topic.texts.length ? (
        <ul className="srch-topic-texts">
          {topic.texts.map((t, i) => (
            <li key={i}>
              <button type="button" className="srch-topic-text" onClick={() => onSelect(t.entry)}>
                <span className="srch-topic-quote">
                  {'“'}
                  {spansOf(t.entry, t.passage).map((/** @type {{text:string, hit:boolean}} */ s, /** @type {number} */ k) =>
                    s.hit ? <mark key={k} className="search-highlight">{s.text}</mark> : <React.Fragment key={k}>{s.text}</React.Fragment>
                  )}
                  {'”'}
                </span>
                <span className="srch-topic-ref">{t.own ? 'In this topic' : topicTextRef(t.entry.doc)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {/* The topic opens at its start (placeStart 0: use-search's landing at the top). */}
      <button type="button" className="srch-topic-open" onClick={() => onSelect({ ...topic.entry, placeStart: 0 })}>
        Open topic <span aria-hidden="true">{'›'}</span>
      </button>
    </section>
  );
}
