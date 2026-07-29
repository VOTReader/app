/* ═══════════════════════════════════════════════════════════════════════
   HolyDaysIndex — Cluster D (esbuild bundle-d.js) — FABLE5 [12]
   ═══════════════════════════════════════════════════════════════════════
   The Holy Days index with a List | Year view toggle. List = the shared
   VolumeLetterIndex exactly as before. Year = a vertical timeline of the
   SAME curated entries in their existing order ("revealed by their
   order" — the collection's own words): a gold rail, one node per
   entry, title + source label, tap-through to the entry. ZERO new
   content — this is purely a navigation view over HOLY_DAYS; nothing
   here authors, reorders, or annotates the data.

   Props: `letters` (the colLetterArr-mapped entries, date/sourceLabel
   already resolved) + the colIdxProps('holydays') spread that
   VolumeLetterIndex takes (onSelect / currentLetter / isRead /
   markAsReadEnabled). */

export function HolyDaysIndex({ letters, ...idxProps }) {
  const [view, setView] = React.useState('list'); // 'list' | 'year'
  return (
    <>
      <HolyDaysPlaylistHeader />
      <div className="hd-view-toggle" role="tablist" aria-label="Holy Days view">
        <button
          className={'hd-view-btn' + (view === 'list' ? ' active' : '')}
          role="tab" aria-selected={view === 'list'}
          onClick={() => setView('list')}
        >List</button>
        <button
          className={'hd-view-btn' + (view === 'year' ? ' active' : '')}
          role="tab" aria-selected={view === 'year'}
          onClick={() => setView('year')}
        >Year view</button>
      </div>
      {view === 'list' ? (
        <VolumeLetterIndex
          volumeTitle="Regarding The Holy Days"
          eyebrow="The Appointed Times"
          letters={letters}
          {...idxProps}
        />
      ) : (
        <div className="hd-timeline">
          <div className="hd-timeline-eyebrow">The Appointed Times</div>
          <h1 className="hd-timeline-title">Regarding The Holy Days</h1>
          <div className="hd-timeline-rail">
            {letters.map((e) => (
              <button
                key={e.id}
                className={'hd-timeline-row' + (idxProps.currentLetter === e.id ? ' current' : '')}
                onClick={() => idxProps.onSelect(e.id)}
              >
                <span className="hd-timeline-node" aria-hidden="true">
                  <span className="hd-timeline-dot" />
                </span>
                <span className="hd-timeline-body">
                  <span className="hd-timeline-num">{e.num}</span>
                  <span className="hd-timeline-name">
                    {e.title}
                    {idxProps.markAsReadEnabled && idxProps.isRead && idxProps.isRead(e.id) && (
                      <span className="hd-timeline-read" aria-label="Read">✓</span>
                    )}
                  </span>
                  {e.date ? <span className="hd-timeline-src">{e.date}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
