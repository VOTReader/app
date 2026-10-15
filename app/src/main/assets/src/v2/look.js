/* look.js - the reader's text and page (picture 1c-aa-sheet; design dz12): text size, page (Slate / Paper / Black) and
   line spacing, as main stores them, and how the page shows them (the kit's attributes on <html>).

   Stored in main's own vot-state, so both apps agree and nothing is migrated:
   - text size = settings.fontScale, "1 = standard" (main's meaning, no px conversion); v2 shows six steps and a value
     between them on the nearest dot by ratio (min |ln(step / v)|); a tap writes that step's value;
   - page = theme 'dark' | 'light' (main's two themes) plus settings.trueBlack for Black (a key main already carries);
   - line spacing = settings.lineSpacing 'relaxed' (new; absent = comfortable, what main draws).
   Shown through the kit: data-page="paper" | "black" and data-lines="relaxed" on <html>, --text-scale, the window's
   theme-color, and on Android the system bars (PlatformBridge, main's bridge). */

const g = /** @type {any} */ (globalThis);

/** The six text sizes, multipliers of the standard 23 px reading text (dz12). */
export const TEXT_STEPS = [0.8, 0.9, 1, 1.3, 1.75, 2.4];
export const STANDARD_STEP = 2;
export const PAGES = [{ id: 'slate', label: 'Slate' }, { id: 'paper', label: 'Paper' }, { id: 'black', label: 'Black' }];
export const LINES = [{ id: 'comfortable', label: 'Comfortable' }, { id: 'relaxed', label: 'Relaxed' }];
/** The window's colour per page (the kit's --bg): the title bar on the laptop, the system bars on Android. */
export const PAGE_COLOUR = { slate: '#172022', paper: '#F2EDE2', black: '#000000' };

/** @typedef {{ scale: number, page: 'slate' | 'paper' | 'black', lines: 'comfortable' | 'relaxed' }} Look */

/** The dot a stored text size shows on: the nearest step by ratio; standard when there is no usable value. @param {unknown} v */
export function stepOf(v) {
  const x = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(x) || x <= 0) return STANDARD_STEP;
  let best = STANDARD_STEP;
  let gap = Infinity;
  TEXT_STEPS.forEach((s, i) => {
    const d = Math.abs(Math.log(s / x));
    if (d < gap - 1e-9) { gap = d; best = i; }
  });
  return best;
}

/** The look main's saved state says. @param {any} state vot-state ({ theme, settings }) @returns {Look} */
export function lookOf(state) {
  const s = state && state.settings && typeof state.settings === 'object' ? state.settings : {};
  const raw = parseFloat(String(s.fontScale ?? '1'));
  const scale = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const light = !!state && state.theme === 'light';
  return {
    scale,
    page: light ? 'paper' : s.trueBlack === true ? 'black' : 'slate',
    lines: s.lineSpacing === 'relaxed' ? 'relaxed' : 'comfortable',
  };
}

/**
 * What to write into vot-state for a look: the theme and the settings keys it owns (fontScale, trueBlack, lineSpacing).
 * @param {Look} look
 */
export function stateFor(look) {
  return {
    theme: look.page === 'paper' ? 'light' : 'dark',
    // fontScale as main writes it: a numeric string (SettingsScreen / MoreMenu)
    settings: { fontScale: String(look.scale), trueBlack: look.page === 'black', lineSpacing: look.lines },
  };
}

/**
 * Keeps a look in main's vot-state (StateStore.set of the whole state, as main's usePersistedState does): the theme and
 * the three settings keys, each changed key recorded in settings.touched as main's own setters do (so a later default
 * change in main never overrides the reader's choice). Every other key is kept. Nothing before the stores have loaded.
 * @param {Look} look @returns {boolean} whether it was written
 */
export function saveLook(look, gl = g) {
  const store = gl.StateStore;
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') return false;
  if (typeof store.isReady === 'function' && !store.isReady()) return false;
  try {
    const cur = store.get() || {};
    const was = cur.settings && typeof cur.settings === 'object' ? cur.settings : {};
    const next = stateFor(look);
    const touched = { ...(was.touched && typeof was.touched === 'object' ? was.touched : {}) };
    Object.keys(next.settings).forEach((k) => { if (was[k] !== next.settings[k]) touched[k] = true; });
    if (cur.theme === next.theme && Object.keys(next.settings).every((k) => was[k] === next.settings[k])) return false;
    store.set({ ...cur, theme: next.theme, settings: { ...was, ...next.settings, touched } });
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * The reader's look on a real boot, read only: vot-state from StateStore once HydrationGate has loaded it, else the boot
 * shim's localStorage copy (theme + font), else Slate at the standard size.
 * @returns {Look}
 */
export function savedLook(gl = g) {
  let state = null;
  try {
    const store = gl.StateStore;
    state = store && typeof store.isReady === 'function' && store.isReady() ? store.get()
      : JSON.parse((gl.localStorage && gl.localStorage.getItem('vot-state')) || '{}');
  } catch (_e) { /* no storage (a private window): the defaults */ }
  return lookOf(state);
}

/** A gate state's look: its `look`, else what its facts say, else Slate at the standard size. @param {any} gate @returns {Look} */
export function gateLook(gate) {
  const l = (gate && gate.look) || {};
  const f = (gate && gate.facts) || {};
  const page = l.page || f.page;
  const lines = l.lines || f.lines;
  return {
    scale: typeof l.scale === 'number' && l.scale > 0 ? l.scale : 1,
    page: page === 'paper' || page === 'black' ? page : 'slate',
    lines: lines === 'relaxed' ? 'relaxed' : 'comfortable',
  };
}

/** The settings line's words (4a: "Standard size · Slate · comfortable lines"). @param {number} scale */
export function sizeWord(scale) {
  const i = stepOf(scale);
  return i === STANDARD_STEP ? 'standard' : i < STANDARD_STEP ? 'smaller' : 'larger';
}

/**
 * Shows a look: the kit's attributes on <html>, the window colour, and on Android the system bars (dark icons on Paper).
 * @param {Look} look @param {{ doc?: Document, bridge?: any }} [where]
 */
export function applyLook(look, { doc = document, bridge = g.PlatformBridge } = {}) {
  const html = doc.documentElement;
  // main's own mark of its light theme (index.html's boot script sets it from vot-state), kept true to the page
  if (doc.body) doc.body.classList.toggle('light', look.page === 'paper');
  if (look.page === 'slate') html.removeAttribute('data-page');
  else html.setAttribute('data-page', look.page);
  if (look.lines === 'relaxed') html.setAttribute('data-lines', 'relaxed');
  else html.removeAttribute('data-lines');
  const step = TEXT_STEPS[stepOf(look.scale)];
  if (step === 1) html.style.removeProperty('--text-scale');
  else html.style.setProperty('--text-scale', String(step));
  const colour = PAGE_COLOUR[look.page] || PAGE_COLOUR.slate;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colour);
  systemBars(bridge, look.page === 'paper');
}

/** Android's status and navigation bar icons: dark on Paper (main's bridge: AppInterface.setLightStatusBar sets both bars'
    appearance). The bars themselves are transparent (edge to edge): the page colour is under them. */
function systemBars(bridge, lightBars) {
  try {
    if (bridge && typeof bridge.setLightStatusBar === 'function') bridge.setLightStatusBar(lightBars);
  } catch (_e) { /* the web: no bars to set */ }
}
