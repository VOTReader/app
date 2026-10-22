/* more-menu.jsx - a reading page's ... (mw7, v2-gaps 13; design dz15: 1h on a letter or entry, 5g on a Bible chapter; main's
   MoreMenu). It holds what THIS page can do beyond Bookmark and Aa, each row only where it applies; v2 moved main's other
   items (theme and text size to Aa, History to Home's Recent, Settings to Home's gear). The phone opens the kit's sheet of
   action rows titled by the page (Sheet kind 'mor', Cancel), the laptop a menu anchored under the ... (D6: Menu.jsx, no
   scrim, no title). A page whose ... would hold nothing draws no ... at all (design's rule).
   Copy website link is the menu's own work (main's copyPageLink): "Link copied: <reference>", and a refused clipboard
   opens main's "Couldn't copy" sheet with the link selected (Try again / Close). */
import { Icon } from './Icon.jsx';
import { Sheet, LayerToast } from './Sheet.jsx';
import { Menu } from './Menu.jsx';
import { copyText, copyFromSelection } from '../utils/copy-share.js';
import { savedSettings } from './settings-pages.js';
import { autoPrefs } from './AutoScrollPill.jsx';

const g = /** @type {any} */ (globalThis);
const TOAST_MS = 2600;

/**
 * One row: its icon, its words, an optional second line and what it does; `chev` draws the kit's chevron (a row that
 * opens a page). `copy` makes it the Copy website link row: the menu copies that link itself.
 * @typedef {{ id: string, icon: string, t: string, s?: string, chev?: boolean, run?: () => void,
 *   copy?: { link: string, reference: string } }} MoreItem
 */

/** The Scripture Web's door (mw13; main's "Show in Scripture Web" / "See this letter's scriptures"): opens the web at the
 *  page's place; none on a gate boot (design's ... pictures predate it). @param {any} route webDoor's, or null
 *  @param {string} t @param {(r: any) => void} [go] @param {any} [gate] */
export function webItem(route, t, go, gate = null) {
  return route && go && !gate ? { id: 'web', icon: 'lines', t, s: 'The Scripture Web', run: () => go(route) } : null;
}

/** "thevolumesoftruth.com": the site a link goes to, under "Copy website link" (main's siteName). @param {string} link */
export function siteName(link) {
  try { return new URL(link).host.replace(/^www\./, ''); } catch (_e) { return ''; }
}

/** The Copy website link row for a page the site has (passage-copy.js keySiteLink), else null. */
export function copyLinkItem(/** @type {{ link: string, reference: string } | null} */ page) {
  return page ? { id: 'copy-link', icon: 'link', t: 'Copy website link', s: siteName(page.link), copy: page } : null;
}

/* The rows every reading page shares (a study chapter's ... too, its cards rows after them). `open` is the shell's
   (places.js PlaceProps.open); without it the row is left out. */
/** Find in this <noun> (1i: main's FindInUnit noun: letter, entry, topic, chapter). @param {string} noun @param {any} open */
export function findItem(noun, open) {
  return noun && open ? { id: 'find', icon: 'search', t: 'Find in this ' + noun, run: () => open('find') } : null;
}

/** Auto-scroll (1j) on this page at the reader's speed, even with the setting off. @param {any} open @param {any} gate */
export function autoScrollItem(open, gate) {
  if (!open) return null;
  const lpm = autoPrefs(gate ? {} : savedSettings()).lpm;
  return { id: 'auto-scroll', icon: 'autoscroll', t: 'Auto-scroll', s: 'Scrolls the page for you · ' + lpm + ' lines/min',
    run: () => open('auto-scroll') };
}

/**
 * Hear it sung: only with a song that sings this page's own words (main's LetterSongs, vs === true), played as main's
 * pill plays them (AudioPlayer.playSongs, the page's title as the label).
 * @param {Array<{ id: string }>} songs @param {string} label
 */
export function sungItem(songs, label) {
  if (!songs.length) return null;
  return { id: 'sung', icon: 'music', t: 'Hear it sung', s: 'Songs that sing its words', run: () => {
    const A = g.AudioPlayer;
    if (A && typeof A.playSongs === 'function') A.playSongs({ ids: songs.map((s) => s.id), startId: songs[0].id, label: label || 'Songs of this letter' });
  } };
}

const noStore = () => () => {};
const zero = () => 0;
const NONE = /** @type {Array<{ id: string }>} */ ([]);
const GATE_SONGS = [{ id: 'gate' }];

/**
 * The songs that sing `letterKey`'s ('<volKey>:<id>') own words, as main's letter pill finds them: main's song catalog
 * (the SongCatalog global, never imported: a second copy would be a second catalog), asked for once while the page is
 * up, only with main's "Hear it sung" setting on (showLetterSongs). A gate boot touches nothing: open.songs stands in.
 * @param {string} letterKey @param {any} gate @returns {Array<{ id: string }>}
 */
export function useVerbatimSongs(letterKey, gate) {
  const C = gate ? null : g.SongCatalog;
  const want = !!(C && letterKey) && savedSettings().showLetterSongs !== false;
  React.useSyncExternalStore(C ? C.subscribe : noStore, C ? C.getVersion : zero);
  React.useEffect(() => {
    if (want && !C.loaded && !C.error) void C.load();
  }, [want, C]);
  if (gate) return gate.open && gate.open.songs ? GATE_SONGS : NONE;
  return want && C.loaded ? C.songsForLetter(letterKey, { verbatim: true }) || NONE : NONE;
}

/**
 * @param {{ title: string, items: Array<MoreItem | null | false>, desktop: boolean, gate?: any }} props
 *   title the phone sheet's heading (the page's name); a gate whose open.sheet is 'more' draws it open (no focus ring)
 */
export function MoreButton({ title, items, desktop, gate = null }) {
  const [open, setOpen] = React.useState(() => !!(gate && gate.open && gate.open.sheet === 'more'));
  const [toast, setToast] = React.useState(/** @type {string | null} */ (null));
  const [fallback, setFallback] = React.useState(/** @type {string | null} */ (null));
  const btn = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const rows = /** @type {MoreItem[]} */ (items.filter(Boolean));
  if (!rows.length) return null;
  const close = () => setOpen(false);
  const pick = (/** @type {MoreItem} */ it) => {
    close();
    if (gate) return;
    if (it.copy) {
      const here = it.copy;
      if (desktop && btn.current) btn.current.focus();   // the reader stays on the page: focus back to the ...
      copyText(here.link).then((outcome) => {
        if (outcome === 'copied') setToast('Link copied: ' + here.reference);
        else setFallback(here.link);
      });
      return;
    }
    if (it.run) it.run();
  };
  const row = (/** @type {MoreItem} */ it, menu = false) => (
    <button key={it.id} type="button" className="srow act" role={menu ? 'menuitem' : undefined} tabIndex={menu ? -1 : undefined}
      onClick={() => pick(it)}>
      <span className="lead"><Icon name={it.icon} /></span>
      <span className="tx"><span className="t">{it.t}</span>{it.s ? <span className="s">{it.s}</span> : null}</span>
      {it.chev ? <span className="chev"><Icon name="chev" /></span> : null}
    </button>
  );
  return (
    <>
      <button ref={btn} type="button" className={'ic' + (desktop && open ? ' opn' : '')} aria-label="More"
        aria-haspopup={desktop ? 'menu' : 'dialog'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="more" />
      </button>
      {open && desktop && (
        <Menu label="More" anchorRef={btn} onClose={close} focusFirst={!gate}>
          {rows.map((it) => row(it, true))}
        </Menu>
      )}
      {open && !desktop && (
        <Sheet kind="mor" label="More" scrim="light" onClose={close}>
          <div className="sh">{title}</div>
          {rows.map((it) => row(it))}
          <button type="button" className="textbtn cancel" onClick={close}>Cancel</button>
        </Sheet>
      )}
      {fallback !== null && (
        <CopyFallback text={fallback} desktop={desktop} onClose={() => setFallback(null)}
          onCopied={() => { setFallback(null); setToast('Link copied'); }} />
      )}
      <LayerToast text={toast} />
    </>
  );
}

/**
 * main's "Couldn't copy" sheet (CopyFallbackSheet, verb copy, what link): the link selected in a read-only box, so the
 * platform's own Copy is one gesture away; Try again copies from that selection inside the tap; a second refusal says
 * how to copy it by hand.
 * @param {{ text: string, desktop: boolean, onClose: () => void, onCopied: () => void }} props
 */
export function CopyFallback({ text, desktop, onClose, onCopied }) {
  const field = React.useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const [blocked, setBlocked] = React.useState(false);
  React.useEffect(() => {
    const f = field.current;
    if (!f) return;
    try { f.focus(); f.select(); } catch (_e) { /* focus can throw in exotic hosts */ }
  }, []);
  const retry = () => {
    copyFromSelection(field.current, text).then((r) => {
      if (r === 'copied') onCopied();
      else setBlocked(true);
    });
  };
  return (
    <Sheet kind="cpf" label="Couldn’t copy" desktop={desktop} onClose={onClose}>
      <div className="sh">Couldn’t copy</div>
      <p className="fine cpf-h">{blocked ? 'Still blocked. Press and hold the link, choose Select all, then Copy.'
        : 'Copy the selected link below, or try again.'}</p>
      <textarea ref={field} className="field cpf-t" readOnly value={text} rows={2} aria-label="The link" />
      <div className="cpf-a">
        <button type="button" className="pill sm" onClick={retry}>Try again</button>
        <button type="button" className="btn2 sm" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
