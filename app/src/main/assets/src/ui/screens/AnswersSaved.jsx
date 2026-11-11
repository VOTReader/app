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
import { answersHitSource, answersOpenablePool } from '../../utils/answers-browse.js';
import { answersIndexOf, answersPlainText } from '../../utils/answers-search.js';
import { EmptyState } from '../components/UiParts.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { ActionSheet } from '../components/SelectField.jsx';
import { copyText } from '../../utils/copy-share.js';
import { ANSWERS_MAIN_PAGE_ID } from '../../utils/answers-shelves.js';
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
  const [menu, setMenu] = React.useState(/** @type {any} */ (null));
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const [toRemove, setToRemove] = React.useState(/** @type {any} */ (null));
  const closeRemove = React.useCallback(() => setToRemove(null), []);
  // FA (a-saved): Remove, as the Library's lists do it: a confirm, then the mark goes (and its note with it)
  const remove = (/** @type {any} */ it) => {
    if (typeof AnnotationStore !== 'undefined') AnnotationStore.removeGroup(it.gid);
    if (it.note && typeof NoteStore !== 'undefined') NoteStore.remove(it.gid);
  };
  // FA (a-saved0): the mock's second door, a random passage (the landing's Surprise me)
  const surprise = () => {
    const all = answersOpenablePool(entries, meta);
    if (!all.length) return;
    const at = all[Math.floor(Math.random() * all.length)];
    const t = entries.find((e) => e.id === at.id);
    if (t) onOpenTopic(at.id, t.paragraphs[at.index].text, 'Saved answers');
  };
  const open = (id, it) => {
    const t = entries.find((e) => e.id === id);
    const p = t && t.paragraphs[it.index];
    onOpenTopic(id, p ? p.text : null, 'Saved answers', null, null, it.index);
  };
  return (
    <ScreenLayout className={answersLayoutClass(fontScale, false)}
      navChildren={LibraryNav({ onBack, backLabel: 'Answers', showHome: false, onSettings, onHistory, onSearch, theme, onThemeChange,
        leftExtras: <h1 className="ans-bar-title is-on">Saved answers</h1> })}>
      <div className="ans-page ans-saved-page">
        {/* WA2 (a-saved, a-saved0): one quiet line, then a card per topic; nothing saved: how, and a door */}
        {sum ? <p className="ans-saved-note">{sum + ', in the site’s order. They also sit with your other highlights in the Library.'}</p> : (
          <EmptyState icon="star" title="No saved answers yet" text="Hold a line in any answer and pick a colour. It is kept here and with your highlights."
            action={{ label: 'Open the Main Page', onClick: () => onOpenTopic(ANSWERS_MAIN_PAGE_ID, null, 'Saved answers') }} />
        )}
        {sum ? null : <button type="button" className="ans-textbtn ans-saved-surprise" onClick={surprise}>Surprise me</button>}
        {saved.topics.map((t) => {
          const id = t.entry.id;
          const sections = (meta && meta[id] && meta[id].sections) || null;
          return (
            <section key={id} aria-labelledby={'ans-saved-' + id}>
              <div className="ans-sechead"><h2 className="ans-h2" id={'ans-saved-' + id}><LeadTitle title={t.entry.title} /></h2><span className="ans-count">{t.items.length}</span></div>
              <div className="ans-box">
                {t.items.map((it) => {
                  const src = answersHitSource(t.entry, answersParaSource(itemOf.get(id), it.index, sections), answersPlainText);
                  return (
                    <div key={it.gid} className="ans-saved-row">
                      <button type="button" className="ans-hit" onClick={() => open(id, it)}>
                        <span className="ans-hit-snip">{it.text}</span>
                        {it.note ? <span className="ans-hit-src ans-hit-note">{it.note}</span> : null}
                        {src ? <span className="ans-hit-src">{src}</span> : null}
                      </button>
                      <button type="button" className="ans-saved-menu" aria-haspopup="dialog" aria-label="Saved line options"
                        onClick={() => setMenu({ id, it, title: t.entry.title })}><UiIcon name="more" /></button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <ActionSheet open={!!menu} onClose={closeMenu} title={menu ? menu.it.text : ''} sub={menu ? menu.title : ''}
        actions={menu ? [
          { id: 'open', icon: 'book', label: 'Open in the answer', onSelect: () => { const m = menu; setMenu(null); open(m.id, m.it); } },
          { id: 'copy', icon: 'copy', label: 'Copy the words', onSelect: () => { const m = menu; setMenu(null); copyText('“' + m.it.text + '”'); } },
          { id: 'remove', icon: 'trash', label: 'Remove', danger: true, onSelect: () => { const m = menu; setMenu(null); setToRemove(m.it); } },
        ] : []} />
      <ActionSheet open={!!toRemove} onClose={closeRemove} title="Remove this saved line?"
        sub={toRemove && toRemove.note ? 'Its note goes with it. The words stay in the answer.' : 'The words stay in the answer.'}
        confirm={{ label: 'Remove', danger: true, onConfirm: () => remove(toRemove) }} />
    </ScreenLayout>
  );
}
