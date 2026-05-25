/* ═══════════════════════════════════════════════════════════════════════
   HolyDaysPlaylistHeader — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The audio/video playlist buttons that sit above the Holy Days letter
   index — extracted from the inline `holy-days-index` ROUTES entry in
   app.jsx (Phase 2 P9c). Reads HOLY_DAYS_META from the global scope
   and renders nothing if neither playlist URL is set.
   ═══════════════════════════════════════════════════════════════════════ */

export function HolyDaysPlaylistHeader() {
  if (typeof HOLY_DAYS_META === 'undefined') return null;
  if (!HOLY_DAYS_META.audioPlaylist && !HOLY_DAYS_META.videoPlaylist) return null;
  return (
    <div className="hd-playlists">
      {HOLY_DAYS_META.audioPlaylist && (
        <a className="hd-playlist-btn" href={HOLY_DAYS_META.audioPlaylist} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span className="hd-playlist-label">Audio Playlist</span>
          <span className="hd-playlist-sub">Listen on Bandcamp</span>
        </a>
      )}
      {HOLY_DAYS_META.videoPlaylist && (
        <a className="hd-playlist-btn" href={HOLY_DAYS_META.videoPlaylist} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span className="hd-playlist-label">Video Playlist</span>
          <span className="hd-playlist-sub">Watch on YouTube</span>
        </a>
      )}
    </div>
  );
}
