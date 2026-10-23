/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersShelf — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   One shelf of the site's contents (route answers-group, letterId = the
   key; AOGCG final design f04, f04b):

     '1'..'12'  a numbered "Thus Says The Lord..." group: the site's label
                word for word as its eyebrow (C13), our short name as the
                title, and the line that says the short names are ours
     'other'    Other Topics, its page outside the site's menu last

   The topics run in the site's order, never by size (U2). "Read all N in
   order" opens the first one not read yet; the topic's Next then walks the
   site's chain.
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { NBSP, SEP, pl, answersRowSub, answersShelfByKey, ANSWERS_OTHER_LABEL } from '../../utils/answers-browse.js';
import { ANSWERS_GROUP_NOTE, ANSWERS_NOT_IN_MENU } from '../../utils/answers-site.js';
import { AnsRow, Chev, LeadTitle, ReadMark, useAnswersMeta, answersLayoutClass } from '../components/AnswersParts.jsx';

/**
 * @param {{ entries: any[], groupKey: string, isRead?: (id: string) => boolean, pathOn?: boolean, fontScale?: any,
 *   onBack: () => void, onSearch?: any, onHistory?: any, onSettings?: any, theme?: any, onThemeChange?: any,
 *   onOpenTopic: Function }} props
 */
export function AnswersShelf({ entries, groupKey, isRead: isReadRaw, pathOn = true, fontScale, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onOpenTopic }) {
  const meta = useAnswersMeta();
  const found = answersShelfByKey(entries, groupKey);
  const isRead = (id) => !!(pathOn && isReadRaw && isReadRaw(id));
  const shelf = found ? found.shelf : null;
  const topics = found ? found.topics : [];
  const isGroup = !!(shelf && shelf.kind === 'tstl');
  const title = isGroup ? shelf.short : ANSWERS_OTHER_LABEL;
  const read = topics.filter((e) => isRead(e.id)).length;
  const first = topics.find((e) => !isRead(e.id));
  const start = read && first ? first : topics[0];
  const notInMenu = new Set(shelf && shelf.notInMenu ? shelf.notInMenu.map((e) => e.id) : []);
  return (
    <ScreenLayout className={answersLayoutClass(fontScale, false)}
      navChildren={LibraryNav({ onBack, backLabel: 'Answers', showHome: true, onSettings, onHistory, onSearch, theme, onThemeChange })}>
      <div className="ans-page">
        <header className="ans-hero">
          {isGroup ? <p className="ans-label">{shelf.label}</p> : null}
          <h1 className="ans-display">{title}</h1>
          {isGroup ? <p className="ans-meta ans-note">{ANSWERS_GROUP_NOTE}</p> : null}
        </header>
        {topics.length ? (
          <div className="ans-results-sum">
            <span className="ans-count">{pl(topics.length, 'topic') + (read ? SEP + read + NBSP + 'read' : '')}</span>
            <button type="button" className="ans-textbtn" onClick={() => onOpenTopic(start.id, null, title)}>{`Read all ${topics.length} in order`}<Chev /></button>
          </div>
        ) : null}
        {topics.map((e) => (
          <AnsRow key={e.id} title={<LeadTitle title={e.title} />}
            sub={<>{answersRowSub(e, meta && meta[e.id])}{notInMenu.has(e.id) ? <>{SEP}<em>{ANSWERS_NOT_IN_MENU}</em></> : null}{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</>}
            onClick={() => onOpenTopic(e.id, null, title)} />
        ))}
      </div>
    </ScreenLayout>
  );
}
