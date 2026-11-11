/* ═══════════════════════════════════════════════════════════════════════
   settings-find — Cluster D (esbuild bundle-d.js)
   WS2 settings (st-find, U 8.7 "Search: index each row's label, description and synonyms; results are rows with
   their place and a live control"). While the Settings find field holds words, every group renders its body inside
   this context; each row asks whether its own words match and, when they do, draws its place above its name.
   Outside the find (no provider) every row draws as always.
   ═══════════════════════════════════════════════════════════════════════ */

import { SectionLabel } from './UiParts.jsx';

/** @typedef {{ words: string[], group: string, place: string }} SettingsFind */

/** @type {any} */
let ctx = null;
/** The one context (made on first use: React is a page global, not an import, in this bundle). */
export function settingsFindContext() {
  if (!ctx) ctx = React.createContext(/** @type {SettingsFind | null} */ (null));
  return ctx;
}

/** Lower-case word list of any text: "Wi-Fi" gives wi, fi and wifi; quotes and apostrophes drop. @param {string} text */
export function findWordsOf(text) {
  const out = [];
  for (const chunk of String(text || '').toLowerCase().replace(/[’'“”"]/g, '').split(/\s+/)) {
    const parts = chunk.split(/[^a-z0-9]+/).filter(Boolean);
    out.push(...parts);
    if (parts.length > 1) out.push(parts.join(''));
  }
  return out;
}

/** True when every typed word starts one of the row's words (s23.3: a raw substring let "a" light every row).
 * @param {string[]} typed @param {string} text */
export function findMatches(typed, text) {
  const words = findWordsOf(text);
  return typed.every((q) => words.some((w) => w.startsWith(q)));
}

/** A row's verdict: show it, and the place to draw above its name while finding (null outside the find).
 * @param {string} text the row's name, line and synonyms */
export function useSettingsFind(text) {
  const find = React.useContext(settingsFindContext());
  if (!find) return { show: true, place: null };
  return { show: findMatches(find.words, text), place: find.place };
}

/** A section of a settings screen: its label, then a card of rows. While finding, the label hides and the rows
 * inside say "Group · Section" as their place. @param {{ label: string, children: any, className?: string }} props */
export function SettingsSection({ label, children, className = '' }) {
  const Ctx = settingsFindContext();
  const find = React.useContext(Ctx);
  const card = <div className={'settings-card' + (className ? ' ' + className : '')}>{children}</div>;
  if (find) return <Ctx.Provider value={{ ...find, place: find.group + ' · ' + label }}>{card}</Ctx.Provider>;
  return <><SectionLabel>{label}</SectionLabel>{card}</>;
}

/** Anything that is not a row (the Theme control, the text size card) hides unless its words match.
 * @param {{ text: string, children: any }} props */
export function Findable({ text, children }) {
  const f = useSettingsFind(text);
  if (!f.show) return null;
  if (!f.place) return children;
  return <div className="ws2-found" data-found=""><span className="ws2-place">{f.place}</span>{children}</div>;
}
