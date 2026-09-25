/*
   ReadWithMusic -- "Letters read with music" (README §3.8, L7; picture final-06).

   A frame of the Songs screen ({ k: 'readings' }). These are READINGS, not
   songs: letters read aloud over music (reader M, now labelled "Read with
   music"). The list is the catalog's `readings` joined with every letter the
   app ships a reader-M rendition of (AUDIO_ALTERNATES, or AUDIO_MANIFEST where
   M is the only reader). A row's ▶ plays the READING with M as the start
   voice, so read-along paints and the queue carries on through the collection
   like any letter; READ-ALONG plays it and opens the letter to read with it.

   Bundle-h; the player, the catalog and the song pieces are bundle-d globals.
*/

/** Reading order of the collections, for the list's order. */
const CHAIN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy'];

/** @param {string} key @returns {{ volKey: string, id: string }} */
function splitKey(key) {
  const at = key.indexOf(':');
  return { volKey: key.slice(0, at), id: key.slice(at + 1) };
}

/** "the-water-of-siloam" → "The Water Of Siloam", until the letters land. @param {string} id */
function slugTitle(id) {
  return id.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/**
 * Every letter read with music, in reading order, with its length when the
 * catalog knows it (a two-part letter's parts are summed).
 * @returns {{ key: string, volKey: string, id: string, title: string, colLabel: string, index: number, d: number }[]}
 */
export function readingLetters() {
  /** @type {string[]} */
  const keys = [];
  /** @type {Record<string, number>} */
  const dur = {};
  const add = (key, d) => {
    if (typeof key !== 'string' || key.indexOf(':') < 1) return;
    if (keys.indexOf(key) < 0) { keys.push(key); dur[key] = 0; }
    dur[key] += Number(d) || 0;
  };
  const cat = typeof SongCatalog !== 'undefined' && SongCatalog.loaded ? SongCatalog : null;
  if (cat) for (const r of cat.readings()) add(r.key, r.d);
  const g = /** @type {any} */ (globalThis);
  const alternates = g.AUDIO_ALTERNATES || {};
  for (const key of Object.keys(alternates)) {
    const list = alternates[key];
    if (Array.isArray(list) && list.some((r) => Array.isArray(r) && r[0] === 'M')) add(key, 0);
  }
  const manifest = g.AUDIO_MANIFEST || {};
  for (const key of Object.keys(manifest)) {
    const rows = manifest[key];
    if (Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && r[1] === 'M')) add(key, 0);
  }
  const reg = g.COL_BY_KEY;
  return keys.map((key) => {
    const { volKey, id } = splitKey(key);
    const col = reg && typeof reg.get === 'function' ? reg.get(volKey) : null;
    const letters = col && typeof g.colLetterArr === 'function' ? g.colLetterArr(col) : [];
    const index = Array.isArray(letters) ? letters.findIndex((l) => l && l.id === id) : -1;
    const letter = index >= 0 ? letters[index] : null;
    return { key, volKey, id, title: (letter && letter.title) || slugTitle(id), colLabel: (col && col.label) || '', index, d: dur[key] };
  }).filter((r) => CHAIN.indexOf(r.volKey) >= 0).sort((a, b) => {
    const ca = CHAIN.indexOf(a.volKey), cb = CHAIN.indexOf(b.volKey);
    return ca !== cb ? ca - cb : a.index - b.index;
  });
}

/**
 * @param {{ state: any }} props
 */
export function ReadWithMusic({ state }) {
  const rows = readingLetters();
  const cur = Array.isArray(state.queue) ? state.queue[state.qi] : null;
  const active = playerIsActive(state);
  const play = (row) => {
    if (cur && cur.key === row.key && cur.readerCode === 'M') { AudioPlayer.toggle(); return; }
    AudioPlayer.playLetter({ volKey: row.volKey, letter: { id: row.id, title: row.title }, collectionLabel: row.colLabel || null, reader: 'M' });
  };
  const readAlong = (row) => {
    if (!(cur && cur.key === row.key && cur.readerCode === 'M' && active)) play(row);
    if (typeof window.__openAudioText === 'function') window.__openAudioText({ key: row.key, title: row.title });
  };
  return (
    <>
      <header className="songs-hero songs-list-hero">
        <div className="songs-eyebrow">Read with music</div>
        <h1>Letters read with music</h1>
        <p className="songs-intro">Letters of The Volumes, read aloud over music. The words light up as they are read.</p>
      </header>
      <section className="songs-section reading-list" aria-label="Letters read with music">
        {rows.length ? rows.map((row) => {
          const here = !!(cur && cur.key === row.key && cur.readerCode === 'M');
          return (
            <div key={row.key} className={'reading-row' + (here ? ' is-current' : '')}>
              <button type="button" className="songs-row-main reading-row-main" onClick={() => play(row)}>
                <span className="songs-row-copy"><strong>{row.title}</strong><small>{row.colLabel}</small></span>
                {row.d ? <span className="songs-row-len">{songClock(row.d)}</span> : null}
              </button>
              <button type="button" className="reading-along" onClick={() => readAlong(row)} aria-label={'Read along with ' + row.title}>Read-along</button>
              <SongPlayButton playing={here && active} label={row.title + ', read with music'} onClick={() => play(row)} />
            </div>
          );
        }) : <p className="songs-empty">The letters are still loading.</p>}
      </section>
    </>
  );
}
