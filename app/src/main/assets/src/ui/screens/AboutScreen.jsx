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

/* WS3 settings (ab-about, ab-credits): About reached from Settings is a page of rows, with Credits and privacy and
   What you can do as pages of their own. The first run keeps the two-page welcome below (fr-1, fr-2 are next). */
function AboutHome({ onBack, onYourData }) {
  const [page, setPage] = React.useState('about');
  const [buildInfo, refresh] = useBuildInfo();
  const v = versionWords(buildInfo);
  const tour = typeof TourController !== 'undefined' ? TourController : null;
  const title = page === 'credits' ? 'Credits and privacy' : page === 'features' ? 'What you can do' : 'About VOTReader';
  const back = page === 'about' ? onBack : () => setPage('about');
  const points = (list) => (
    <div className="ui-group">{list.map((t) => <div key={t} className="ws3-check-row"><UiIcon name="check" size="sm" /><span>{t}</span></div>)}</div>
  );
  const makers = songMakers();
  return (
    <ScreenLayout utility={{ title, onBack: back, backLabel: page === 'about' ? 'Back' : 'Back to About VOTReader' }}>
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
                <UiButton small className="ws2-pill-btn" disabled={buildInfo.state === 'loading'} onClick={() => { void refresh(); }}>Check for updates</UiButton>
              </div>
              <ListRow noLead title="What’s new" onClick={() => { void openWhatsNew(); }} />
              <ListRow noLead title="What you can do" onClick={() => setPage('features')} />
              {tour ? <ListRow noLead title="Show me around" meta={tourMeta()} onClick={() => tour.start('settings')} /> : null}
              <ListRow noLead title="Credits and privacy" onClick={() => setPage('credits')} />
            </div>
            {v.build ? <p className="ws3-about-build">{v.build}</p> : null}
          </>
        ) : page === 'credits' ? (
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
        ) : (
          <>
            <SectionLabel>The library</SectionLabel>
            {points(LIBRARY_POINTS)}
            <SectionLabel>Your tools</SectionLabel>
            {points(TOOL_POINTS)}
          </>
        )}
      </div>
    </ScreenLayout>
  );
}

export function AboutScreen({ onContinue, onBack, onSearch, onHistory, theme, onThemeChange, firstRun = true, onYourData = null }) {
  const [page, setPage] = React.useState(1);
  useSongCatalog();
  if (!firstRun) return <AboutHome onBack={onBack} onYourData={onYourData} />;

  const handleBack     = page === 2 ? () => setPage(1) : onBack;
  const handleContinue = page === 1 ? () => setPage(2) : onContinue;

  return (
    <ScreenLayout
      navChildren={LibraryNav({
        // handleBack is page-aware: page 2 → page 1, page 1 → leave.
        onBack: handleBack, backTitle: 'Back', hide: ['settings'],
        onHistory, onSearch, theme, onThemeChange,
      })}
    >
      <div className="about-screen">
        <div className="about-card">
          <div className="about-diamonds" aria-hidden="true">
            <span className="about-diamond" />
            <span className="about-diamond" />
            <span className="about-diamond" />
          </div>
          <div key={page} className="about-page-in">
            {page === 1 ? (
              <>
                <h1 className="about-heading">About VOTReader</h1>
                <div className="about-body">
                  <p>The Volumes of Truth are the Word of The Lord, given through His servant Timothy.</p>
                  <p>This reader was made by a disciple for personal study; it is not the canonical source.</p>
                  <p>Your notes, journal, and highlights stay on this device — use Settings → Your data → Export to back them up.</p>
                  <p>
                    For the canonical text, audio, video, and PDFs, visit{" "}
                    <a href="https://www.thevolumesoftruth.com" target="_blank" rel="noopener noreferrer"><em>thevolumesoftruth.com</em></a>
                    .
                  </p>
                </div>
                {/* Credits and the privacy policy fold under one line (A08.6 / U02.3): page one is what the reader
                    needs first; the credits stay on this page, one tap away, and stay in the DOM for the tests. */}
                <details className="about-credits">
                  <summary>Credits &amp; privacy</summary>
                  <div className="about-body">
                  {/* CC-BY obligation for the Scripture Web's cross-reference
                      dataset. The web carries it too since Q5 (w3, 2026-10-18): the
                      legend's tail, the panel's footer and the guide's footer, never
                      a line of its own on the canvas (that one printed over the book
                      labels in landscape, 2026-09-11). This is the app's own credits
                      page; keep the line (AboutScreen.test.jsx pins it). */}
                  <p className="about-credit">
                    Cross-reference data from{" "}
                    <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener noreferrer"><em>OpenBible.info</em></a>
                    , used under CC-BY.
                  </p>
                  {/* Songs of the Letters (L8): the credit the songs owe. The makers are the consented credits the
                      catalog itself publishes (never an email), most songs first; none are named before it loads. */}
                  <p className="about-credit about-songs-credit">
                    AI Songs of the Letters: songs made by members of the flock with Suno (suno.com), from the words of The Volumes of Truth. Shared freely, never sold.
                    {songMakers().length ? ' With songs by ' + songMakers().join(', ') + ', and others of the flock.' : null}
                  </p>
                  {/* pp1: the public privacy policy (the page Google Play links to). */}
                  <p className="about-credit">
                    <a href="https://votreader.github.io/app/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a>
                    : no accounts, and nothing you write leaves this device.
                  </p>
                  </div>
                </details>
              </>
            ) : (
              <>
                <h1 className="about-heading">What You Can Do</h1>
                <div className="about-body about-features">
                  <p className="about-subhead">The Library</p>
                  <p>Every volume and letter of The Volumes of Truth.</p>
                  <p>The entire Bible in eleven translations, including two custom Restored Name editions and the Spanish Reina-Valera 1960.</p>
                  <p>Every PDF, Bible study, and letter study.</p>
                  <p>A Listening Library — the Letters and the Bible, read aloud.</p>
                  <p className="about-subhead">Your Tools</p>
                  <p>Highlight, underline, bookmark, and note — anywhere.</p>
                  <p>A private journal with photos and voice memos, kept on your device.</p>
                  <p>Full-text search across the entire library.</p>
                  <p>Reading plans: the Bible in a year, the letters, or any mix you build, a few minutes a day at your own pace.</p>
                  {/* B1 (2026-08-10): this line claimed "nothing is downloaded
                      except the Garden images", which stopped being true the
                      day audio shipped — every Listen streams an MP3. The
                      privacy promise it was really making (nothing of YOURS
                      leaves) is unchanged and stays; the download claim is now
                      the truth. */}
                  <p>Reading works offline. Listen streams each recording and the <em>Return to the Garden</em> images load as you view them, so both need a connection unless saved: download a recording and it plays with no connection. Your notes, highlights and journal never leave this device.</p>
                </div>
              </>
            )}
          </div>
          {/* a live region with a role: aria-label on a bare div is prohibited
              (Lighthouse a11y on the live PWA, 2026-09-22: aria-prohibited-attr) */}
          <div className="about-page-dots" role="status" aria-label={`Page ${page} of 2`}>
            <span className={`about-page-dot${page === 1 ? ' active' : ''}`} />
            <span className={`about-page-dot${page === 2 ? ' active' : ''}`} />
          </div>
          <div className="about-diamonds" aria-hidden="true">
            <span className="about-diamond" />
            <span className="about-diamond" />
            <span className="about-diamond" />
          </div>
          {/* Wave 0: the FINAL page of first-run onboarding ends with a
              warm, action-oriented CTA ("Begin Reading") instead of the
              flat "Continue"; page 1 keeps "Continue" because it genuinely
              continues to page 2. */}
          <button
            className="about-continue"
            onClick={handleContinue}
            aria-label={page === 2 ? 'Begin Reading' : 'Continue'}
          >{page === 2 ? 'Begin Reading' : 'Continue'}</button>
        </div>
      </div>
    </ScreenLayout>
  );
}
