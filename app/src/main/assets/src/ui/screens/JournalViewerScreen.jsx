/* ═══════════════════════════════════════════════════════════════════════
   JournalViewerScreen — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Shared utility for rendering inline markup in p/h2/quote text. */
export function jrnRenderInline(text, callbacks) {
  if (!text) return null;
  callbacks = callbacks || {};
  var nodes = [];
  var keyCounter = 0;
  var re = /\*\*([\s\S]+?)\*\*|_([^_\n]+?)_|\{\{ref:([^}]+)\}\}|\[\[(letter|bookmark|journal):([^\]]+)\]\]/g;
  var last = 0;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.substring(last, m.index));
    if (m[1] != null) {
      nodes.push(<strong key={'i' + (keyCounter++)}>{m[1]}</strong>);
    } else if (m[2] != null) {
      nodes.push(<em key={'i' + (keyCounter++)}>{m[2]}</em>);
    } else if (m[3] != null) {
      var ref = m[3].trim();
      nodes.push(
        <span
          key={'i' + (keyCounter++)}
          className="jrn-inline-ref"
          onClick={(function(rr) { return function() { callbacks.onScriptureRef && callbacks.onScriptureRef(rr); }; })(ref)}
        >
          {ref}
        </span>
      );
    } else if (m[4] != null) {
      var kind = m[4]; var data = m[5].trim();
      var label = data;
      if (kind === 'letter') {
        var parts = data.split('/');
        var ctx = (typeof findEntryContext === 'function') ? findEntryContext(parts[1], 'letter') : null;
        if (ctx && ctx.title) label = ctx.title;
      } else if (kind === 'bookmark') {
        var b = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.get(data) : null;
        if (b) label = b.label || 'Bookmark';
      } else if (kind === 'journal') {
        var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(data) : null;
        if (je) label = JournalHelpers.entryDisplayTitle(je) || 'Journal Entry';
      }
      nodes.push(
        <span
          key={'i' + (keyCounter++)}
          className={'jrn-inline-' + kind}
          onClick={(function(k, d) { return function() { callbacks.onInlineLink && callbacks.onInlineLink(k, d); }; })(kind, data)}
        >
          {label}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.substring(last));
  return nodes;
}

export function JournalBlockView({ block, callbacks, entryId, blockIndex }) {
  if (!block) return null;
  callbacks = callbacks || {};
  var b = block;
  var hlKey = entryId != null && blockIndex != null ? ('journal:' + entryId + ':' + blockIndex) : null;
  var hlProps = hlKey ? { 'data-hl-key': hlKey, 'data-hl-dom': true } : {};

  if (b.type === 'p') {
    return <p className="jrn-p" {...hlProps}>{jrnRenderInline(b.text || '', callbacks)}</p>;
  }
  if (b.type === 'h2') {
    return <h2 className="jrn-h2" {...hlProps}>{jrnRenderInline(b.text || '', callbacks)}</h2>;
  }
  if (b.type === 'quote') {
    var qText = b.text || '';
    var qLong = qText.length > 240;
    return (
      <div className="jrn-block-quote">
        {qLong
          ? <JrnExpandable text={qText} threshold={240} className="jrn-block-quote-body" />
          : <div className="jrn-block-quote-body" {...hlProps}>{jrnRenderInline(qText, callbacks)}</div>}
        {b.cite && <div className="jrn-block-quote-cite">{b.cite}</div>}
      </div>
    );
  }
  if (b.type === 'divider') {
    return <div className="jrn-divider">❖  ❖  ❖</div>;
  }
  if (b.type === 'letter-card') {
    var lc = JournalHelpers.resolveLetterCard(b.volKey, b.letterId, b.excerpt);
    if (!lc) return (
      <div className="jrn-embed-letter" onClick={function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); }}>
        <div className="jrn-emb-eyebrow">Letter</div>
        <h4 className="jrn-emb-title">{b.letterId}</h4>
      </div>
    );
    return (
      <div className={'jrn-embed-letter' + (lc.isExcerpt ? ' is-excerpt' : '')} onClick={function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); }} role="button">
        {lc.date && <div className="jrn-emb-date">{lc.date}</div>}
        <div className="jrn-emb-eyebrow">{lc.isExcerpt ? lc.eyebrow + ' · Excerpt' : lc.eyebrow}</div>
        <h4 className="jrn-emb-title">{lc.title}</h4>
        {lc.body && <JrnExpandable text={lc.body} threshold={lc.isExcerpt ? 240 : 180} className={'jrn-emb-body' + (lc.isExcerpt ? ' jrn-emb-excerpt' : '')} />}
      </div>
    );
  }
  if (b.type === 'chapter-card') {
    var cc = JournalHelpers.resolveChapterCard(b.bookId, b.chapter);
    return (
      <div className="jrn-embed-chapter" onClick={function() { callbacks.onChapterCard && callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy); }} role="button">
        <div className="jrn-emb-eyebrow">{cc ? cc.eyebrow : 'Bible'}</div>
        <h4 className="jrn-emb-title">{cc ? cc.title : (b.bookId + ' ' + b.chapter)}</h4>
      </div>
    );
  }
  if (b.type === 'verse-block') {
    var vb = JournalHelpers.resolveVerseBlock(b.ref, b.text);
    var isExcerpt = !!b.partial || !!vb.isExcerpt;
    var verseText = vb.text || '';
    return (
      <div
        className={'jrn-embed-verse' + (isExcerpt ? ' is-excerpt' : '')}
        onClick={function() {
          if (!callbacks.onChapterCard || b.bookId == null || b.chapter == null) return;
          callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy, b.verse, b.verseEnd);
        }}
        role={callbacks.onChapterCard && b.bookId != null ? 'button' : null}
        style={callbacks.onChapterCard && b.bookId != null ? { cursor: 'pointer' } : null}
      >
        <div className="jrn-emb-cite">{isExcerpt ? vb.cite + ' · Excerpt' : vb.cite}</div>
        {verseText
          ? <JrnExpandable text={verseText} threshold={240} className={'jrn-emb-text' + (isExcerpt ? ' jrn-emb-excerpt' : '')} />
          : <div className="jrn-emb-text"><em style={{ color: 'var(--gold-dim)' }}>Verse text not available offline.</em></div>}
      </div>
    );
  }
  if (b.type === 'bookmark-card') {
    var bc = JournalHelpers.resolveBookmarkCard(b.bookmarkId);
    return (
      <div className="jrn-embed-bookmark" onClick={function() { callbacks.onBookmarkCard && callbacks.onBookmarkCard(b.bookmarkId); }} role="button">
        <div className="jrn-emb-eyebrow">{bc ? bc.eyebrow : 'Bookmark'}</div>
        <h4 className="jrn-emb-title">{bc ? bc.title : 'Bookmark'}</h4>
        {bc && bc.body && <JrnExpandable text={bc.body} threshold={200} className="jrn-emb-body" />}
      </div>
    );
  }
  if (b.type === 'note-card') {
    var nc = JournalHelpers.resolveNoteCard(b.noteGroupId);
    return (
      <div className="jrn-embed-note" onClick={function() { callbacks.onNoteCard && callbacks.onNoteCard(b.noteGroupId); }} role="button">
        <div className="jrn-emb-eyebrow">{nc ? nc.eyebrow : 'Note'}</div>
        <h4 className="jrn-emb-title">{nc ? nc.title : 'Note'}</h4>
        {nc && nc.body && <JrnExpandable text={nc.body} threshold={200} className="jrn-emb-body" tapToToggle />}
      </div>
    );
  }
  if (b.type === 'journal-card') {
    var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(b.entryId) : null;
    var jcPreview = je ? JournalHelpers.previewText(je, 320) : '';
    return (
      <div className="jrn-embed-journal" onClick={function() { callbacks.onJournalCard && callbacks.onJournalCard(b.entryId); }} role="button">
        <div className="jrn-emb-eyebrow">Linked Entry</div>
        <h4 className="jrn-emb-title">{je ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled') : '(Deleted)'}</h4>
        {jcPreview && <JrnExpandable text={jcPreview} threshold={180} className="jrn-emb-body" />}
      </div>
    );
  }
  if (b.type === 'notebook-card') {
    var nbc = JournalHelpers.resolveNotebookCard(b.notebookId);
    return (
      <div
        className="jrn-embed-notebook"
        role="button"
        onClick={function() { callbacks.onNotebookCard && callbacks.onNotebookCard(b.notebookId); }}
      >
        <div className="jrn-emb-notebook-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" />
            <polyline points="15 4 15 9 20 9" />
            <line x1="8" y1="14" x2="15" y2="14" />
          </svg>
        </div>
        <div className="jrn-emb-notebook-text">
          <div className="jrn-emb-eyebrow">{nbc ? nbc.eyebrow : 'Notebook'}</div>
          <h4 className="jrn-emb-title">{nbc ? nbc.title : 'Notebook'}</h4>
        </div>
        <span className="jrn-emb-notebook-arrow">›</span>
      </div>
    );
  }
  if (b.type === 'journal-excerpt') {
    var srcTitle = b.sourceJournalTitle || '';
    if (!srcTitle && b.sourceJournalId && typeof JournalStore !== 'undefined') {
      var src = JournalStore.get(b.sourceJournalId);
      if (src) srcTitle = JournalHelpers.entryDisplayTitle(src) || 'Untitled';
    }
    var openSource = function(e) {
      if (e) e.stopPropagation();
      if (b.sourceJournalId && callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId);
    };
    return (
      <div className={'jrn-embed-journal-excerpt' + (b.originType === 'h2' ? ' is-heading' : '')}>
        {srcTitle && <div className="jrn-emb-eyebrow jrn-excerpt-source" onClick={openSource} role="button">{'From: ' + srcTitle}</div>}
        <JrnExpandable
          text={b.text || ''}
          threshold={240}
          className={'jrn-emb-excerpt-body' + (b.originType === 'quote' ? ' is-quote' : '')}
        />
        {b.cite && <div className="jrn-emb-cite">{b.cite}</div>}
      </div>
    );
  }
  if (b.type === 'image') {
    var srcImg = b.sourceJournalTitle || '';
    if (!srcImg && b.sourceJournalId && typeof JournalStore !== 'undefined') {
      var srcEnt = JournalStore.get(b.sourceJournalId);
      if (srcEnt) srcImg = JournalHelpers.entryDisplayTitle(srcEnt) || 'Untitled';
    }
    return (
      <div className={'jrn-linked-wrap' + (b.sourceJournalId ? ' is-linked' : '')}>
        {b.sourceJournalId && srcImg && (
          <div
            className="jrn-emb-eyebrow jrn-excerpt-source"
            onClick={function() { if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId); }}
            role="button"
          >
            {'From: ' + srcImg}
          </div>
        )}
        <JournalImageBlock mediaId={b.mediaId} caption={b.caption} />
      </div>
    );
  }
  if (b.type === 'audio') {
    var srcAud = b.sourceJournalTitle || '';
    if (!srcAud && b.sourceJournalId && typeof JournalStore !== 'undefined') {
      var srcEnt2 = JournalStore.get(b.sourceJournalId);
      if (srcEnt2) srcAud = JournalHelpers.entryDisplayTitle(srcEnt2) || 'Untitled';
    }
    return (
      <div className={'jrn-linked-wrap' + (b.sourceJournalId ? ' is-linked' : '')}>
        {b.sourceJournalId && srcAud && (
          <div
            className="jrn-emb-eyebrow jrn-excerpt-source"
            onClick={function() { if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId); }}
            role="button"
          >
            {'From: ' + srcAud}
          </div>
        )}
        <JournalAudioBlock mediaId={b.mediaId} duration={b.duration} caption={b.caption} samples={b.samples} />
      </div>
    );
  }
  return null;
}

export function JournalImageBlock({ mediaId, caption }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var _src = useState(null);
  var src = _src[0]; var setSrc = _src[1];
  useEffect(function() {
    var cancelled = false;
    if (mediaId && typeof JournalMediaStore !== 'undefined') {
      JournalMediaStore.objectUrl(mediaId).then(function(url) {
        if (!cancelled) setSrc(url || null);
      });
    }
    return function() { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSrc is a tuple-unpacked useState setter (`var _src = useState(null); var setSrc = _src[1]`) — eslint can't trace this back to its useState origin; identity-stable per React invariant.
  }, [mediaId]);

  return (
    <div className="jrn-embed-image">
      {src
        ? <img src={src} alt={caption || ''} />
        : <div style={{ width: '100%', height: '180px', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-dim)', fontStyle: 'italic', fontFamily: 'EB Garamond, serif' }}>Image unavailable</div>}
      {caption && <div className="jrn-img-caption" style={{ padding: '8px 14px' }}>{caption}</div>}
    </div>
  );
}

export function JournalAudioBlock(props) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var mediaId = props.mediaId;
  var duration = props.duration;
  var caption = props.caption;
  var samples = props.samples;
  var editable = !!props.editable;
  var confirming = !!props.confirming;

  var _src = useState(null);
  var src = _src[0]; var setSrc = _src[1];
  var audioRef = useRef(null);
  var _playing = useState(false);
  var playing = _playing[0]; var setPlaying = _playing[1];
  var _progress = useState(0);
  var progress = _progress[0]; var setProgress = _progress[1];
  var _curTime = useState(0);
  var curTime = _curTime[0]; var setCurTime = _curTime[1];

  useEffect(function() {
    var cancelled = false;
    if (mediaId && typeof JournalMediaStore !== 'undefined') {
      JournalMediaStore.objectUrl(mediaId).then(function(url) {
        if (!cancelled) setSrc(url || null);
      });
    }
    return function() { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSrc is a tuple-unpacked useState setter (`var _src = useState(null); var setSrc = _src[1]`) — eslint can't trace this back to its useState origin; identity-stable per React invariant.
  }, [mediaId]);

  function toggle(e) {
    if (e) { e.stopPropagation(); }
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  function onTimeUpdate() {
    var a = audioRef.current;
    if (!a) return;
    var dur = duration || a.duration || 0;
    setCurTime(a.currentTime || 0);
    setProgress(dur > 0 ? Math.min(1, (a.currentTime || 0) / dur) : 0);
  }

  function seekFromEvent(e) {
    if (!audioRef.current) return;
    var rect = e.currentTarget.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var ratio = Math.max(0, Math.min(1, x / rect.width));
    var dur = duration || audioRef.current.duration || 0;
    if (dur > 0) {
      audioRef.current.currentTime = ratio * dur;
      setProgress(ratio);
      setCurTime(ratio * dur);
    }
  }

  var barCount = 40;
  var bars = [];
  for (var i = 0; i < barCount; i++) {
    var h;
    if (samples && samples.length) {
      var idx = Math.min(samples.length - 1, Math.floor(i * samples.length / barCount));
      h = Math.max(4, Math.min(22, Math.round(samples[idx] * 22)));
    } else {
      h = 6 + Math.round(Math.abs(Math.sin(i * 0.6 + i * 0.13)) * 16);
    }
    bars.push(
      <div
        key={i}
        className={'bar' + (progress > 0 && (i / barCount) <= progress ? ' is-played' : '')}
        style={{ height: h + 'px' }}
      />
    );
  }

  // Editable mode: a single × icon button at the right of the block; tap
  // it to flip the parent's `confirming` prop on, which collapses the
  // whole block to a ConfirmStrip banner (rendered below in the return).
  var deleteUI = editable && !confirming ? (
    <button
      className="jrn-aud-delete"
      title="Delete"
      aria-label="Delete"
      onClick={function(e) { e.stopPropagation(); props.onRequestDelete && props.onRequestDelete(); }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  ) : null;

  var dur = duration || 0;
  var timeStr = JournalHelpers.formatDuration(curTime || 0) + ' / ' + JournalHelpers.formatDuration(dur);

  // When the user has tapped delete, the whole audio block collapses to a
  // ConfirmStrip banner so the standardized Cancel / Yes, remove buttons
  // are unambiguous. The <audio> element below the conditional STAYS
  // rendered so playback state (currentTime, paused/playing) survives a
  // Cancel — only the visible chrome changes.
  return (
    <div className={'jrn-embed-audio' + (editable ? ' is-editable' : '')}>
      {editable && confirming ? (
        <ConfirmStrip
          className="jrn-aud-confirm"
          question="Remove this voice memo?"
          yesLabel="Yes, remove"
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      ) : (
        <>
          <button className="jrn-aud-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              {playing
                ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                : <path d="M6 3v18l16-9z" />}
            </svg>
          </button>
          <div className="jrn-aud-body">
            <div
              className="jrn-aud-waveform"
              onClick={seekFromEvent}
              role="slider"
              aria-label="Seek"
              style={{ cursor: 'pointer' }}
            >
              {bars}
            </div>
            <div className="jrn-aud-meta">
              <span>{caption || 'Voice memo'}</span>
              <span>{timeStr}</span>
            </div>
          </div>
          {deleteUI}
        </>
      )}
      {src && (
        <audio
          ref={audioRef}
          src={src}
          style={{ display: 'none' }}
          onPlay={function() { setPlaying(true); }}
          onPause={function() { setPlaying(false); }}
          onEnded={function() { setPlaying(false); setProgress(0); setCurTime(0); }}
          onTimeUpdate={onTimeUpdate}
        />
      )}
    </div>
  );
}

export function jrnPinIcon(filled) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" />
      <path d="M8 12 L3 19" stroke="currentColor" fill="none" />
    </svg>
  );
}

export function JournalViewerScreen(props) {
  var useState = React.useState;

  var entryId = props.entryId;
  var onBack = props.onBack;
  var onEdit = props.onEdit;
  var onNavigateToLink = props.onNavigateToLink;
  var onOpenJournalEntry = props.onOpenJournalEntry;
  var onOpenNotebook = props.onOpenNotebook;

  // Subscribe to JournalStore — viewer re-renders when entry mutates.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return JournalStore.subscribe(cb); }, []),
    function() { return JournalStore.getVersion(); }
  );
  var entry = entryId ? JournalStore.get(entryId) : null;

  var _confirmStep = useState(0);
  var confirmStep = _confirmStep[0]; var setConfirmStep = _confirmStep[1];
  var _typedDelete = useState('');
  var typedDelete = _typedDelete[0]; var setTypedDelete = _typedDelete[1];

  function bump() { if (window.__bumpHlTick) window.__bumpHlTick(); }

  function startDelete() { setConfirmStep(1); setTypedDelete(''); }
  function nextDeleteStep() {
    if (confirmStep < 3) setConfirmStep(confirmStep + 1);
  }
  function cancelDelete() { setConfirmStep(0); setTypedDelete(''); }

  if (typeof window !== 'undefined' && !window.__journalBackStack) window.__journalBackStack = [];
  var _jstack = (typeof window !== 'undefined' && window.__journalBackStack) || [];
  var jrnBack = (_jstack.length && entry && _jstack[_jstack.length - 1].destId === entry.id)
    ? _jstack[_jstack.length - 1] : null;
  function jrnGoBack() {
    if (jrnBack && _jstack.length) {
      _jstack.pop();
      if (onOpenJournalEntry) { onOpenJournalEntry(jrnBack.fromId); return; }
    }
    onBack && onBack();
  }

  function buildNavChildren(extras) {
    return LibraryNav({
      onBack: jrnGoBack,
      onSearch: props.onSearch,
      onHistory: props.onHistory,
      onSettings: props.onSettings,
      theme: props.theme,
      onThemeChange: props.onThemeChange,
      rightExtras: (extras && extras.right) || null
    });
  }

  if (!entry) {
    return (
      <ScreenLayout navChildren={buildNavChildren()}>
        <div className="jrn-empty">
          <div className="jrn-empty-title">Entry Not Found</div>
          <div className="jrn-empty-hint">This journal entry may have been deleted.</div>
        </div>
      </ScreenLayout>
    );
  }

  var sourceMeta = { sourceLetterTitle: 'My Journal · ' + (JournalHelpers.entryDisplayTitle(entry) || 'Entry') };

  var callbacks = {
    onLetterCard: function(volKey, letterId) {
      var ep = JournalHelpers.refKeyToEndpoint('letter:' + volKey + '/' + letterId);
      if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
    },
    onChapterCard: function(bookId, chapter, isStudy, verse, verseEnd) {
      var endpoint = { type: isStudy ? 'study' : 'bible', bookId: bookId, chapter: chapter };
      if (verse != null) endpoint.verse = verse;
      if (verseEnd != null) endpoint.verseEnd = verseEnd;
      onNavigateToLink && onNavigateToLink(endpoint, sourceMeta);
    },
    onBookmarkCard: function(bid) {
      var ep = JournalHelpers.refKeyToEndpoint('bookmark:' + bid);
      if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
    },
    onNoteCard: function(gid) {
      var ep = JournalHelpers.refKeyToEndpoint('note:' + gid);
      if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
    },
    onJournalCard: function(eid) {
      if (eid && entry && eid !== entry.id && typeof window !== 'undefined') {
        if (!window.__journalBackStack) window.__journalBackStack = [];
        if (window.__journalBackStack.length > 20) window.__journalBackStack.shift();
        window.__journalBackStack.push({
          destId: eid,
          fromId: entry.id,
          fromTitle: JournalHelpers.entryDisplayTitle(entry) || 'Untitled'
        });
      }
      onOpenJournalEntry && onOpenJournalEntry(eid);
    },
    onNotebookCard: function(nbId) {
      if (onOpenNotebook) onOpenNotebook(nbId);
    },
    onScriptureRef: function(ref) {
      if (typeof window.__openScriptureSheet === 'function') {
        window.__openScriptureSheet(ref);
      }
    },
    onInlineLink: function(kind, data) {
      if (kind === 'letter') {
        var parts = data.split('/');
        callbacks.onLetterCard(parts[0], parts[1]);
      } else if (kind === 'bookmark') {
        callbacks.onBookmarkCard(data);
      } else if (kind === 'journal') {
        callbacks.onJournalCard(data);
      }
    }
  };

  function togglePin() {
    JournalStore.togglePin(entry.id);
    bump();
  }
  function doDelete() {
    JournalStore.remove(entry.id);
    bump();
    onBack && onBack();
  }

  var navExtras = (
    <>
      <button
        className={'nav-search-btn jrn-pin-btn' + (entry.pinned ? ' is-pinned' : '')}
        onClick={togglePin}
        title={entry.pinned ? 'Unpin entry' : 'Pin entry'}
        aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
        aria-pressed={!!entry.pinned}
      >
        {jrnPinIcon(!!entry.pinned)}
      </button>
      <button
        className="nav-search-btn jrn-del-btn"
        onClick={startDelete}
        title="Delete entry"
        aria-label="Delete entry"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </>
  );

  function renderDeleteBanner() {
    if (confirmStep === 0) return null;
    var stepLabel = confirmStep === 1 ? 'Step 1 of 3'
      : confirmStep === 2 ? 'Step 2 of 3'
      : 'Step 3 of 3';
    var question = confirmStep === 1 ? 'Delete this entry?'
      : confirmStep === 2 ? 'Are you sure? This cannot be undone.'
      : 'Type DELETE to permanently remove this entry.';
    return (
      <div className={'jrn-tripledel jrn-tripledel-step' + confirmStep}>
        <div className="jrn-tripledel-step-label">{stepLabel}</div>
        <div className="jrn-tripledel-question">{question}</div>
        {(function () {
          var summary = (typeof JournalStore !== 'undefined' && JournalStore.associatedDataSummary)
            ? JournalStore.associatedDataSummary(entryId) : null;
          return summary && (
            <div className="jrn-tripledel-cascade">
              {'This will also permanently delete ' + summary + ' you placed inside this entry.'}
            </div>
          );
        })()}
        {confirmStep === 3 && (
          <input
            type="text"
            className="jrn-tripledel-input"
            placeholder="Type DELETE"
            value={typedDelete}
            autoFocus
            onChange={function(e) { setTypedDelete(e.target.value); }}
          />
        )}
        <div className="jrn-tripledel-actions">
          <button className="jrn-tripledel-cancel" onClick={cancelDelete}>Cancel</button>
          {confirmStep < 3 && (
            <button className="jrn-tripledel-next" onClick={nextDeleteStep}>
              {confirmStep === 1 ? 'Continue' : 'I am sure'}
            </button>
          )}
          {confirmStep === 3 && (
            <button
              className="jrn-tripledel-final"
              onClick={doDelete}
              disabled={typedDelete.trim().toUpperCase() !== 'DELETE'}
            >Delete forever</button>
          )}
        </div>
      </div>
    );
  }

  var displayTitle = JournalHelpers.entryDisplayTitle(entry);

  return (
    <ScreenLayout navChildren={buildNavChildren({ right: navExtras })}>
      <div className="jrn-viewer">
        {jrnBack && (
          <div className="back-hint-row">
            <button className="back-hint-pill" onClick={jrnGoBack} aria-label={'Back to ' + jrnBack.fromTitle}>
              <span className="back-hint-arrow">‹</span>Back to{' '}
              <span className="back-hint-title">{jrnBack.fromTitle}</span>
            </button>
          </div>
        )}
        <div className="jrn-viewer-meta">
          <h1 className={'jrn-viewer-title' + (displayTitle ? '' : ' untitled')}>{displayTitle || 'Untitled'}</h1>
          <div className="jrn-viewer-date">
            {JournalHelpers.longDate(entry.created)}
            <span className="jrn-card-time">{' · ' + JournalHelpers.shortTime(entry.created)}</span>
            {entry.pinned && ' · Pinned'}
          </div>
        </div>
        {renderDeleteBanner()}
        <div className="jrn-viewer-blocks">
          {(entry.blocks || []).map(function(b, i) {
            return (
              <JournalBlockView
                key={b.id}
                block={b}
                callbacks={callbacks}
                entryId={entry.id}
                blockIndex={i}
              />
            );
          })}
        </div>
      </div>
      <button
        className="jrn-fab jrn-fab-action is-edit"
        onClick={onEdit}
        title="Edit entry"
        aria-label="Edit entry"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
    </ScreenLayout>
  );
}
