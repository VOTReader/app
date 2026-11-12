/* ═══════════════════════════════════════════════════════════════════════
   QuickSettings — the look and the doors out, one block (Cluster D, bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   GEAR1 (Corbin 2026-11-12: "I keep looking for it, primarily for the light
   switch ... even on higher screens including home screen by tapping the
   gear icon"). The reader's ⋯ sheet (MoreMenu.jsx) ends with a block that is
   not about the page: Text size, Theme, then History, Reading plans and
   Settings. The gear in every other top bar (GearMenu.jsx) opens a sheet of
   exactly that block. Both draw it from here, so the two can never drift.

   Both hosts are bottom sheets and this block is their last part, so the
   Theme switch sits the same distance from the bottom edge in both: one spot
   for the thumb. A row that makes no sense where the reader is (History on
   History, Reading plans on the plans screen, Settings on Settings) is left
   out, not shown dead.

   The block's controls are role=menuitem / menuitemradio, for the host's
   role=menu (arrows, Home/End, Tab). The text size's spoken readout must sit
   OUTSIDE a role=menu (axe aria-required-children): each host draws
   <QuickSettingsLive> beside its sheet.
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from './UiIcon.jsx';

/** The Settings slider's range and the block's step (SettingsScreen's TextSizeSliderRow: 0.8-3). */
export const MENU_SCALE_MIN = 0.8;
export const MENU_SCALE_MAX = 3;
const MENU_SCALE_STEP = 0.1;

/**
 * The next text scale one step up or down, clamped to the slider's range and
 * rounded to two places so repeated steps never drift (1.1 + 0.1 = 1.2).
 * @param {string | number | undefined} current
 * @param {1 | -1} dir
 * @returns {string}
 */
export function stepFontScale(current, dir) {
  const v = parseFloat(String(current));
  const base = Number.isFinite(v) ? v : 1;
  const next = Math.min(MENU_SCALE_MAX, Math.max(MENU_SCALE_MIN, base + dir * MENU_SCALE_STEP));
  return String(Math.round(next * 100) / 100);
}

/** The text scale as a whole percent (100 = Standard). @param {string | undefined} fontScale */
function scalePct(fontScale) {
  return Math.round(parseFloat(String(fontScale || '1')) * 100) || 100;
}

/** "Standard" or "120%": what the Text size row reads. @param {string | undefined} fontScale */
export function textSizeWord(fontScale) {
  const pct = scalePct(fontScale);
  return pct === 100 ? 'Standard' : pct + '%';
}

/** The screens where a door would lead back to the screen itself. */
const HERE = { history: 'history', 'reading-plans': 'plans', settings: 'settings' };

/**
 * The block: a "Look" group (an optional `lookLead` row from the host, Text size, Theme) and a "More places" group
 * (History, Reading plans, Settings). `go(fn)` is the host's leave-the-screen wrapper (close the sheet, then act).
 * `onSettings` overrides the context's (a screen's own way to Settings).
 * @param {{ ctx: import('./MoreMenu.jsx').NavMenuValue, go: (fn: any) => () => void, lookLead?: any, onSettings?: (() => void) | null }} props
 */
export function QuickSettingsRows({ ctx, go, lookLead = null, onSettings = null }) {
  const pct = scalePct(ctx.fontScale);
  const atMin = pct <= MENU_SCALE_MIN * 100, atMax = pct >= MENU_SCALE_MAX * 100;
  const theme = ctx.theme === 'light' ? 'light' : 'dark';
  const here = HERE[/** @type {keyof typeof HERE} */ (ctx.screen || '')] || '';
  const toSettings = onSettings || ctx.onSettings;
  return (
    <>
      <div className="rd-menu-group" role="group" aria-label="Look">
        {lookLead}
        <div className="more-menu-row" role="group" aria-label="Text size">
          <span className="more-menu-row-label">Text size</span>
          <span className="more-menu-step">
            <button type="button" role="menuitem" aria-label="Smaller text" aria-disabled={atMin}
              onClick={() => { if (!atMin) ctx.onFontScale(stepFontScale(ctx.fontScale, -1)); }}>A−</button>
            <span className="more-menu-step-value">{textSizeWord(ctx.fontScale)}</span>
            <button type="button" role="menuitem" aria-label="Larger text" aria-disabled={atMax}
              onClick={() => { if (!atMax) ctx.onFontScale(stepFontScale(ctx.fontScale, 1)); }}>A+</button>
          </span>
        </div>
        <div className="more-menu-row" role="group" aria-label="Theme">
          <span className="more-menu-row-label">Theme</span>
          <span className="more-menu-seg">
            <button type="button" role="menuitemradio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'on' : ''}
              onClick={() => { if (theme !== 'dark') ctx.onThemeChange('dark'); }}>Dark</button>
            <button type="button" role="menuitemradio" aria-checked={theme === 'light'} className={theme === 'light' ? 'on' : ''}
              onClick={() => { if (theme !== 'light') ctx.onThemeChange('light'); }}>Light</button>
          </span>
        </div>
      </div>
      <div className="rd-menu-group" role="group" aria-label="More places">
        {ctx.historyEnabled && here !== 'history' ? (
          <button type="button" role="menuitem" className="more-menu-item" onClick={go(ctx.onHistory)}>
            <UiIcon name="clock" /><span>History</span><UiIcon name="chev" size="sm" />
          </button>
        ) : null}
        {ctx.onPlans && here !== 'plans' ? (
          <button type="button" role="menuitem" className="more-menu-item" onClick={go(ctx.onPlans)}>
            <UiIcon name="cal" /><span>Reading plans</span><UiIcon name="chev" size="sm" />
          </button>
        ) : null}
        {here !== 'settings' ? (
          <button type="button" role="menuitem" className="more-menu-item" onClick={go(toSettings)}>
            <UiIcon name="gear" /><span>Settings</span><UiIcon name="chev" size="sm" />
          </button>
        ) : null}
      </div>
    </>
  );
}

/** The text size's announcement, visually hidden, drawn beside (never inside) the host's role=menu.
 * @param {{ fontScale: string | undefined }} props */
export function QuickSettingsLive({ fontScale }) {
  return <span className="more-menu-live sr-only" aria-live="polite">{'Text size ' + textSizeWord(fontScale)}</span>;
}
