/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersMedia — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Charts & videos (route answers-media; AOGCG final design f13): every
   chart, video, playlist, channel, audio recording, PDF and download the
   site's pages carry (C3), from the sidecars, in the site's order, each
   with the topic it sits on. A chart opens the zoom viewer here (its image
   ships with the app, so it works offline); everything else is a link that
   opens outside the app. Nothing is embedded and no thumbnail is fetched.
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { answersShortTitle } from '../../utils/answers-shelves.js';
import {
  SEP, pl, answersMediaIndex, answersMediaPlace, answersMediaTitle, answersMediaLines, answersMediaSub, answersDomain,
} from '../../utils/answers-browse.js';
import { AnsIcon, Chev, useAnswersMetaState, answersLayoutClass } from '../components/AnswersParts.jsx';
import { ChartViewer, AboutSheet } from '../sheets/AnswersSheets.jsx';

/** A sub with soft breaks after its slashes, so a channel's long address wraps at a slash. */
function slashBreaks(s) {
  const parts = String(s).split('/');
  return parts.flatMap((p, i) => (i ? [<React.Fragment key={'s' + i}>/<wbr /></React.Fragment>, p] : [p]));
}

const DISC = { video: 'play', playlist: 'play', channel: 'play', audio: 'audio', pdf: 'doc', download: 'download' };

/** One media row: its disc, the site's label, the topic and where it opens, ↗. */
function MediaRow({ m, place }) {
  const lines = answersMediaLines(m);
  const sub = answersMediaSub(m, place);
  return (
    <a className="ans-media" href={m.url} target="_blank" rel="noopener noreferrer">
      <span className="ans-disc" aria-hidden="true"><AnsIcon name={/** @type {any} */ (DISC)[m.kind] || 'ext'} /></span>
      <span className="ans-row-body">
        <span className="ans-row-title">{answersMediaTitle(m)}</span>
        {lines.length ? <span className="ans-media-sub">{lines.join(SEP)}</span> : null}
        {sub ? <span className="ans-media-sub">{m.kind === 'channel' ? slashBreaks(sub) : sub}</span> : null}
      </span>
      <AnsIcon name="ext" />
    </a>
  );
}

/**
 * @param {{ entries: any[], site?: any, fontScale?: any, onBack: () => void, onSearch?: any, onHistory?: any,
 *   onSettings?: any, theme?: any, onThemeChange?: any, onOpenTopic: Function }} props
 */
export function AnswersMedia({ entries, site, fontScale, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onOpenTopic }) {
  // The list comes from the sidecars: say so while they load, and if they never do (offline, first
  // visit), with a Try again.
  const [meta, failed, retry] = useAnswersMetaState();
  const idx = React.useMemo(() => (meta ? answersMediaIndex(entries, meta) : null), [entries, meta]);
  const [chart, setChart] = React.useState(/** @type {any} */ (null));
  const [about, setAbout] = React.useState(false);
  const [open, setOpen] = React.useState(/** @type {{ v?: boolean, l?: boolean, f?: boolean }} */ ({}));
  const place = (id) => answersMediaPlace(entries, id, answersShortTitle);
  const closeChart = React.useCallback(() => setChart(null), []);
  const closeAbout = React.useCallback(() => setAbout(false), []);
  const playlists = idx ? idx.lists.filter((m) => m.kind === 'playlist').length : 0;
  const channels = idx ? idx.lists.length - playlists : 0;
  return (
    <ScreenLayout className={answersLayoutClass(fontScale, false)}
      navChildren={LibraryNav({ onBack, backLabel: 'Answers', showHome: false, onSettings, onHistory, onSearch, theme, onThemeChange,
        leftExtras: <h1 className="ans-bar-title is-on">Charts &amp; videos</h1> })}>
      <div className="ans-page ans-media-page">
        {idx ? (
          <>
            {/* WA2 (a-media): eyebrow heads, charts as two-up tiles, videos and lists in cards; the long lists open in place */}
            <div className="ans-sechead"><h2 className="ans-h2">Charts</h2><span className="ans-count">Open here · pinch to zoom</span></div>
            <div className="ans-gallery">
              {idx.charts.map((c) => (
                <button key={c.src} type="button" className="ans-thumb" aria-haspopup="dialog" onClick={() => setChart(c)}>
                  <img src={c.src} alt={c.title + ', a chart'} loading="lazy" />
                  <span className="ans-thumb-t">{c.title}</span>
                  <span className="ans-row-sub">{c.ids.map(place).join(SEP)}</span>
                </button>
              ))}
            </div>
            <div className="ans-sechead"><h2 className="ans-h2">Videos</h2><span className="ans-count">Open in your browser</span></div>
            <div className="ans-box">
              {(open.v ? idx.videos : idx.videos.slice(0, 3)).map((m, i) => <MediaRow key={'v' + i} m={m} place={place(m.id)} />)}
              {idx.videos.length > 3 && !open.v ? (
                <button type="button" className="ans-textbtn ans-media-all" aria-expanded="false" onClick={() => setOpen({ ...open, v: true })}>{'All ' + pl(idx.videos.length, 'video')}<Chev /></button>
              ) : null}
            </div>
            <div className="ans-sechead"><h2 className="ans-h2">Playlists, audio and PDFs</h2></div>
            <div className="ans-box">
              <button type="button" className="ans-row" aria-expanded={!!open.l} onClick={() => setOpen({ ...open, l: !open.l })}>
                <span className="ans-disc" aria-hidden="true"><AnsIcon name="list" /></span>
                <span className="ans-row-body"><span className="ans-row-title">Playlists</span><span className="ans-row-sub">{pl(playlists, 'playlist') + (channels ? SEP + pl(channels, 'channel') : '')}</span></span>
                <Chev dir={open.l ? 'down' : 'chev'} />
              </button>
              {open.l ? idx.lists.map((m, i) => <MediaRow key={'l' + i} m={m} place={place(m.id)} />) : null}
              <button type="button" className="ans-row" aria-expanded={!!open.f} onClick={() => setOpen({ ...open, f: !open.f })}>
                <span className="ans-disc" aria-hidden="true"><AnsIcon name="doc" /></span>
                <span className="ans-row-body"><span className="ans-row-title">Audio &amp; PDF</span><span className="ans-row-sub">{pl(idx.files.length, 'item') + SEP + 'By topic'}</span></span>
                <Chev dir={open.f ? 'down' : 'chev'} />
              </button>
              {open.f ? idx.files.map((m, i) => <MediaRow key={'f' + i} m={m} place={place(m.id)} />) : null}
            </div>
          </>
        ) : failed ? (
          <p className="ans-meta" role="status">
            {'Couldn’t load the list of charts and videos. '}
            <button type="button" className="ans-textbtn" onClick={retry}>Try again</button>
          </p>
        ) : <p className="ans-meta" role="status">Loading…</p>}
        {site ? (
          <p className="ans-credit">
            {'From ' + answersDomain(site.site)}<br />{'Captured ' + site.capturedAt}<br />
            <a href="#" role="button" aria-haspopup="dialog" onClick={(e) => { e.preventDefault(); setAbout(true); }}>About this collection<Chev /></a>
          </p>
        ) : null}
      </div>
      {chart ? <ChartViewer chart={chart} onClose={closeChart} /> : null}
      {about && site ? <AboutSheet site={site} onOpenTopic={(id) => { setAbout(false); onOpenTopic(id, null, 'Charts & videos'); }} onClose={closeAbout} /> : null}
    </ScreenLayout>
  );
}

