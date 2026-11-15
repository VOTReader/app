/* ═══════════════════════════════════════════════════════════════════════
   VolumesHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The Volumes of Truth in the UI pass's parts (vot-ui, 2026-11-15): the
   centred hero the Studies list has, then three grouped lists, The Seven
   Volumes, the Collections, and A Return to The Garden. A row is the name
   in the serif and its facts in the sans; a collection with nothing in it
   yet says "Coming soon" and opens nothing. Before, two columns of bordered
   tiles under an ornament, all one weight. */

import { GARDEN_TOTAL } from '../../utils/garden.js';
import { ListGroup, ListRow } from '../components/UiParts.jsx';
import { BarAction } from '../components/RootNav.jsx';
import { countOf } from '../../utils/download-tree.js';
import { VOLUME_YEARS } from '../../utils/volume-facts.js';

export function VolumesHome({ onSelect, onBack, onSearch }) {
  // Q8.3: VOT corpus is lazy. Subscribe + pre-fire on mount so the
  // letter-count details fill in once bundle-a-vot.js loads. Use
  // colLetterArr (lazy-safe) for all collections — returns [] when
  // the corresponding global isn't defined yet.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') {
      window.__loadVotCorpus().catch((e) => console.warn('VOT corpus pre-load failed', e));
    }
  }, []);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  const _votReady = (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.loaded : false;
  const _cnt = (k) => colLetterArr(COL_BY_KEY.get(k)).length;
  // Q8.3: while corpus is still loading, NO tile is locked (we know they all
  // exist — clicking lands on a "Loading…" route until data arrives).
  // Once loaded, `locked` reflects actual content state (a collection with 0
  // letters is "Coming Soon").
  const _locked = (k) => _votReady && _cnt(k) === 0;
  /** Its facts: how many it holds, then what it is; before the corpus lands, only what it is. */
  const facts = (k, noun, what) => [_cnt(k) > 0 ? countOf(_cnt(k), noun) : '', what].filter(Boolean).join(' · ');
  // Its count like every other row's (catalogue row 17, 2026-09-12): the collection's own letter list, never a typed number.
  const collections = [
    { id: 'lords-rebuke', k: 'rebuke', title: "The Lord's Rebuke", sub: facts('rebuke', 'letter', 'Correction & Warning') },
    { id: 'words-to-live-by-1', k: 'wtlb1', title: 'Words To Live By: Part One', sub: facts('wtlb1', 'entry', 'Words of Wisdom') },
    { id: 'words-to-live-by-2', k: 'wtlb2', title: 'Words To Live By: Part Two', sub: facts('wtlb2', 'entry', 'More Words of Wisdom') },
    { id: 'the-blessed', k: 'blessed', title: 'The Blessed', sub: facts('blessed', 'entry', 'Blessings & Promises') },
    { id: 'little-flock', k: 'flock', title: "Letters to The Lord's Little Flock", sub: facts('flock', 'letter', _cnt('flock') > 0 ? '' : 'Personal Instruction') },
    { id: 'letters-timothy', k: 'timothy', title: 'Letters from Timothy', sub: facts('timothy', 'letter', _cnt('timothy') > 0 ? '' : "A Servant's Pen") },
    { id: 'holy-days', k: 'holydays', title: 'Regarding The Holy Days', sub: facts('holydays', 'letter', 'Appointed Times') },
  ];
  const NAMES = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
  const volumes = NAMES.map((n) => {
    const k = n.toLowerCase();
    return { id: 'volume-' + k, k, title: 'Volume ' + n, sub: facts(k, 'letter', VOLUME_YEARS[k]) };
  });

  /** One row; a locked one says so and opens nothing. */
  const row = (v) => (
    <ListRow key={v.id} noLead className={'sty-row' + (_locked(v.k) ? ' is-locked' : '')} title={v.title} meta={_locked(v.k) ? [v.sub, 'Coming soon'].filter(Boolean).join(' · ') : v.sub}
      onClick={_locked(v.k) ? undefined : () => onSelect(v.id)} />
  );

  return (
    <ScreenLayout utility={{
      title: '', onBack, backLabel: 'Back to Home',
      actions: [onSearch ? <BarAction key="s" icon="search" label="Search" onClick={onSearch} /> : null],
    }}>
      <div className="sty">
        <header className="sty-hero">
          <div className="root-eyebrow">Prophetic Letters</div>
          <h1>The Volumes of Truth</h1>
          <p>Letters from The Lord, Our God and Savior</p>
        </header>
        <ListGroup label="The Seven Volumes">{volumes.map(row)}</ListGroup>
        <ListGroup label="Collections">{collections.map(row)}</ListGroup>
        <ListGroup label="A Visual Journey">
          <ListRow noLead className="sty-row" title="A Return to The Garden" meta={countOf(GARDEN_TOTAL, 'page')} onClick={() => onSelect('garden')} />
        </ListGroup>
      </div>
    </ScreenLayout>
  );
}
