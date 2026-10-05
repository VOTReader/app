/* ═══════════════════════════════════════════════════════════════════════
   BottomTabs — the four tabs (Home / Read / Listen / Library) and their
   own back stacks (rs1, overhaul review build, 2026-10-05)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js; published on window
   by _entry-b so bundle-d's TabBar reads the SAME copy (a direct import
   from another bundle would get a second copy with its own state).

   THE MODEL (reports/audit-ia.md §2). Each tab keeps its own stack:
   switching tabs saves the reading state of the tab being left (the
   active browser-tab's fields: screen, book, chapter, letter, the
   tap-through stack …) into that tab's slot and restores the target's
   slot, or the target's root on its first visit. Tapping the lit tab pops
   it to its root. Content opens in the current tab, so the lit tab is
   STATE, not derived from the screen.

   BACK (use-android-back.js step "goHome"): the old routing table ends a
   screen's parent chain in goHome(). Inside a tab other than Home that
   becomes: not at the tab's root → the tab's root; at the root → the Home
   tab. So Back runs overlay → stack → Home tab → exit.

   Any other goHome() (the tour, Surprise, a removed screen) lights Home
   (markHome) and saves the tab it leaves.

   STORAGE: localStorage 'vot-bottom-tabs' = { active, slots }. New and
   additive; a missing or broken value means "Home, no slots". Never read
   by anything that ships to readers (overhaul only).
   ═══════════════════════════════════════════════════════════════════════ */

import { DEFAULT_TAB } from '../hooks/use-tabs.js';

export const BOTTOM_TABS = [
  { id: 'home', label: 'Home', root: 'home' },
  { id: 'read', label: 'Read', root: 'volumes-home' },
  { id: 'listen', label: 'Listen', root: 'audio-library' },
  { id: 'library', label: 'Library', root: 'library' },
];
const ROOT = Object.fromEntries(BOTTOM_TABS.map((t) => [t.id, t.root]));
const KEY = 'vot-bottom-tabs';
// A slot holds the reading state, not the tab's label or its per-screen scroll memory (shared, keyed by screen).
const SLOT_KEYS = Object.keys(DEFAULT_TAB).filter((k) => k !== 'scrollPositions' && k !== 'title' && k !== 'subtitle');

function _load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && ROOT[v.active] && v.slots && typeof v.slots === 'object') return { active: v.active, slots: v.slots };
  } catch (_e) { /* no storage or a broken value: start at Home */ }
  return { active: 'home', slots: {} };
}

let _state = _load();
let _bound = null;            // { getTab: () => Tab, patchTab: (patch) => void } — App's active tab
const _subs = new Set();

function _save() {
  try { localStorage.setItem(KEY, JSON.stringify(_state)); } catch (_e) { /* best-effort */ }
}
function _emit() { _save(); _subs.forEach((fn) => { try { fn(); } catch (_e) { /* a listener never breaks nav */ } }); }

function _snapshot() {
  const tab = _bound && _bound.getTab();
  if (!tab) return null;
  const out = {};
  for (const k of SLOT_KEYS) out[k] = tab[k];
  return out;
}
function _rootPatch(id) {
  const out = {};
  for (const k of SLOT_KEYS) out[k] = Array.isArray(DEFAULT_TAB[k]) ? [] : DEFAULT_TAB[k];
  out.screen = ROOT[id];
  return out;
}

export const BottomTabs = {
  /** @returns {string} the lit tab id */
  active() { return _state.active; },
  rootOf(id) { return ROOT[id] || 'home'; },
  subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); },
  bind(getTab, patchTab) { _bound = { getTab, patchTab }; return () => { if (_bound && _bound.getTab === getTab) _bound = null; }; },

  /** A tab-bar tap: the lit tab pops to its root; another tab is restored where it was left. */
  select(id) {
    if (!ROOT[id] || !_bound) return;
    if (id === _state.active) {
      _bound.patchTab(_rootPatch(id));
      delete _state.slots[id];
      _emit();
      return;
    }
    const leaving = _snapshot();
    if (leaving) _state.slots[_state.active] = leaving;
    const target = _state.slots[id];
    _state.active = id;
    _bound.patchTab(target && target.screen ? { ..._rootPatch(id), ...target } : _rootPatch(id));
    _emit();
  },

  /** Back's last step inside a tab. @returns {boolean} true when it handled the press (else plain goHome runs). */
  back(screen) {
    const id = _state.active;
    if (id === 'home' || !_bound) return false;
    if (screen !== ROOT[id]) { _bound.patchTab(_rootPatch(id)); return true; }
    this.select('home');
    return true;
  },

  /** Any goHome() outside Back: light Home and keep the tab being left. */
  markHome() {
    if (_state.active === 'home') return;
    const leaving = _snapshot();
    if (leaving) _state.slots[_state.active] = leaving;
    _state.active = 'home';
    _emit();
  },

  /** Tests only. */
  _reset(state) { _state = state || { active: 'home', slots: {} }; _bound = null; _subs.clear(); },
};

/** App(): hands BottomTabs the active tab. One call, after useTabs. */
export function useBottomTabs({ activeTab, updateActiveTab }) {
  const ref = React.useRef(null);
  ref.current = { activeTab, updateActiveTab };
  React.useEffect(() => BottomTabs.bind(
    () => ref.current.activeTab,
    (patch) => ref.current.updateActiveTab(patch),
  ), []);
}
