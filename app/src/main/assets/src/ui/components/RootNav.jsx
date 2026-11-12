/* ═══════════════════════════════════════════════════════════════════════
   RootNav — the top bar of the three tab roots (the layout pass, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   Read, Listen and Library share one bar (mocks read.png, listen.png,
   library.png): the place's name, Search, the Tabs button (ScreenLayout
   draws it) and the gear (Quick settings: text size, theme, History, plans,
   Settings; GearMenu.jsx). No Back (a root is the top), no About
   (it lives in Settings > Help) and no ⋯ menu (its items have homes: plans
   and history in the Library, theme and text size in Settings).

   The gear is its own class, not .settings-gear-btn: the compact bar and
   the "Settings Gear" switch hide that one everywhere, and on a root the
   gear is the only way to Settings.

     <ScreenLayout root navChildren={rootNavStart({ title, onSearch })} navEnd={<RootGear onSettings={...} />}>
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from './UiIcon.jsx';
import { GearMenuBtn } from './GearMenu.jsx';

/**
 * The bar's start: the name, then Search (hidden with Search switched off, as everywhere: body.no-search).
 * @param {{ title: string, onSearch?: () => void }} props
 */
export function rootNavStart({ title, onSearch }) {
  return (
    <>
      <h1 className="root-title">{title}</h1>
      {onSearch ? (
        <button type="button" className="nav-search-btn" onClick={onSearch} title="Search" aria-label="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      ) : null}
    </>
  );
}

/** The gear after Tabs: it opens Quick settings, whose last row is Settings (GearMenu.jsx, GEAR1).
 * @param {{ onSettings: () => void }} props */
export function RootGear({ onSettings }) {
  return <GearMenuBtn className="root-gear-btn" onSettings={onSettings} />;
}

/* ── The utility bar (U rule 11; W1, the UI pass 2026-11-11) ──────────────
   A utility screen's bar is: Back, the title, at most two actions, then the
   Tabs counter, and a ⋯ menu only where the screen has a menu of its own.
   A screen with its own search field passes no Search action.

     <ScreenLayout utility={{ title: 'Notes', onBack: goBack,
       actions: [<BarAction icon="search" label="Search" onClick={...} />],
       menu: <BarMenu label="Notes options" onClick={openSheet} /> }}>

   ScreenLayout draws it (it drops the resume dot and the app-wide ⋯ menu in
   this mode); this function is its start. More than two actions: the first
   two are drawn and the rest dropped, loudly in development. */
export const UTILITY_MAX_ACTIONS = 2;

/** `lead` (a worded action such as the journal editor's Done) takes Back's place.
 * @param {{ title: string, onBack?: () => void, backLabel?: string, actions?: any[], lead?: any, titleId?: string }} props */
export function utilityNav({ title, onBack, backLabel = 'Back', actions = [], lead = null, titleId = undefined }) {
  const list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
  if (list.length > UTILITY_MAX_ACTIONS && typeof console !== 'undefined') {
    console.warn('[utility bar] ' + title + ': ' + list.length + ' actions, the bar holds ' + UTILITY_MAX_ACTIONS);
  }
  return (
    <>
      {lead ? lead : onBack ? (
        <button type="button" className="nav-home nav-back-icon bar-back" onClick={onBack} title={backLabel} aria-label={backLabel}>
          <UiIcon name="back" />
        </button>
      ) : null}
      {title ? <h1 className="bar-title" id={titleId}>{title}</h1> : <span className="bar-title" aria-hidden="true" />}
      {list.slice(0, UTILITY_MAX_ACTIONS).map((a, i) => <React.Fragment key={i}>{a}</React.Fragment>)}
    </>
  );
}

/** An icon action in a bar: 44 px, the primary text colour, named by `label`.
 * @param {{ icon: string, label: string, onClick: () => void, pressed?: boolean, disabled?: boolean }} props */
export function BarAction({ icon, label, onClick, pressed, disabled = false }) {
  return (
    <button type="button" className="bar-action" onClick={onClick} title={label} aria-label={label} disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : !!pressed}>
      <UiIcon name={icon} />
    </button>
  );
}

/** A worded bar action ("Done", "Save"): gold text, no box. @param {{ label: string, onClick: () => void, disabled?: boolean }} props */
export function BarTextAction({ label, onClick, disabled = false }) {
  return <button type="button" className="bar-text-action" onClick={onClick} disabled={disabled}>{label}</button>;
}

/** The screen's own ⋯ menu, last in the bar. Only where it holds something (rule 11).
 * @param {{ label: string, onClick: () => void, expanded?: boolean }} props */
export function BarMenu({ label, onClick, expanded }) {
  return (
    <button type="button" className="bar-action bar-menu" onClick={onClick} title={label} aria-label={label}
      aria-haspopup="dialog" aria-expanded={expanded === undefined ? undefined : !!expanded}>
      <UiIcon name="more" />
    </button>
  );
}
