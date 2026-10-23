/* ═══════════════════════════════════════════════════════════════════════
   AnswersSaved — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Saved answers (route answers-saved; AOGCG final design O5): the reader's
   highlights and notes in Answers, one section per topic in the site's
   order, each in reading order: the marked words (three lines at most),
   a note's own words under them, then where the words come from (the
   source line that closes the passage, as a search hit names it). A tap
   opens the topic on that paragraph with the pulse; Back returns here.

   It reads AnnotationStore and NoteStore live (useAnswersSaved), so a mark
   made or removed elsewhere is here at once. Everything stays on the
   device: these are the reader's own marks, listed, never sent.
   ═══════════════════════════════════════════════════════════════════════ */

import { answersSavedSum, answersParaSource } from '../../utils/answers-extras.js';
import { answersHitSource } from '../../utils/answers-browse.js';
import { answersIndexOf, answersPlainText } from '../../utils/answers-search.js';
import { LeadTitle, useAnswersMeta, useAnswersSaved, answersLayoutClass } from '../components/AnswersParts.jsx';

/**
 * @param {{ entries: any[], fontScale?: any, onBack: () => void, onSearch?: any, onHistory?: any, onSettings?: any,
 *   theme?: any, onThemeChange?: any, onOpenTopic: Function }} props
 */
export function AnswersSaved({ entries, fontScale, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onOpenTopic }) {
  const meta = useAnswersMeta();
  const saved = useAnswersSaved(entries);
  const sum = answersSavedSum(saved);
  const index = React.useMemo(() => (sum ? answersIndexOf(entries) : []), [entries, sum]);
  const itemOf = React.useMemo(() => new Map(index.map((t) => [t.entry.id, t])), [index]);
  return (
    <ScreenLayout className={answersLayoutClass(fontScale, false)}
      navChildren={LibraryNav({ onBack, backLabel: 'Answers', showHome: true, onSettings, onHistory, onSearch, theme, onThemeChange })}>
      <div className="ans-page">
        <header className="ans-hero">
          <p className="ans-label">Answers Only God Can Give</p>
          <h1 className="ans-display">Saved answers</h1>
          {sum ? <p className="ans-lede">{sum + ', in the site’s order.'}</p> : null}
        </header>
        {sum ? null : <p className="ans-empty">No saved answers yet. Hold your finger on any line to highlight it.</p>}
        {saved.topics.map((t) => {
          const id = t.entry.id;
          const sections = (meta && meta[id] && meta[id].sections) || null;
          return (
            <section key={id} aria-labelledby={'ans-saved-' + id}>
              <div className="ans-sechead"><h2 className="ans-h2" id={'ans-saved-' + id}><LeadTitle title={t.entry.title} /></h2></div>
              {t.items.map((it) => {
                const p = t.entry.paragraphs[it.index];
                const src = answersHitSource(t.entry, answersParaSource(itemOf.get(id), it.index, sections), answersPlainText);
                return (
                  <button key={it.gid} type="button" className="ans-hit"
                    onClick={() => onOpenTopic(id, p ? p.text : null, 'Saved answers', null, null, it.index)}>
                    <span className="ans-hit-snip">{it.text}</span>
                    {it.note ? <span className="ans-hit-src ans-hit-note">{it.note}</span> : null}
                    {src ? <span className="ans-hit-src">{src}</span> : null}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </ScreenLayout>
  );
}
