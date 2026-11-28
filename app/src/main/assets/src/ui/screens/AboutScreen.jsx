/* ═══════════════════════════════════════════════════════════════════════
   AboutScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Eager on purpose, and it must stay that way: use-tabs.js opens a fresh
   install ON this screen (screen = !AboutSeenFlagStore.is() ? 'about' :
   'home'), so a lazy About would put a bundle fetch in front of the very
   first paint a new reader ever sees. Landing 23 tried it and the browser
   look caught it.
   ═══════════════════════════════════════════════════════════════════════ */

/** The credited song makers in the loaded catalog, most songs first; [] before it loads. @returns {string[]} */
export function songMakers() {
  const cat = typeof SongCatalog !== 'undefined' && SongCatalog.loaded ? SongCatalog : null;
  if (!cat) return [];
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const s of cat.songs()) if (s.cr && !s.hid) count.set(s.cr, (count.get(s.cr) || 0) + 1);
  return Array.from(count.keys()).sort((a, b) => count.get(b) - count.get(a));
}

/** Re-render About when the song catalog lands, and ask for it once About has painted (s18.4): a fresh install opens
    here, before Home asks for it (the same once-per-launch fetch, HomeScreen's useSongCatalogCount). */
function useSongCatalog() {
  const cat = typeof SongCatalog !== 'undefined' ? SongCatalog : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (cat ? cat.subscribe(cb) : () => {}), [cat]),
    () => (cat ? cat.getVersion() : 0)
  );
  React.useEffect(() => {
    if (!cat || cat.loaded) return undefined;
    const t = setTimeout(() => { if (!cat.loaded) void cat.load(); }, 1500);
    return () => clearTimeout(t);
  }, [cat]);
}

import { ListRow, SectionLabel, UiButton } from '../components/UiParts.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { useBuildInfo, versionWords, LinkRow, tourMeta } from '../components/about-parts.jsx';
import { openWhatsNew } from '../../utils/whats-new.js';
import { markFirstRunSession } from '../../utils/unasked.js';

const LIBRARY_POINTS = [
  'Every volume and letter of The Volumes of Truth.',
  'The entire Bible in eleven translations, including two custom Restored Name editions and the Spanish Reina-Valera 1960.',
  'Every PDF, Bible study, and letter study.',
  'The Letters and the Bible, read aloud.',
];
const TOOL_POINTS = [
  'Highlight, underline, bookmark, and note, anywhere.',
  'A private journal with photos and voice memos, kept on your device.',
  'Full-text search across the entire library.',
  'Reading plans: the Bible in a year, the letters, or any mix you build.',
  'Reading works offline. Listening needs a connection unless you download it. Your notes never leave this device.',
];

/** Credits and privacy (ab-credits): privacy first. Shared by About and the first run's Credits and privacy page.
    @param {{ makers: string[] }} props */
function CreditsBody({ makers }) {
  return (
    <>
      {/* Privacy first (ab-credits); pp1: the public privacy policy (the page Google Play links to). */}
      <SectionLabel>Privacy</SectionLabel>
      <div className="ui-card ws3-credit">
        <p className="ws3-credit-title">No accounts, and nothing you write leaves this device.</p>
        <p className="ws3-credit-text">Listen streams each recording, and the Garden images load as you view them, unless you saved them to this phone.</p>
        <p className="ws3-credit-text"><a className="ws3-credit-link" href="https://votreader.github.io/app/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a></p>
      </div>
      {/* CC-BY obligation for the Scripture Web's cross-reference dataset (AboutScreen.test.jsx pins the first-run copy). */}
      <SectionLabel>Scripture cross-references</SectionLabel>
      <div className="ui-card ws3-credit about-credit">
        <p className="ws3-credit-title"><a className="ws3-credit-link" href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener noreferrer">OpenBible.info</a></p>
        <p className="ws3-credit-text">Cross-reference data, used under CC-BY.</p>
      </div>
      {/* Songs of the Letters (L8): the consented credits the catalog publishes (never an email), most songs first. */}
      <SectionLabel>Songs of the Letters</SectionLabel>
      <div className="ui-card ws3-credit about-songs-credit">
        <p className="ws3-credit-title">Sung by the flock</p>
        <p className="ws3-credit-text">AI songs made by members of the flock with Suno (suno.com), from the words of The Volumes of Truth. Shared freely, never sold.</p>
        {makers.length ? <p className="ws3-credit-text">With songs by {makers.join(', ')}, and others of the flock.</p> : null}
      </div>
      <SectionLabel>Bible editions</SectionLabel>
      <div className="ui-card ws3-credit">
        <p className="ws3-credit-title">The Restored Name editions</p>
        <p className="ws3-credit-text">NKJV-R and KJV-R were prepared with AI assistance and machine-checked against the Greek.</p>
      </div>
    </>
  );
}

/** The phone's Back pops an inner page before it leaves the screen (window.__screenBack, read by
    hooks/use-android-back.js; a sheet on top is the modal registry's and closes first). @param {null | (() => void)} up */
function useInnerBack(up) {
  React.useEffect(() => {
    if (!up) return undefined;
    const fn = () => { up(); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  });
}

/* WS3 settings (ab-about, ab-credits): About reached from Settings is a page of rows, with Credits and privacy and
   What you can do as pages of their own. The first run is the one-page welcome below. */
function AboutHome({ onBack, onYourData }) {
  const [page, setPage] = React.useState('about');
  const [buildInfo, refresh] = useBuildInfo();
  const v = versionWords(buildInfo);
  const tour = typeof TourController !== 'undefined' ? TourController : null;
  const tourMins = tour && typeof tour.minutesWord === 'function' ? minutesOf(tour.minutesWord()) : -1;
  const title = page === 'credits' ? 'Credits and privacy' : page === 'features' ? 'What you can do' : 'About VOTReader';
  const back = page === 'about' ? onBack : () => setPage('about');
  useInnerBack(page === 'about' ? null : back);
  const points = (list) => (
    <div className="ui-group">{list.map((t) => <div key={t} className="ws3-check-row"><UiIcon name="check" size="sm" /><span>{t}</span></div>)}</div>
  );
  const makers = songMakers();
  return (
    <ScreenLayout hideTabsBtn utility={{ title, onBack: back, backLabel: page === 'about' ? 'Back' : 'Back to About VOTReader' }}>
      <div className="ws3-about" key={page}>
        {page === 'about' ? (
          <>
            <p className="ws3-about-lead">The Volumes of Truth are the Word of The Lord, given through His servant Timothy.</p>
            <p className="ws3-about-line">This reader was made by a disciple for personal study; it is not the canonical source.</p>
            <div className="ui-group">
              <LinkRow href="https://www.thevolumesoftruth.com" icon="out" title="thevolumesoftruth.com" meta="The canonical text, audio, video and PDFs" />
              {typeof onYourData === 'function' ? (
                <ListRow icon="data" title="Your notes stay on this phone" meta="Notes, journal and highlights. Back them up in Your data." onClick={onYourData} />
              ) : null}
            </div>
            <SectionLabel>This app</SectionLabel>
            <div className="ui-group">
              <div className="ui-row no-lead ws3-version">
                <span className="ui-row-text">
                  <span className="ui-row-title">{v.title}</span>
                  <span className="ui-row-meta" role="status">{v.line}</span>
                </span>
                <UiButton small className="ws2-pill-btn" disabled={buildInfo.state === 'loading'} onClick={() => { void refresh(true); }}>Check for updates</UiButton>
              </div>
              <ListRow noLead title="What’s new" onClick={() => { void openWhatsNew(); }} />
              <ListRow noLead title="What you can do" onClick={() => setPage('features')} />
              {/* FSET (ab-about): the length at the right, "3 min", as the mock draws it. */}
              {tour ? <ListRow noLead title="Show me around" ariaLabel={'Show me around. ' + tourMeta()}
                value={tourMins > 0 ? tourMins + ' min' : null} onClick={() => tour.start('settings')} /> : null}
              <ListRow noLead title="Credits and privacy" onClick={() => setPage('credits')} />
            </div>
            {v.build ? <p className="ws3-about-build">{v.build}</p> : null}
          </>
        ) : page === 'credits' ? (
          <CreditsBody makers={makers} />
        ) : (
          <>
            <SectionLabel>The library</SectionLabel>
            {points(LIBRARY_POINTS)}
            <SectionLabel>Your tools</SectionLabel>
            {points(TOOL_POINTS)}
            <p className="ws3-about-line"><b>{WELCOME_KEEP[0]}</b> {WELCOME_KEEP[1]}</p>
          </>
        )}
      </div>
    </ScreenLayout>
  );
}

/** "three" -> 3, for the tour button's short "· 3 min". @param {string} w */
const minutesOf = (w) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].indexOf(String(w || '').toLowerCase());

/* The first run's points (fr-1). newcomer (2026-11-27, mock 3-first-run-B, cleared by the hub): the welcome is one
   page, and the two points that keep the app from passing for the official source stay on it, word for word. The
   third, "Yours stays yours", moved to About's What you can do with its words unchanged (WELCOME_KEEP below). */
const WELCOME_POINTS = [
  ['pen', 'Made for personal study.', 'This reader was made by a disciple; it is not the canonical source.'],
  ['out', 'The source.', 'For the canonical text, audio, video, and PDFs, visit thevolumesoftruth.com.'],
];
const WELCOME_KEEP = ['Yours stays yours.', 'Your notes, journal, and highlights stay on this device. Back them up from Settings › Your data.'];
/* What the app holds, in one line, from LIBRARY_POINTS (newcomer; the hub cleared the wording 2026-11-27). */
const WELCOME_HOLDS = 'Every letter of The Volumes of Truth, the whole Bible in eleven translations, the studies, and the Letters and the Bible read aloud.';

/**
 * The first run: one page (newcomer, Corbin 2026-11-27: "Make sure new users aren't bombarded with info, only what is
 * essential to use the app"). What the app is, what it holds, the two source points, Begin reading, and the tour as a
 * quiet link: the one place the tour is offered unasked. The nine "What you can do" lines live in About.
 * @param {{ onContinue: () => void, onBack: () => void, firstRun?: boolean, onYourData?: (() => void) | null, onTour?: (() => void) | null }} props
 */
export function AboutScreen({ onContinue, onBack, firstRun = true, onYourData = null, onTour = null }) {
  const [page, setPage] = React.useState(/** @type {number | string} */ (1));
  useSongCatalog();
  // The welcome ran in this session: nothing unasked follows it until the next one (utils/unasked.js).
  React.useEffect(() => { if (firstRun) markFirstRunSession(); }, [firstRun]);
  // Back on Credits returns to the welcome, the phone's Back too.
  useInnerBack(firstRun && page !== 1 ? () => setPage(1) : null);
  if (!firstRun) return <AboutHome onBack={onBack} onYourData={onYourData} />;
  const tour = typeof TourController !== 'undefined' ? TourController : null;
  const mins = tour && typeof tour.minutesWord === 'function' ? minutesOf(tour.minutesWord()) : -1;
  if (page === 'credits') {
    return (
      <ScreenLayout utility={{ title: 'Credits and privacy', onBack: () => setPage(1), backLabel: 'Back to Welcome' }} hideTabsBtn>
        <div className="ws3-about"><CreditsBody makers={songMakers()} /></div>
      </ScreenLayout>
    );
  }
  return (
    <ScreenLayout utility={null} hideTabsBtn>
      <div className="ws4-fr is-page-1">
        <div className="ws4-fr-top">
          <div className="ws4-fr-orn" aria-hidden="true">◆</div>
          <p className="ui-label ws4-fr-kicker">Welcome to</p>
          <h1 className="ws4-fr-name">VOTReader</h1>
          <p className="ws4-fr-lead">The Volumes of Truth are the Word of The Lord, given through His servant Timothy.</p>
          <p className="ws4-fr-holds">{WELCOME_HOLDS}</p>
        </div>
        <div className="ws4-fr-points">
          {WELCOME_POINTS.map(([icon, head, text]) => (
            <div key={icon} className="ws4-fr-point">
              <span className="ui-row-lead" aria-hidden="true"><UiIcon name={icon} /></span>
              <p><b>{head}</b> {text}</p>
            </div>
          ))}
        </div>
        <div className="ws4-fr-foot">
          {/* The e2e walks and tools/first-run.mjs find this button by its name "Begin Reading" (21 tools). */}
          <UiButton kind="primary" wide ariaLabel="Begin Reading" onClick={onContinue}>Begin reading</UiButton>
          {typeof onTour === 'function' ? (
            <UiButton kind="text" wide onClick={onTour}>{'Show me around first' + (mins > 0 ? ' · ' + mins + ' min' : '')}</UiButton>
          ) : null}
          <UiButton kind="text" wide onClick={() => setPage('credits')}>Credits and privacy</UiButton>
        </div>
      </div>
    </ScreenLayout>
  );
}
