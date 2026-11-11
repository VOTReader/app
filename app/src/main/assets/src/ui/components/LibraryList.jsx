/* ═══════════════════════════════════════════════════════════════════════
   LibraryList — the parts every Library list shares (W2, the UI pass,
   mock v2 library.html). Cluster D (bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Every list (Notes, a notebook, Highlights, Bookmarks, Links, History):
   title in the bar, a search pill, one quiet line "N things · Newest first",
   rows with a menu. These are the pill, the line and the sort sheet; the rows
   are the screens' own (or UiParts' ListRow). CSS: app.css "W2 LIBRARY FAMILY".
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from './UiIcon.jsx';
import { ValueTool } from './UiParts.jsx';
import { SelectSheet } from './SelectField.jsx';
import { countOf } from '../../utils/download-tree.js';

/** The two orders every Library list offers, by the words the bar line shows. */
export const SORT_OPTIONS = Object.freeze([
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
]);

/** @param {string} id @param {ReadonlyArray<{ id: string, label: string }>} [options] @returns {string} */
export const sortLabel = (id, options = SORT_OPTIONS) => (options.find((o) => o.id === id) || options[0]).label;

/**
 * The search pill: a muted icon and a type=search field.
 * @param {{ placeholder: string, label?: string, value: string, onChange: (v: string) => void, className?: string }} props
 */
export function ListSearch({ placeholder, label, value, onChange, className = '' }) {
  return (
    <label className={'ui-field lib-search' + (className ? ' ' + className : '')}>
      <UiIcon name="search" />
      <input type="search" placeholder={placeholder} aria-label={label || placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * The quiet line over a list: how many ("1 note", "3 of 12 notes" while searching) and the sort, which says what it
 * is set to (rule 14) and opens a two-choice sheet.
 * `options` replaces the two orders for a list that has more (Bookmarks: by place, by name).
 * @param {{ count: number, noun: string, of?: number, sort?: string, onSort?: (id: string) => void,
 *   options?: ReadonlyArray<{ id: string, label: string }> }} props
 */
export function ListLine({ count, noun, of, sort, onSort, options = SORT_OPTIONS }) {
  const [picking, setPicking] = React.useState(false);
  const words = of != null && of !== count ? count.toLocaleString('en-US') + ' of ' + countOf(of, noun) : countOf(count, noun);
  return (
    <div className="lib-qline">
      <span className="lib-qline-count">{words}</span>
      {onSort && sort ? (
        <>
          <ValueTool variant="link" name="Sort" value={sortLabel(sort, options)} onClick={() => setPicking(true)} />
          <SelectSheet open={picking} onClose={() => setPicking(false)} title="Sort" value={sort}
            options={[...options]} onChange={onSort} portal />
        </>
      ) : null}
    </div>
  );
}
