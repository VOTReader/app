/* ═══════════════════════════════════════════════════════════════════════
   MoreMenu — the top bar's "⋯" menu (Cluster D, esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE REDESIGN'S FIRST STRUCTURAL STEP (2026-09-25). The top bar carried
   six to eight equal-weight gold icons (back, home, settings, history,
   search, bookmark, theme, tabs). A UX walk of seven reader journeys ranked
   that the #1 friction — a newcomer cannot tell the icons apart — and all
   three directions of the Codex image mockups (D:/Swarm/calls/ux-0925/)
   folded them into one "more" menu. Settings, History and the theme switch
   are never in a reader's bar (app.css "the reader bar holds no gear") and live here, with names, beside a
   Text size stepper; Back, Home, Search, the bookmark and Tabs stay.

   ScreenLayout mounts the button at the end of every top bar. Its actions
   come from NavMenuContext, provided by ReadingChromeProvider (App owns the
   state; app.jsx is held to an 800-line canary, so it passes one `nav`
   prop there instead of wrapping another provider).

   Behaviour:
   - a dropdown portaled to <body>, anchored under the button's right edge;
   - registers with the modal registry while open, so Escape and Android
     Back close it and never navigate (the W1.5 single-dispatcher contract:
     this component does NOT listen for Escape itself);
   - closes on an outside press, the reader scrolling the page (a wheel or
     a touch drag; never the app's own scrollTop writes, such as read-along's
     follow glide or a text-size reflow), or an action that leaves the screen
     (History, Settings); a resize re-anchors it; the theme and text size
     controls keep it open so the reader sees each change land;
   - ArrowUp / ArrowDown / Home / End move between items; focus goes to the
     first item on open and back to ⋯ when the menu is dismissed.

   COPY WEBSITE LINK (cp2, Corbin 2026-09-27). On a reading page the site
   has (a letter, a Words To Live By / Blessed / Holy Days entry, a Letter
   Study, the Matthew Study Bible, an Answers topic), the first item copies
   that page's link on thevolumesoftruth.com (answersonlygodcangive.com for
   an Answers topic): the link alone, for a reader who wants to send the
   letter, not a quote. The page is read when the menu opens, from the
   data-copy-key the page declares for Copy (utils/passage-copy.js
   pageSiteLink), so no screen passes anything in. A refused clipboard keeps
   the link on screen (CopyFallbackSheet) instead of losing it.
   ═══════════════════════════════════════════════════════════════════════ */

import { pageSiteLink } from '../../utils/passage-copy.js';
import { copyText } from '../../utils/copy-share.js';
import { CopyFallbackSheet } from '../sheets/CopyFallbackSheet.jsx';
import { SelectSheet } from './SelectField.jsx';
import { translationName, translationSheetOptions } from '../../data/translations.js';
import { pageMenu } from '../../utils/page-menu.js';
import { AnnotationHintItem } from './AnnotationHint.jsx';
import { UiIcon } from './UiIcon.jsx';
import { QuickSettingsRows, QuickSettingsLive, stepFontScale } from './QuickSettings.jsx';

// The text-size step moved to QuickSettings.jsx with the block it serves (GEAR1); kept importable from here.
export { stepFontScale };

/**
 * @typedef {Object} NavMenuValue
 * @property {boolean} enabled          always true since the three tabs (2026-11-10)
 * @property {boolean} historyEnabled   settings.historyEnabled !== false
 * @property {string} theme             'dark' | 'light'
 * @property {(t: string) => void} onThemeChange
 * @property {() => void} onSettings
 * @property {() => void} onHistory
 * @property {(() => void) | null} [onPlans]  mw18 C8: Reading plans, beside History
 * @property {string} fontScale         settings.fontScale ("1" = 100 %)
 * @property {(v: string) => void} onFontScale
 * @property {boolean} [translationHere] a Bible chapter: the menu offers the translation picker
 * @property {string} [translation]      settings.translation
 * @property {(v: string) => void} [onTranslation]
 * @property {boolean} [autoScroll]      settings.autoScroll (r-menu's Auto-scroll row says On / Off)
 * @property {(on: boolean) => void} [onAutoScroll]
 * @property {string} [screen]          the screen on show: a door back to it is left out (QuickSettings.jsx)
 */

/** The ⋯ menu's actions and state (a NavMenuValue, or null outside the provider). */
export const NavMenuContext = React.createContext(/** @type {NavMenuValue | null} */ (null));

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

/** "thevolumesoftruth.com": the site a link goes to, under "Copy website link". @param {string} link */
function siteName(link) {
  try { return new URL(link).host.replace(/^www\./, ''); } catch (_e) { return ''; }
}

/** @param {string} text */
function toast(text) {
  if (typeof showToast === 'function') showToast({ id: 'vot-toast-copy', className: 'vot-toast', text });
}

export function MoreMenuBtn() {
  const ctx = React.useContext(NavMenuContext);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(/** @type {{top:number,right:number}|null} */ (null));
  // The page on screen's website link, read as the menu opens (cp2).
  const [page, setPage] = React.useState(/** @type {{link:string,reference:string}|null} */ (null));
  const [fallback, setFallback] = React.useState(/** @type {string|null} */ (null));
  // The screen's own items (utils/page-menu.js, id-datasafe 122), read as the menu opens.
  const [pageItems, setPageItems] = React.useState(/** @type {any[]|null} */ (null));
  const [pickOpen, setPickOpen] = React.useState(false);
  // Whether this bar's screen is a page that can auto-scroll (ScreenLayout mounts the transport only with a pager,
  // drawn as .pager-viewport), read as the menu opens: elsewhere the row would switch the setting on and do nothing.
  const [canAutoScroll, setCanAutoScroll] = React.useState(false);
  const closePick = React.useCallback(() => setPickOpen(false), []);
  const btnRef = React.useRef(/** @type {HTMLButtonElement|null} */ (null));
  const menuRef = React.useRef(/** @type {HTMLDivElement|null} */ (null));

  const close = React.useCallback((/** @type {boolean} */ refocus) => {
    setOpen(false);
    if (refocus && btnRef.current) btnRef.current.focus();
  }, []);

  // Escape and Android Back reach the menu through the registry, never a listener of its own.
  useModalRegistry({ id: 'more-menu', dismiss: () => close(true), active: open });

  React.useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    let here = null;
    try { here = pageSiteLink(); } catch (_e) { here = null; }   // a menu never breaks on a page it cannot name
    setPage(here);
    setPageItems(pageMenu());
    const layout = btnRef.current.closest('.screen-layout');
    setCanAutoScroll(!!(layout && layout.querySelector(':scope > .pager-viewport')));
  }, [open]);

  // Focus the first item once the menu exists: it mounts one commit after `open`
  // (it waits for the button's position), so this keys on the position too.
  const placed = open && pos != null;
  React.useEffect(() => {
    if (!placed) return;
    const first = menuRef.current && menuRef.current.querySelector(ITEM_SELECTOR);
    if (first) /** @type {HTMLElement} */ (first).focus();
  }, [placed]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (/** @type {Event} */ e) => {
      const t = /** @type {Node} */ (e.target);
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (btnRef.current && btnRef.current.contains(t)) return;
      close(false);
    };
    // A resize re-anchors rather than closes: mobile browsers resize as their URL bar
    // slides, and a rotation keeps the same bar, so the menu follows its button.
    const onResize = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    };
    // The READER's scroll closes it, not a 'scroll' event: the app writes .screen-scroll's
    // scrollTop on its own (read-along's follow glide every frame, a text-size step's
    // reflow re-seat, the autoscroll), and a 'scroll' listener shut the menu on each of
    // those (sweep v022). A wheel or a touch drag is the reader; a press already closes
    // it above. A ctrl+wheel zooms, and the resize re-anchors the menu instead.
    const onUserScroll = (/** @type {Event} */ e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      if (e.type === 'wheel' && /** @type {WheelEvent} */ (e).ctrlKey) return;
      close(false);
    };
    const passive = { capture: true, passive: true };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('wheel', onUserScroll, passive);
    document.addEventListener('touchmove', onUserScroll, passive);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('wheel', onUserScroll, true);
      document.removeEventListener('touchmove', onUserScroll, true);
    };
  }, [open, close]);

  if (!ctx || !ctx.enabled) return null;

  const onKeyDown = (/** @type {any} */ e) => {
    // A step button at its limit is aria-disabled, not disabled: it keeps the focus that just pressed
    // it, so it stays a stop (as menu items that are unavailable do).
    const items = menuRef.current
      ? /** @type {HTMLElement[]} */ ([...menuRef.current.querySelectorAll(ITEM_SELECTOR)])
          .filter((el) => !(/** @type {HTMLButtonElement} */ (el)).disabled)
      : [];
    if (!items.length) return;
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    let to = -1;
    if (e.key === 'ArrowDown') to = at < 0 ? 0 : (at + 1) % items.length;
    else if (e.key === 'ArrowUp') to = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = items.length - 1;
    else if (e.key === 'Tab') { close(false); return; }
    if (to >= 0) { e.preventDefault(); items[to].focus(); }
  };

  /** Leave the screen: close first, then act (the next screen owns focus). */
  const go = (/** @type {() => void} */ fn) => () => { close(false); if (typeof fn === 'function') fn(); };
  // Copy website link: the reader stays on the page, so focus goes back to ⋯;
  // the toast names what was copied, and a refused clipboard shows the link.
  const copyPageLink = () => {
    const here = page;
    close(true);
    if (!here) return;
    copyText(here.link).then((outcome) => {
      if (outcome === 'copied') toast('Link copied: ' + here.reference);
      else setFallback(here.link);
    });
  };
  // A Bible chapter's translation, picked from here as from Settings > Reading (mw17 A02.1).
  const canPickTranslation = !!ctx.translationHere && typeof ctx.onTranslation === 'function'
    && typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) && TRANSLATION_OPTIONS.length > 1;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={'nav-more-btn' + (open ? ' open' : '')}
        onClick={() => setOpen((v) => !v)}
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && pos ? ReactDOM.createPortal(
        <>
        {/* r-menu (the UI pass, mock v2 readers): one bottom sheet of worded rows in three groups: the page's own
            things (Find, Copy website link, Auto-scroll, Full screen), the look (Text size, Theme), and the doors out
            (History, Reading plans, Settings). Still a role=menu: arrows, Home/End and Tab work as before. */}
        <div className="rd-menu-scrim" aria-hidden="true" />
        <div
          className="more-menu rd-menu-sheet"
          role="menu"
          aria-label="More"
          ref={menuRef}
          onKeyDown={onKeyDown}
        >
          {/* The first-run tip, as a row (W2d r-letter: it no longer floats over the text). */}
          <AnnotationHintItem onDone={() => close(true)} />
          <div className="rd-menu-group" role="group" aria-label="This page">
            {pageItems ? pageItems.map((it) => (
              <button key={it.key} type="button" role="menuitem" className={'more-menu-item more-menu-page-item' + (it.danger ? ' danger' : '')} onClick={go(it.onSelect)}>
                {it.icon === 'find' ? <UiIcon name="search" /> : it.icon === 'share' ? <UiIcon name="share" /> : null}
                <span>{it.label}</span>
              </button>
            )) : null}
            {page ? (
              <button type="button" role="menuitem" className="more-menu-item" onClick={copyPageLink}>
                <UiIcon name="copy" />
                <span className="more-menu-item-text">
                  <span>Copy website link</span>
                  <span className="more-menu-item-sub">{siteName(page.link)}</span>
                </span>
              </button>
            ) : null}
            {canAutoScroll && typeof ctx.onAutoScroll === 'function' ? (
              <button type="button" role="menuitem" className="more-menu-item" onClick={() => { close(true); ctx.onAutoScroll(!ctx.autoScroll); }}>
                <UiIcon name="scroll" />
                <span className="more-menu-item-text">
                  <span>Auto-scroll</span>
                  <span className="more-menu-item-sub">{ctx.autoScroll ? 'On' : 'Off'}</span>
                </span>
              </button>
            ) : null}
            <button type="button" role="menuitem" className="more-menu-item" onClick={() => { close(true); document.dispatchEvent(new CustomEvent('vot:fullscreen-toggle')); }}>
              <UiIcon name="full" />
              <span>Full screen</span>
            </button>
          </div>
          {/* The look and the doors out: the same block the gear's Quick settings sheet draws (QuickSettings.jsx, GEAR1). */}
          <QuickSettingsRows ctx={ctx} go={go} lookLead={canPickTranslation ? (
            <button type="button" role="menuitem" className="more-menu-item" aria-haspopup="dialog" onClick={go(() => setPickOpen(true))}>
              <UiIcon name="book" />
              <span className="more-menu-item-text">
                <span>Bible translation</span>
                <span className="more-menu-item-sub">{translationName(ctx.translation)}</span>
              </span>
            </button>
          ) : null} />
        </div>
        {/* The text size's announcement: a role=menu may own only its items, so the live region sits beside the menu,
            visually hidden (axe aria-required-children); the readout in the block is what the eye sees. */}
        <QuickSettingsLive fontScale={ctx.fontScale} />
        </>,
        document.body,
      ) : null}
      {canPickTranslation ? (
        <SelectSheet open={pickOpen} onClose={closePick} portal title="Bible translation"
          value={ctx.translation || 'nkjv'} options={translationSheetOptions()} onChange={/** @type {(v: string) => void} */ (ctx.onTranslation)} />
      ) : null}
      {fallback ? (
        <CopyFallbackSheet
          text={fallback}
          verb="copy"
          what="link"
          onClose={() => setFallback(null)}
          onCopied={() => { setFallback(null); toast('Link copied'); }}
        />
      ) : null}
    </>
  );
}
