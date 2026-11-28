/* ═══════════════════════════════════════════════════════════════════════
   HomeScreen — the READ tab's root (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The layout pass (2026-11-10, mock read.png): the top bar (VOTReader,
   Tabs, the Settings gear; RootNav.jsx; the search field is under it), a search field, the up-next
   card (today's plan rows and Continue; TodayCard.jsx), "Read" with four
   tiles in a 2 x 2 grid and "Explore" with Scripture Web and Surprise me.
   Listening, Songs, the Library, Settings and History left Home for their
   own homes (the Listen and Library tabs, the gear); so did the title block
   and the (i) button (About is in Settings > Help).

   The four tiles keep the reader's saved order (HomeOrderStore; the other
   ids it holds are ignored) and Alt+arrow still moves one. The hold-to-drag
   gesture did not come along: it was built for one column, the grid is two.
   ═══════════════════════════════════════════════════════════════════════ */

import { resetAnswersLanding } from './AnswersHome.jsx';
import { TodayCard, useTodayRows } from '../components/TodayCard.jsx';
import { rootNavStart, RootGear } from '../components/RootNav.jsx';
import { useUnasked } from '../../hooks/use-unasked.js';
import { editionShownLabel, useOfflineEditions } from '../../utils/offline-editions.js';
import { altArrowReorder } from '../../utils/keyboard-reorder.js';
import { historyEntryWords } from '../components/HistoryEntryCard.jsx';

/** The four READ tiles, in their default order. */
export const READ_TILES = Object.freeze(['volumes', 'scriptures', 'answers', 'studies']);

/** localStorage: the reader said "Not now" to the up-next card's reading-plan offer (C8). */
const PLAN_OFFER_KEY = 'vot-plans-offer-hidden';

/** Home's Continue row (and the Library's Recently read): what the newest History row names, in History's own
 *  words (historyEntryWords, visual2-8): the title, then its place, "Words To Live By: Part One, Entry 31" or
 *  "Purity, Part 2". A Bible chapter keeps its short "John 3". @param {any} entry */
export function continueLabel(entry) {
  if (!entry) return null;
  if (entry.type === 'letter' || entry.type === 'study-chapter') {
    if (entry.type === 'letter' ? !entry.letterTitle : !entry.studyTitle) return null;
    const w = historyEntryWords(entry);
    const title = w.title || w.fallback;
    return { title, place: [w.label, w.title ? w.num : null].filter((p) => p && p !== title).join(', ') };
  }
  return entry.bookTitle ? { title: entry.bookTitle + (entry.chapterNum ? ' ' + entry.chapterNum : ''), place: '' } : null;
}

/** Whether ContinueRow draws anything (the card must not draw an empty box around it).
    @param {any} entry @param {any} onContinue @param {any} onStartHere */
const hasContinueRow = (entry, onContinue, onStartHere) => (entry ? !!(onContinue && continueLabel(entry)) : !!onStartHere);

/** The up-next card's last row (TodayCard children): the newest place read, or where to start before any reading.
    @param {{ entry: any, onContinue?: (entry: any) => void, onStartHere?: () => void }} props */
function ContinueRow({ entry, onContinue, onStartHere }) {
  const lab = continueLabel(entry);
  if (lab && onContinue) {
    return (
      <button type="button" className="upnext-row upnext-go upnext-continue" onClick={() => onContinue(entry)}
        aria-label={'Continue: ' + lab.title + (lab.place ? ', ' + lab.place : '')}>
        <span className="upnext-text" aria-hidden="true">
          <span className="upnext-eyebrow">Continue</span>
          <span className="upnext-title">{lab.title}{lab.place ? <span className="upnext-place">{' · ' + lab.place}</span> : null}</span>
        </span>
        <span className="upnext-chev" aria-hidden="true">›</span>
      </button>
    );
  }
  if (entry || !onStartHere) return null;
  return (
    <button type="button" className="upnext-row upnext-go upnext-continue" onClick={onStartHere} aria-label="Start here: Volume One, Letter 1, Chosen by God">
      <span className="upnext-text" aria-hidden="true">
        <span className="upnext-eyebrow">Start here</span>
        <span className="upnext-title">Volume One, Letter 1<span className="upnext-place"> · Chosen by God</span></span>
      </span>
      <span className="upnext-chev" aria-hidden="true">›</span>
    </button>
  );
}

/**
 * The tiles in the reader's saved order: the four READ ids as HomeOrderStore holds them, any it lacks after.
 * @param {any} stored @returns {string[]}
 */
export function readTileOrder(stored) {
  const seen = (Array.isArray(stored) ? stored : []).filter((id) => READ_TILES.includes(id));
  return [...new Set([...seen, ...READ_TILES])];
}

const SEARCH_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
const WEB_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2" /><circle cx="19" cy="7" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6.4l10 .4M6 8l5 8.4M18 9l-5 7.4" /></svg>;
const SHUFFLE_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.7-1.4 3.7-3M14 9.5c.9-1.4 2-2.5 3-2.5h3M18 4l3 3-3 3M18 14l3 3-3 3" /></svg>;

/**
 * @param {{ onSelect: (id: string) => void, onSurprise: () => void, showSurprise?: boolean, onSettings: () => void,
 *   onSearch: () => void, onScriptureWeb?: () => void, historyEnabled?: boolean, searchEnabled?: boolean, history?: any[],
 *   onContinue?: (entry: any) => void, onStartHere?: () => void, translation?: string, readingPlans?: any,
 *   isRead?: any, markAsReadEnabled?: boolean, onPlanRead?: (next: any, planId: string) => void, onPlanListen?: (items: any[], name: string, planId?: string) => void,
 *   onOpenPlan?: (planId: string, opt?: { catchUp?: boolean, manage?: boolean }) => void,
 *   planTracks?: any, onOpenPlans?: () => void, onPlansMoved?: (left: any[]) => void, onEnableMarkAsRead?: () => void }} props
 */
export function HomeScreen({ onSelect, onSurprise, showSurprise, onSettings, onSearch, onScriptureWeb, historyEnabled, searchEnabled, history, onContinue, onStartHere, translation, readingPlans, isRead, markAsReadEnabled, onPlanRead, onPlanListen, planTracks, onOpenPlans, onOpenPlan, onPlansMoved, onEnableMarkAsRead }) {
  // U09.2: the Scriptures tile names the edition the Bible shows ("WEB · NKJV until it downloads").
  useOfflineEditions(translation);
  // rp1: the reader's plans for today and the Continue row, one up-next card under the search field (TodayCard.jsx)
  const todayRows = useTodayRows(readingPlans, isRead, onPlansMoved);
  const newest = Array.isArray(history) ? history[0] || null : null;
  // mw18 C8: with no plan running (and the plans store loaded, so a plan never flashes the offer at boot),
  // the card offers one; × (Not now) hides the offer on this device.
  const [offerHidden, setOfferHidden] = React.useState(() => { try { return localStorage.getItem(PLAN_OFFER_KEY) === '1'; } catch (_e) { return false; } });
  const planStore = /** @type {any} */ (globalThis).ReadingPlanStore;
  const planWanted = !offerHidden && !todayRows.length && !(Array.isArray(readingPlans) && readingPlans.length)
    && !!planStore && (typeof planStore.getState !== 'function' || planStore.getState() === 'loaded');
  // newcomer (2026-11-27): an unasked offer, so it waits for the first finished reading and for a session nothing
  // else has spoken in (utils/unasked.js).
  const offerPlan = useUnasked('plan', planWanted);
  const hideOffer = () => { setOfferHidden(true); try { localStorage.setItem(PLAN_OFFER_KEY, '1'); } catch (_e) { /* private window: hidden for this visit */ } };

  /** @type {Record<string, { eyebrow: string, title: string, detail: string }>} */
  const TILES = {
    volumes: { eyebrow: 'Prophetic Letters', title: 'The Volumes of Truth', detail: '7 volumes · 7 collections' },
    scriptures: { eyebrow: 'The Holy Bible', title: 'The Scriptures of Truth', detail: 'Genesis to Revelation · ' + editionShownLabel(translation) },
    answers: { eyebrow: 'Topics & Doctrines', title: 'Answers Only God Can Give', detail: 'Ask a question' },
    studies: { eyebrow: 'Study Editions', title: 'Studies', detail: 'Matthew Study Bible and more' },
  };
  const [order, setOrder] = React.useState(() => (typeof HomeOrderStore !== 'undefined' ? HomeOrderStore.get() : []));
  const shown = readTileOrder(order);

  // Warm only the destination the reader is approaching. Offline precaching
  // remains the service worker's job; opening Home no longer executes corpora.
  /** @param {string} id */
  const warmDestination = (id) => {
    const w = /** @type {any} */ (window);
    const load = id === 'scriptures' ? w.__loadBibleCorpus
      : id === 'answers' ? w.__loadAnswersCorpus
      : ['volumes', 'studies'].includes(id) ? w.__loadVotCorpus : null;
    if (typeof load === 'function') load().catch((/** @type {any} */ e) => console.warn('Destination pre-load failed', e));
  };
  const [surpriseBusy, setSurpriseBusy] = React.useState(false);
  const [homeStatus, setHomeStatus] = React.useState('');
  const surprisePending = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const openSurprise = async () => {
    if (surprisePending.current) return;
    surprisePending.current = true;
    setSurpriseBusy(true);
    setHomeStatus('Preparing a reading…');
    const w = /** @type {any} */ (window);
    try {
      await Promise.all([
        w.__loadVotCorpus, w.__loadBibleCorpus, w.__loadMatthewCorpus,
        typeof loadBibleStudies === 'function' ? loadBibleStudies : null,
      ].filter((load) => typeof load === 'function').map((load) => load()));
      if (mounted.current) { setHomeStatus(''); onSurprise(); }
    } catch (_e) {
      if (mounted.current) setHomeStatus('Could not prepare a reading. Check your connection and try Surprise me again.');
    } finally {
      surprisePending.current = false;
      if (mounted.current) setSurpriseBusy(false);
    }
  };

  /** @param {string} id */
  const openTile = (id) => {
    // The tile is a fresh visit: the Answers landing forgets a query or an open commandment left from before
    // (Back from a topic keeps them).
    if (id === 'answers') resetAnswersLanding();
    onSelect(id);
  };

  return (
    // No Search icon in Read's bar: the search field is right under it (the hub, 2026-11-10).
    <ScreenLayout root navChildren={rootNavStart({ title: 'VOTReader' })}
      navEnd={<RootGear onSettings={onSettings} />}>
      <div className="root-screen home-root">
        {/* newcomer (walk #77, 2026-11-27): one line saying what the app holds, under the title. Wording cleared by the hub. */}
        <p className="home-holds">The Volumes of Truth and the Bible, to read and to hear.</p>
        {searchEnabled !== false ? (
          <button type="button" className="root-search" onClick={onSearch} aria-label="Search the letters and the Bible">
            {SEARCH_ICON}<span aria-hidden="true">Search the letters and the Bible</span>
          </button>
        ) : null}
        <TodayCard rows={todayRows} markAsReadEnabled={markAsReadEnabled} tracksOf={planTracks}
          onRead={(next, planId) => onPlanRead && onPlanRead(next, planId)} onOpenPlan={onOpenPlan} onListen={(items, planId) => onPlanListen && onPlanListen(items, (todayRows.find((r) => r.id === planId) || { name: '' }).name, planId)}
          onEnableMarkAsRead={onEnableMarkAsRead} onOpenPlans={() => onOpenPlans && onOpenPlans()}
          offerStart={offerPlan} onHideOffer={hideOffer}>
          {/* n131/n352 (A07.2, L1.1, U02.1): the newest place is one tap (Continue), and before any reading the row
              says where to start: the card's last row (the layout pass, 2026-11-10). */}
          {historyEnabled !== false && hasContinueRow(newest, onContinue, onStartHere) ? <ContinueRow entry={newest} onContinue={onContinue} onStartHere={onStartHere} /> : null}
        </TodayCard>

        <h2 className="root-section">Read</h2>
        <div className="root-tiles">
          {shown.map((id, i) => {
            const t = TILES[id];
            return (
              <button key={id} type="button" className="root-tile home-tile" data-tile={id} aria-describedby="home-reorder-hint"
                onClick={() => openTile(id)} onPointerEnter={() => warmDestination(id)} onFocus={() => warmDestination(id)}
                onKeyDown={(e) => {
                  const moved = altArrowReorder(e, order, shown, i);
                  if (!moved) return;
                  if (typeof HomeOrderStore !== 'undefined') HomeOrderStore.set(moved.order);
                  setOrder(moved.order);
                  setHomeStatus(t.title + ' moved ' + (moved.up ? 'earlier.' : 'later.'));
                }}>
                <span className="root-tile-eyebrow">{t.eyebrow}</span>
                <span className="root-tile-title">{t.title}</span>
                <span className="root-tile-detail">{t.detail}</span>
              </button>
            );
          })}
        </div>
        <span id="home-reorder-hint" className="sr-only">Press Alt with an arrow key to move a tile.</span>

        {onScriptureWeb || showSurprise ? (
          <>
            <h2 className="root-section">Explore</h2>
            <div className="root-explore">
              {onScriptureWeb ? <button type="button" className="root-explore-btn" onClick={onScriptureWeb}>{WEB_ICON}<span>Scripture Web</span></button> : null}
              {/* Wave 0 / C2-C [C8]: the visible caption opens the accessible name (label-in-name), and the name says
                  what the button does. */}
              {showSurprise ? (
                <button type="button" className="root-explore-btn surprise-btn" onClick={openSurprise} disabled={surpriseBusy} aria-busy={surpriseBusy}
                  title="Surprise me — open a random chapter or letter" aria-label="Surprise me — open a random chapter or letter">
                  {SHUFFLE_ICON}<span aria-hidden="true">Surprise me</span>
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        <p className="home-status" role="status">{homeStatus}</p>
        {/* newcomer (2026-11-27): the tour is offered once, on the welcome; after that it is Settings' and About's
            "Show me around". Home carries no "New here?" card. */}
      </div>
    </ScreenLayout>
  );
}
