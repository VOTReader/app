/* ═══════════════════════════════════════════════════════════════════════
   DailyPassage — Home's passage for the day (n173)
   ═══════════════════════════════════════════════════════════════════════
   The same words all day for everyone: the Answer of the day (Answers'
   own date-seeded pick, utils/answers-browse.js answersDailyPick over the
   pool AnswersHome builds), quoted word for word from the letters, with
   its source. A tap opens the passage where it sits on its topic page.

   Home never waits for it. The Answers corpus is not on the page at boot,
   so the passage shows once it is: at once when the reader has already
   opened Answers, or after Home has settled, when reading the corpus costs
   only its parse (the APK's own assets, or the service worker's copy on
   the web). A device that would have to download it shows nothing.
   ═══════════════════════════════════════════════════════════════════════ */

import { answersDailyPick, answersInlinePieces, answersSourceParts } from '../../utils/answers-browse.js';
import { loadAnswers, loadAnswersMeta } from '../../utils/sync-loaders.js';
import { onIdle } from '../../utils/on-idle.js';
import { dailyPoolOf } from '../screens/AnswersHome.jsx';
import { useNow } from './TodayCard.jsx';

/** How long Home settles before the corpus is read (ms): clear of first paint and the first taps. */
export const DAILY_SETTLE_MS = 3000;

function _sources() {
  const entries = typeof ANSWERS !== 'undefined' ? ANSWERS : null;
  const meta = /** @type {any} */ (window).ANSWERS_META || null;
  return entries && meta ? { entries, meta } : null;
}

/** True when the corpus can be read without a download: the APK's assets, or the worker's cache holds both files. */
async function _onDevice() {
  if (typeof PlatformBridge !== 'undefined' && PlatformBridge && PlatformBridge.isAndroid) return true;
  if (typeof caches === 'undefined' || typeof caches.match !== 'function') return false;
  try {
    return !!(await caches.match('src/data/answers.js')) && !!(await caches.match('src/data/answers-meta.js'));
  } catch (_e) {
    return false;
  }
}

/**
 * @typedef {{ id: string, anchor: string, quote: string[], title: string, collection: string }} DailyPick
 */

/**
 * Today's passage, or null until the corpus is on the page.
 * @returns {DailyPick | null}
 */
export function useDailyPassage() {
  const now = useNow();
  const [, setLanded] = React.useState(0);
  const corpus = /** @type {any} */ (window).__answersCorpus;
  React.useSyncExternalStore(
    React.useCallback((cb) => (corpus ? corpus.subscribe(cb) : () => {}), [corpus]),
    () => (corpus ? corpus.getVersion() : 0),
  );
  const ready = !!_sources();
  React.useEffect(() => {
    if (ready) return undefined;
    let live = true;
    let cancelIdle = () => {};
    const t = setTimeout(() => {
      void _onDevice().then((ok) => {
        if (!live || !ok) return;
        cancelIdle = onIdle(() => {
          void Promise.all([loadAnswers(), loadAnswersMeta()]).then(() => { if (live) setLanded((n) => n + 1); });
        }, { timeout: 4000, fallbackDelay: 0 });
      });
    }, DAILY_SETTLE_MS);
    return () => { live = false; clearTimeout(t); cancelIdle(); };
  }, [ready]);

  const src = _sources();
  const day = now.getFullYear() * 1000 + now.getMonth() * 40 + now.getDate();
  return React.useMemo(() => {
    if (!src) return null;
    const pick = answersDailyPick(dailyPoolOf(src.entries, src.meta), now);
    const entry = pick ? src.entries.find((/** @type {any} */ e) => e && e.id === pick.id) : null;
    if (!pick || !entry) return null;
    const P = entry.paragraphs || [];
    const parts = answersSourceParts(P[pick.attr] && P[pick.attr].text);
    return {
      id: pick.id,
      anchor: P[pick.quote[0]].text,
      quote: pick.quote.map((/** @type {number} */ i) => P[i].text),
      title: parts ? parts.title.replace(/^[“"]|[”"]$/g, '') : '',
      collection: parts ? parts.collection : '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` stands for `now`: a new Date each wake must not rebuild
  }, [src && src.entries, src && src.meta, day]);
}

/** A quote paragraph with its marks (bold, italic, breaks). The "(Joel 3:15)" cites the topic page draws are left
    to it: on Home they would crowd the words. @param {{ text: string }} props */
function Inline({ text }) {
  return (
    <>
      {answersInlinePieces(String(text || '').replace(/\s*\{\{ref:[^}]*\}\}/g, '')).map((p, i) => {
        if (p.br) return <br key={i} />;
        const t = p.i ? <em>{p.t}</em> : p.t;
        return p.b ? <strong key={i}>{t}</strong> : <React.Fragment key={i}>{t}</React.Fragment>;
      })}
    </>
  );
}

/** "Volume 1" → "Volume One", as Home names the Volumes. @param {string} c */
function volumeName(c) {
  const m = /^Volume (\d)$/.exec(c);
  return m ? 'Volume ' + ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][Number(m[1])] : c;
}

/**
 * Built to the Codex mockup lanes/myweb/out/id1/F/mockup/board-r1.png (D): a quiet centred quote under the
 * title's ornament, no box, the source under it; six lines at most, the whole passage a tap away.
 * @param {{ pick: DailyPick | null, onOpen?: (id: string, anchor: string) => void }} props
 */
export function DailyPassage({ pick, onOpen }) {
  if (!pick || !onOpen) return null;
  const where = [pick.title ? '“' + pick.title + '”' : '', volumeName(pick.collection)].filter(Boolean);
  return (
    <button type="button" className="home-daily" onClick={() => onOpen(pick.id, pick.anchor)}>
      <span className="sr-only">Answer of the day: </span>
      <span className="home-daily-quote">
        {pick.quote.map((q, i) => (i ? <React.Fragment key={i}>{' '}<Inline text={q} /></React.Fragment> : <Inline key={i} text={q} />))}
      </span>
      {where.length ? <span className="home-daily-src">{'From ' + where.join(' · ')}<span aria-hidden="true">{' ›'}</span></span> : null}
    </button>
  );
}
