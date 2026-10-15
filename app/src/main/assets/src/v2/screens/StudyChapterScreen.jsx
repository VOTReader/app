/* StudyChapterScreen - a Bible study's chapter (pictures 5d and 5f; Back names the study), zones v2p5 to design's dz14.

   main draws a study chapter through its LetterView (BibleStudyChapterView), so v2 reads it through its letter page
   (LetterScreen's `doc`): the same marks, references, footnotes, Listen and read-along, under the chapter's eyebrow
   ("<study> · Chapter n", which may wrap) and title (36 px). The section intro is 5d's: italic, a gold rule at its left,
   its "(An excerpt from ...)" set apart. The text is main's, character for character (marks address main's DOM text).

   Prophecy groups (5f): the group's label, then main's cards in main's order, tinted by kind (Introduction, Old Testament
   amber, New Testament gold, Volumes of Truth blue). An open card shows the prophecy as its heading and its passages; a
   closed one "n passages". Each card opens and closes on its own and is saved as main saves it (ProphecyCardsStore,
   '<chapter>:<block>:<kind>'; none saved = open, main's default), so both apps open the same cards. The paragraphs keep
   main's mark keys (letter:<chapter>:<block>:<kind>:<i>). main's floating Expand / Collapse moves into the ... as
   "Collapse all cards" / "Open all cards" (dz15).

   The ... holds Find in this chapter and the cards item for now; myweb's shared ... (MoreButton) takes it over with
   Auto-scroll and Copy website link when it lands. A Matthew Study Bible chapter waits on design's 5i. A gate boot reads
   its cards from the gate and writes nothing. */
import { Icon } from '../Icon.jsx';
import { LetterBlock } from '../letter-text.jsx';
import { LetterScreen, LetterBookmark } from './LetterScreen.jsx';
import { Sheet } from '../Sheet.jsx';
import { definePlace } from '../places.js';
import { paraKey } from '../marks.js';
import { useStudies } from './StudiesScreen.jsx';
import {
  studyById, chapterOf, chapterEyebrow, chapterNext, groupCards, cardKey, chapterCardKeys, passagesWords, cardOpen, curly,
  MATTHEW_ID,
} from '../studies-facts.js';

const g = /** @type {any} */ (globalThis);

/** "Collapse all cards" / "Open all cards" from the ... reach the chapter on screen (main's expandSignal). */
const allCards = new EventTarget();
const ALL_CARDS = 'all-cards';

/** Whether every card of the chapter on screen is open, by chapter id (the page says; the ... offers the other). It is
 *  the page's own, not the store's: main's store keeps no closed card (setAll drops false), and a gate saves nothing. */
const cardsShown = { all: /** @type {Map<string, boolean>} */ (new Map()), subs: /** @type {Set<() => void>} */ (new Set()) };
/** @param {string} id @param {boolean} open */
function publishAllOpen(id, open) {
  if (cardsShown.all.get(id) === open) return;
  cardsShown.all.set(id, open);
  cardsShown.subs.forEach((f) => f());
}
const subscribeShown = (/** @type {() => void} */ f) => { cardsShown.subs.add(f); return () => { cardsShown.subs.delete(f); }; };

/** The chapter a route names, once main's studies have loaded; null otherwise. @param {any} route */
function chapterFor(route) {
  const s = Array.isArray(g.BIBLE_STUDIES) ? studyById(route.study) : null;
  return s ? { study: s, chapter: chapterOf(s, route.chapter) } : null;
}

/**
 * main's saved card states (ProphecyCardsStore.getAll), live as they change; {} on a gate boot or without the store.
 * @param {boolean} live
 */
function useSavedCards(live) {
  const S = live ? g.ProphecyCardsStore : null;
  const subscribe = React.useCallback((cb) => (S && typeof S.subscribe === 'function' ? S.subscribe(cb) : () => {}), [S]);
  const version = React.useSyncExternalStore(subscribe, () => (S && typeof S.getVersion === 'function' ? S.getVersion() : 0));
  return React.useMemo(() => {
    try { return S && typeof S.getAll === 'function' ? S.getAll() || {} : {}; } catch (_e) { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the store's change signal
  }, [S, version]);
}

/** Saves card states as main does (one at a time, or the chapter's all at once). @param {Record<string, boolean>} changes */
function saveCards(changes) {
  const S = g.ProphecyCardsStore;
  if (!S) return;
  try {
    if (typeof S.setAll === 'function' && typeof S.getAll === 'function') S.setAll({ ...(S.getAll() || {}), ...changes });
    else if (typeof S.setOne === 'function') for (const k of Object.keys(changes)) S.setOne(k, changes[k]);
  } catch (_e) { /* the cards still open and close on the page */ }
}

/** A study's own heading (main's study-heading, level 2 in the text and 3 in cards). @param {{ block: any }} props */
function StudyHeading({ block }) {
  return (block.level || 2) <= 2 ? <h2 className="h2 st-h">{block.text}</h2> : <h3 className="sec-h st-h3">{block.text}</h3>;
}

/**
 * One prophecy card (5f): its kind, then open its prophecy as a heading and its passages, closed "n passages". Its body
 * is drawn only while open; opening it later has main's painter show the marks inside.
 * @param {{ card: { kind: string, tag: string, label: string | null, blocks: any[] }, stem: string, open: boolean,
 *   onToggle: (key: string) => void, live: boolean }} props
 */
function ProphecyCard({ card, stem, open, onToggle, live }) {
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (open && live && typeof g.applyDOMHighlights === 'function') {
      try { g.applyDOMHighlights(); } catch (_e) { /* the next change paints again */ }
    }
  }, [open, live]);
  return (
    <div className={'pcard ' + card.kind + (open ? ' open' : '')}>
      <button type="button" className="pc-h" aria-expanded={open} onClick={() => onToggle(stem)}>
        <span className="pc-tag">{card.tag}</span>
        {!open && <span className="pc-n num">{passagesWords(card.blocks)}</span>}
        <Icon name="chev" />
      </button>
      {open && (
        <div className="pc-b">
          {card.label && <div className="pc-sub">{card.label}</div>}
          {card.blocks.map((b, i) => (b && b.type === 'heading'
            ? <StudyHeading key={i} block={{ ...b, level: b.level || 3 }} />
            : <LetterBlock key={i} block={b} hlKey={'letter:' + stem + ':' + i} />))}
        </div>
      )}
    </div>
  );
}

/**
 * The chapter's blocks: main's LetterView study path (paragraphs and poems as the letter's, headings, prophecy groups,
 * the cover and the study's pictures). Memoised: React never re-renders text main's painter has split.
 * @param {{ chapter: any, states: Record<string, boolean>, onToggle: (key: string) => void, live: boolean }} props
 */
const StudyBody = React.memo(/** @param {{ chapter: any, states: Record<string, boolean>, onToggle: (key: string) => void, live: boolean }} props */
  function StudyBody({ chapter, states, onToggle, live }) {
    return (chapter.blocks || []).map((b, i) => {
      if (!b) return null;
      if (b.type === 'heading') return <StudyHeading key={i} block={b} />;
      if (b.type === 'prophecy-group') {
        return (
          <div key={i} className="pgrp">
            {b.label && <div className="pg-l"><span className="label">{b.label}</span></div>}
            {groupCards(b).map((card) => {
              const stem = cardKey(chapter.id, i, card.kind);
              return <ProphecyCard key={card.kind} card={card} stem={stem} open={cardOpen(states, stem)} onToggle={onToggle} live={live} />;
            })}
          </div>
        );
      }
      if (b.type === 'cover-image' || b.type === 'study-image') {
        return (
          <React.Fragment key={i}>
            <figure className="st-fig"><img src={b.src} alt={b.type === 'cover-image' ? 'Study cover' : b.alt || 'Study diagram'} loading="lazy" /></figure>
            {b.caption && <p className="st-cap" data-hl-key={paraKey(chapter.id, i)} data-hl-dom="true">{b.caption}</p>}
          </React.Fragment>
        );
      }
      return <LetterBlock key={i} block={b} hlKey={paraKey(chapter.id, i)} />;
    });
  });

/**
 * One study chapter (5d / 5f).
 * @param {import('../places.js').PlaceProps} props
 */
export function StudyChapterScreen({ route, gate, go, replace, onReady, desktop, facts }) {
  const matthew = route.study === MATTHEW_ID;
  const { status } = useStudies(matthew);
  const live = !gate;
  const found = status === 'ready' && !matthew ? chapterFor(route) : null;
  const study = found ? found.study : null;
  const chapter = found ? found.chapter : null;
  const saved = useSavedCards(live);
  // a card opened or closed here, until the store says so too (and on a gate boot or without the store, for good)
  const [mine, setMine] = React.useState(/** @type {Record<string, boolean>} */ ({}));
  const gateCards = gate && gate.facts && gate.facts.studies ? gate.facts.studies.cards || null : null;
  const states = React.useMemo(() => ({ ...(gateCards || saved), ...mine }), [gateCards, saved, mine]);
  const statesRef = React.useRef(states);
  statesRef.current = states;
  const onToggle = React.useCallback((/** @type {string} */ key) => {
    const next = !cardOpen(statesRef.current, key);
    setMine((m) => ({ ...m, [key]: next }));
    if (live) saveCards({ [key]: next });
  }, [live]);
  React.useEffect(() => {
    if (!chapter) return undefined;
    const onAll = (/** @type {any} */ e) => {
      if (!e.detail || e.detail.chapter !== chapter.id) return;
      const changes = Object.fromEntries(chapterCardKeys(chapter).map((k) => [k, !!e.detail.open]));
      setMine((m) => ({ ...m, ...changes }));
      if (live) saveCards(changes);
    };
    allCards.addEventListener(ALL_CARDS, onAll);
    return () => allCards.removeEventListener(ALL_CARDS, onAll);
  }, [chapter, live]);
  React.useEffect(() => {
    if (chapter) publishAllOpen(chapter.id, chapterCardKeys(chapter).every((k) => cardOpen(states, k)));
  }, [chapter, states]);
  // the letter page says when its text is on the page; a page with no chapter to show is ready at once
  React.useEffect(() => { if (status !== 'loading' && (matthew || !chapter)) onReady(); }, [status, chapter, matthew, onReady]);

  if (status === 'loading') return null;
  if (matthew) {
    return <div className="page-head g"><h1 className="display">{'Chapter ' + route.chapter}</h1><p className="lede">Not built yet in v2.</p></div>;
  }
  if (!study || !chapter) return <div className="empty"><div className="t">This chapter could not be opened.</div></div>;
  const nx = chapterNext(study, chapter);
  /** @type {import('./LetterScreen.jsx').PageDoc} */
  const doc = {
    letter: chapter,
    volKey: 'study',
    label: study.title,
    eyebrow: chapterEyebrow(study, chapter),
    titleCls: 'display longer',
    study: true,
    body: <StudyBody chapter={chapter} states={states} onToggle={onToggle} live={live} />,
    next: nx ? { k: nx.k, t: nx.t, open: () => (nx.replace ? replace(nx.route) : go(nx.route)) } : null,
    // a gate's chapter says whether it was recorded (5d: none, so no Listen); a real boot asks the player
    recorded: gate && gate.facts && gate.facts.studies && gate.facts.studies.recorded === false ? false : undefined,
  };
  const openNote = (target) => go({ place: 'note', ...target });
  // collection and n name the chapter as a gate's playing does ('study:<id>', its number)
  return <LetterScreen key={study.id + '/' + chapter.id} doc={doc} collection={'study:' + study.id} n={chapter.num} onReady={onReady} gate={gate} desktop={desktop}
    waitDoubleTap={!desktop && !(facts && facts.doubleTapFullscreen === false)} onNote={openNote} facts={facts || {}} onGo={go} />;
}

/**
 * The chapter's ... (for now: Find in this chapter, and the cards). Phone: a sheet titled by the chapter; laptop: the
 * same as a small dialog until the shared ... lands.
 * @param {{ route: any, desktop: boolean, open?: (name: string, opts?: Record<string, any>) => void }} props
 */
function StudyMore({ route, desktop, open }) {
  const [shown, setShown] = React.useState(false);
  const found = chapterFor(route);
  const chapter = found ? found.chapter : null;
  const keys = chapter ? chapterCardKeys(chapter) : [];
  const allOpen = React.useSyncExternalStore(subscribeShown, () => !chapter || cardsShown.all.get(chapter.id) !== false);
  const close = () => setShown(false);
  const row = (icon, t, run) => (
    <button type="button" className="srow act" role="menuitem" onClick={() => { close(); run(); }}>
      <span className="lead"><Icon name={icon} /></span>
      <span className="tx"><span className="t">{t}</span></span>
    </button>
  );
  const allTo = (/** @type {boolean} */ o) => () => {
    if (chapter) allCards.dispatchEvent(new CustomEvent(ALL_CARDS, { detail: { chapter: chapter.id, open: o } }));
  };
  return (
    <>
      <button type="button" className="ic" aria-label="More" aria-haspopup="menu" aria-expanded={shown}
        onClick={() => setShown((v) => !v)}><Icon name="more" /></button>
      {shown && (
        <Sheet kind="mor" label="More" onClose={close} desktop={desktop} scrim="light">
          {chapter && <div className="sh">{curly(chapter.title)}</div>}
          {row('search', 'Find in this chapter', () => open && open('find'))}
          {keys.length > 0 && (allOpen ? row('minus', 'Collapse all cards', allTo(false)) : row('plus', 'Open all cards', allTo(true)))}
          <button type="button" className="textbtn cancel" onClick={close}>Cancel</button>
        </Sheet>
      )}
    </>
  );
}

/**
 * The chapter's top bar: Bookmark (main's 'letter:<chapter>'), Aa, More.
 * @param {{ route: any, gate?: any, desktop: boolean, open?: (name: string, opts?: Record<string, any>) => void }} ctx
 */
function studyChapterActions({ route, gate, open, desktop }) {
  const found = chapterFor(route);
  const chapter = found ? found.chapter : null;
  return (
    <>
      <LetterBookmark route={route} gate={gate} item={chapter} noun="chapter" />
      <button type="button" className="ic" aria-label="Text and theme" onClick={() => open && open('text-and-theme')}><Icon name="aa" /></button>
      <StudyMore route={route} desktop={desktop} open={open} />
    </>
  );
}

definePlace('study-chapter', {
  Screen: StudyChapterScreen,
  // Back on a page above the chapter says its title
  title: (r) => {
    const found = chapterFor(r);
    return found && found.chapter ? curly(found.chapter.title || '') : 'Study';
  },
  actions: studyChapterActions,
  contentClass: 'content reader',
  find: () => 'chapter',
});
