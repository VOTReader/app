/* ═══════════════════════════════════════════════════════════════════════
   JournalViewerScreen — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Shared utility for rendering inline markup in p/h2/quote text. */
function jrnInteractiveProps(activate, role) {
  var semanticRole = role || 'button';
  return {
    role: semanticRole,
    tabIndex: 0,
    onClick: activate,
    onKeyDown: function(e) {
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && !(semanticRole === 'button' && e.key === ' ')) return;
      e.preventDefault();
      activate(e);
    },
  };
}

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
      // A COMPOUND chip ("Isaiah 40:13; Romans 11:34" — live in the-blessed.js)
      // used to be one span whose tap silently did nothing, because the handler
      // called parseRefStr on the whole string. Each part is now its own tap
      // target carrying its OWN single ref. The separators (and any junk chunk)
      // stay PLAIN TEXT at their original offsets, so the block's textContent is
      // character-identical — journal blocks are annotatable (journal:<id>:<idx>
      // hlKeys) and highlight offsets walk this DOM.
      var refParts = (typeof splitCompoundRef === 'function') ? splitCompoundRef(ref) : [];
      // Take the per-chunk path only for an actual list AND only when the
      // splitter resolved something — a ref whose ONLY comma lives inside a
      // parenthetical ("John 3:16 (NIV, 1984)") resolves nothing chunk-wise and
      // falls back to the whole-string chip, which parses it correctly.
      var refChunks = (refParts.length && /[;,]/.test(ref)) ? ref.split(/([;,])/) : null;
      if (refChunks) {
        refChunks.forEach(function(chunk, ci) {
          if (ci % 2) { nodes.push(chunk); return; }             // the ';' / ',' itself
          var part = refParts.find(function(p) { return p.index === ci / 2; });
          var lead = /^\s*/.exec(chunk)[0];
          var body = chunk.trim();
          if (!part || !body) { nodes.push(chunk); return; }     // unparseable chunk
          if (lead) nodes.push(lead);
          nodes.push(
            <span
              key={'i' + (keyCounter++)}
              className="jrn-inline-ref"
              {...jrnInteractiveProps((function(rr) { return function() { callbacks.onScriptureRef && callbacks.onScriptureRef(rr); }; })(part.ref), 'link')}
            >
              {body}
            </span>
          );
          var trail = chunk.slice(lead.length + body.length);
          if (trail) nodes.push(trail);
        });
      } else {
        // Single ref: label stays the source string, but the TAP carries the
        // canonical part when there is one — so a cross-chapter span
        // ("Revelation 21:1-22:5"), which parseRefStr alone returns null for,
        // still opens at its start verse instead of doing nothing.
        var soleRef = refParts.length === 1 ? refParts[0].ref : ref;
        nodes.push(
          <span
            key={'i' + (keyCounter++)}
            className="jrn-inline-ref"
            {...jrnInteractiveProps((function(rr) { return function() { callbacks.onScriptureRef && callbacks.onScriptureRef(rr); }; })(soleRef), 'link')}
          >
            {ref}
          </span>
        );
      }
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
          {...jrnInteractiveProps((function(k, d) { return function() { callbacks.onInlineLink && callbacks.onInlineLink(k, d); }; })(kind, data), 'link')}
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

/**
 * @param {{ key?: any, block: any, callbacks: any, entryId: any, blockIndex: any }} props
 */
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
      <div className="jrn-embed-letter" {...jrnInteractiveProps(function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); })}>
        <div className="jrn-emb-eyebrow">Letter</div>
        <h4 className="jrn-emb-title">{b.letterId}</h4>
        <span className="jrn-emb-arrow" aria-hidden="true">›</span>
      </div>
    );
    return (
      <div className={'jrn-embed-letter' + (lc.isExcerpt ? ' is-excerpt' : '')} {...jrnInteractiveProps(function() { callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId); })}>
        {lc.date && <div className="jrn-emb-date">{lc.date}</div>}
        <div className="jrn-emb-eyebrow">{lc.isExcerpt ? lc.eyebrow + ' · Excerpt' : lc.eyebrow}</div>
        <h4 className="jrn-emb-title">{lc.title}</h4>
        {lc.body && <JrnExpandable text={lc.body} threshold={lc.isExcerpt ? 240 : 180} className={'jrn-emb-body' + (lc.isExcerpt ? ' jrn-emb-excerpt' : '')} />}
        <span className="jrn-emb-arrow" aria-hidden="true">›</span>
      </div>
    );
  }
  if (b.type === 'chapter-card') {
    var cc = JournalHelpers.resolveChapterCard(b.bookId, b.chapter);
    return (
      <div className="jrn-embed-chapter" {...jrnInteractiveProps(function() { callbacks.onChapterCard && callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy); })}>
        <div className="jrn-emb-eyebrow">{cc ? cc.eyebrow : 'Bible'}</div>
        <h4 className="jrn-emb-title">{cc ? cc.title : (b.bookId + ' ' + b.chapter)}</h4>
        <span className="jrn-emb-arrow" aria-hidden="true">›</span>
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
        {...(callbacks.onChapterCard && b.bookId != null ? jrnInteractiveProps(function() {
          if (!callbacks.onChapterCard || b.bookId == null || b.chapter == null) return;
          callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy, b.verse, b.verseEnd);
        }) : {})}
        style={callbacks.onChapterCard && b.bookId != null ? { cursor: 'pointer' } : null}
      >
        <div className="jrn-emb-cite">{isExcerpt ? vb.cite + ' · Excerpt' : vb.cite}</div>
        {verseText
          ? <JrnExpandable text={verseText} threshold={240} className={'jrn-emb-text' + (isExcerpt ? ' jrn-emb-excerpt' : '')} />
          : <div className="jrn-emb-text"><em style={{ color: 'var(--gold-dim)' }}>Verse text not available offline.</em></div>}
        {b.bookId != null && <span className="jrn-emb-arrow" aria-hidden="true">›</span>}
      </div>
    );
  }
  if (b.type === 'bookmark-card') {
    var bc = JournalHelpers.resolveBookmarkCard(b.bookmarkId);
    return (
      <div className="jrn-embed-bookmark" {...jrnInteractiveProps(function() { callbacks.onBookmarkCard && callbacks.onBookmarkCard(b.bookmarkId); })}>
        <div className="jrn-emb-eyebrow">{bc ? bc.eyebrow : 'Bookmark'}</div>
        <h4 className="jrn-emb-title">{bc ? bc.title : 'Bookmark'}</h4>
        {bc && bc.body && <JrnExpandable text={bc.body} threshold={200} className="jrn-emb-body" />}
        <span className="jrn-emb-arrow" aria-hidden="true">›</span>
      </div>
    );
  }
  if (b.type === 'note-card') {
    var nc = JournalHelpers.resolveNoteCard(b.noteGroupId);
    return (
      <div className="jrn-embed-note" {...jrnInteractiveProps(function() { callbacks.onNoteCard && callbacks.onNoteCard(b.noteGroupId); })}>
        <div className="jrn-emb-eyebrow">{nc ? nc.eyebrow : 'Note'}</div>
        <h4 className="jrn-emb-title">{nc ? nc.title : 'Note'}</h4>
        {nc && nc.body && <JrnExpandable text={nc.body} threshold={200} className="jrn-emb-body" tapToToggle />}
        <span className="jrn-emb-arrow" aria-hidden="true">›</span>
      </div>
    );
  }
  if (b.type === 'journal-card') {
    var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(b.entryId) : null;
    var jcPreview = je ? JournalHelpers.previewText(je, 180) : '';
    return (
      <div className="jrn-embed-journal" {...jrnInteractiveProps(function() { callbacks.onJournalCard && callbacks.onJournalCard(b.entryId); })}>
        <div className="jrn-emb-eyebrow">Linked Entry</div>
        <h4 className="jrn-emb-title">{je ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled') : '(Deleted)'}</h4>
        {/* A link card shows a 2-line teaser (CSS-clamped), not an expandable
            body — tapping the card opens the full entry. No "Show more". */}
        {jcPreview && <div className="jrn-emb-body">{jcPreview}</div>}
        <span className="jrn-emb-arrow" aria-hidden="true">›</span>
      </div>
    );
  }
  if (b.type === 'notebook-card') {
    var nbc = JournalHelpers.resolveNotebookCard(b.notebookId);
    return (
      <div
        className="jrn-embed-notebook"
        {...jrnInteractiveProps(function() { callbacks.onNotebookCard && callbacks.onNotebookCard(b.notebookId); })}
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
        {srcTitle && <div className="jrn-emb-eyebrow jrn-excerpt-source" {...jrnInteractiveProps(openSource, 'link')}>{'From: ' + srcTitle}</div>}
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
            {...jrnInteractiveProps(function() { if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId); }, 'link')}
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
            {...jrnInteractiveProps(function() { if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId); }, 'link')}
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

/**
 * The three states a journal media block can be in — journal-3 clause (c).
 *
 * `JournalMediaStore.objectUrl` resolves null for BOTH "still looking" and
 * "there is no such record", so a block that keys off the url alone has to
 * pick one meaning and is wrong the other way round: treat null as missing
 * and every entry accuses the store of losing data on its first frame; treat
 * it as loading and a genuinely absent recording paints a full player that
 * does nothing when tapped. That second one is what shipped, and it is the
 * lie this hook exists to end. Both blocks share it so they cannot drift.
 *
 * No mediaId at all is MISSING: there are no bytes and no lookup coming.
 * An absent JournalMediaStore stays LOADING — that is an environment we
 * cannot see into, not evidence about the user's data, and accusing the
 * store on the strength of it would be the same overreach in the other
 * direction.
 *
 * MISSING IS DERIVED FROM THE RECORD, NEVER FROM THE URL. `objectUrl`
 * resolves null for three different facts, and only two of them are a loss:
 *
 *   1. no such record                                  → missing
 *   2. a record with no blob                           → missing
 *   3. URL.createObjectURL THREW on an intact blob     → NOT missing
 *      (journal-media-store.js catches it and returns null)
 *
 * Collapsing them would paint "Recording missing" over bytes that are
 * perfectly fine — and the block's delete control sits right beside that
 * text, so it reads as a prompt to finish the job. The user removes the
 * block, the record goes unreferenced and unmarked, and the boot sweep
 * prunes it: real audio destroyed by a transient URL-minting failure. That
 * is this design's own loss class, reached through an affordance we
 * deliberately kept. The extra `get` only runs on the null path, where the
 * block is already broken, so the healthy path pays nothing.
 *
 * A rejection is not evidence either. `objectUrl` propagates failures out of
 * `get`/`openDb` — "IndexedDB not available", "database open blocked" are
 * both real — and without the catch, setState never fires and the block
 * spins forever.
 *
 * ponytail: case 3 renders as LOADING, i.e. a silently blank block, rather
 * than earning a third visual state. Wrong in this direction costs a blank
 * block; wrong in the other costs user data. The console.warn is what makes
 * it diagnosable — add the third state if it is ever seen in the wild.
 *
 * @param {string | undefined} mediaId
 * @returns {{ url: string | null, missing: boolean }}
 */
function useMediaUrl(mediaId) {
  const [state, setState] = React.useState({ url: null, missing: false });
  React.useEffect(function() {
    var cancelled = false;
    if (!mediaId) { setState({ url: null, missing: true }); return undefined; }
    if (typeof JournalMediaStore === 'undefined') { setState({ url: null, missing: false }); return undefined; }
    setState({ url: null, missing: false });   // a new id is loading again, not missing
    JournalMediaStore.objectUrl(mediaId).then(function(url) {
      if (cancelled) return undefined;
      if (url) { setState({ url: url, missing: false }); return undefined; }
      return JournalMediaStore.get(mediaId).then(function(rec) {
        if (cancelled) return;
        var gone = !rec || !rec.blob;
        if (!gone) console.warn('journal media: record intact but no object URL', mediaId);
        setState({ url: null, missing: gone });
      });
    }).catch(function(e) {
      // An IDB error tells us about the database, not about the recording.
      if (!cancelled) { console.warn('journal media lookup failed', mediaId, e); setState({ url: null, missing: false }); }
    });
    return function() { cancelled = true; };
  }, [mediaId]);
  return state;
}

export function JournalImageBlock({ mediaId, caption }) {
  var media = useMediaUrl(mediaId);

  // The placeholder used to read "Image unavailable" for BOTH the in-flight
  // lookup and a record that is gone. Only the second is a fact worth telling
  // the user, and it has to reach the accessibility tree as text.
  return (
    <div className="jrn-embed-image">
      {media.url
        ? <img src={media.url} alt={caption || ''} />
        : <div className={media.missing ? 'jrn-img-missing' : 'jrn-img-loading'} style={{ width: '100%', height: '180px', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-dim)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>{media.missing ? 'Image missing' : ''}</div>}
      {caption && <div className="jrn-img-caption" style={{ padding: '8px 14px' }}>{caption}</div>}
    </div>
  );
}

export function JournalAudioBlock(props) {
  var useState = React.useState;
  var useRef = React.useRef;
  var mediaId = props.mediaId;
  var duration = props.duration;
  var caption = props.caption;
  var samples = props.samples;
  var editable = !!props.editable;
  var confirming = !!props.confirming;

  var media = useMediaUrl(mediaId);
  var src = media.url;
  var audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime, setCurTime] = useState(0);

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

  function seekFromKeyboard(e) {
    if (!audioRef.current) return;
    var total = duration || audioRef.current.duration || 0;
    if (!(total > 0)) return;
    var next = audioRef.current.currentTime || 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= 5;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += 5;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = total;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(total, next));
    audioRef.current.currentTime = next;
    setProgress(next / total);
    setCurTime(next);
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

  // Same fallback chain as the seek handlers: a block with no persisted
  // duration prop must not advertise aria-valuemax=0 while valuenow grows.
  var dur = duration || (audioRef.current && audioRef.current.duration) || 0;
  var timeStr = JournalHelpers.formatDuration(curTime || 0) + ' / ' + JournalHelpers.formatDuration(dur);

  // journal-3 clause (c) — the bytes are gone, so say so and offer nothing
  // that would do nothing.
  //
  // What this deliberately does NOT render, and why: no play button (a control
  // that does nothing is the defect); no duration, because `duration` is a
  // claim about bytes that are gone; no waveform, and with it no role="slider"
  // or tabIndex, because a slider over nothing is worse than no slider. The
  // caption stays — the user's own words about the memo are still theirs — and
  // "Recording missing" is TEXT, not a visual difference, so a screen-reader
  // user is not told a memo exists with no way to learn it does not.
  //
  // No recovery or discard affordance here either. Recovery lives in the
  // Journal Hub banner, which sees every unclaimed record at once; a second
  // path at the block is how "missing" quietly becomes "deleted". `deleteUI`
  // below is NOT that — it removes this block from the entry the user is
  // editing, and dropping it would strand a dead block with no way to clear
  // it. The visual treatment is Design & Performance's; this is the contract.
  if (media.missing) {
    return (
      <div className={'jrn-embed-audio is-missing' + (editable ? ' is-editable' : '')}>
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
            <div className="jrn-aud-body">
              <div className="jrn-aud-meta">
                <span>{caption || 'Voice memo'}</span>
              </div>
              <div className="jrn-aud-missing">Recording missing</div>
            </div>
            {deleteUI}
          </>
        )}
      </div>
    );
  }

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
              onKeyDown={seekFromKeyboard}
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(dur)}
              aria-valuenow={Math.round(curTime || 0)}
              aria-valuetext={timeStr}
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
  // The cross-screen back-pill (useFromLetterStack). Non-null when the user
  // arrived here from a notebook note / Links row / journal card — the case
  // that previously stranded them. jrnBack (below) takes precedence: ONE pill.
  var backHint = props.backHint;
  var tapThroughBack = props.tapThroughBack;

  // Subscribe to JournalStore — viewer re-renders when entry mutates.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return JournalStore.subscribe(cb); }, []),
    function() { return JournalStore.getVersion(); }
  );
  var entry = entryId ? JournalStore.get(entryId) : null;

  // Entry-options ⋯ sheet (pin/delete live there — the top nav only carries
  // ONE extra icon; pin + delete as separate nav icons overflowed the bar on
  // narrow Android screens).
  var _menuOpen = useState(false);
  var menuOpen = _menuOpen[0]; var setMenuOpen = _menuOpen[1];

  // A {{ref:}} tap can OUTLIVE this screen: when the Bible corpus is still
  // loading, onScriptureRef retries for up to 10s (40 x 250ms). Held here so a
  // newer tap replaces the pending retry and unmount cancels it — otherwise
  // leaving the entry mid-retry still fires onNavigateToLink when the corpus
  // lands, yanking the reader to the verse they walked away from. Same shape as
  // GoToRefButton's retryRef. (Declared ABOVE the !entry early return below —
  // hooks must run unconditionally.)
  var refRetryRef = React.useRef(null);
  React.useEffect(function() {
    return function() {
      if (refRetryRef.current) { clearInterval(refRetryRef.current); refRetryRef.current = null; }
    };
  }, []);

  if (typeof window !== 'undefined' && !window.__journalBackStack) window.__journalBackStack = [];
  var _jstack = (typeof window !== 'undefined' && window.__journalBackStack) || [];
  var jrnBack = (_jstack.length && entry && _jstack[_jstack.length - 1].destId === entry.id)
    ? _jstack[_jstack.length - 1] : null;
  // Also the nav-bar back arrow, so all three affordances (arrow, pill,
  // hardware back — use-android-back.js's journal-viewer branch) agree on the
  // same precedence: journal→journal stack, then the cross-screen pill, then
  // the journal hub.
  function jrnGoBack() {
    if (jrnBack && _jstack.length) {
      _jstack.pop();
      if (onOpenJournalEntry) { onOpenJournalEntry(jrnBack.fromId); return; }
    }
    if (!jrnBack && backHint && tapThroughBack) { tapThroughBack(); return; }
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
      // Pass the source label so the notebook screen can raise the same
      // "Back to My Journal · <title>" pill the reading screens get.
      if (onOpenNotebook) onOpenNotebook(nbId, sourceMeta.sourceLetterTitle);
    },
    onScriptureRef: function(ref) {
      // {{ref:Book C:V}} in journal text used to call window.__openScriptureSheet,
      // a bridge NO screen ever installs — the gold link rendered tappable but
      // the tap did nothing (dead-UI sweep, 2026-07-12). Journals have no
      // per-entry scriptures dict to feed a sheet, so navigate to the verse
      // instead (same endpoint shape the viewer's verse-blocks use). findBook
      // needs the lazy Bible corpus, which this route doesn't preload — fire
      // the loader and retry briefly when it isn't resolvable yet.
      var tryNav = function() {
        var p = (typeof parseRefStr === 'function') ? parseRefStr(ref) : null;
        if (!p || !p.chapter) return true; // unparseable — nothing sane to open
        var bookKey = (typeof findBook === 'function') ? findBook(p.rawBook) : null;
        if (!bookKey) return false;        // corpus not loaded yet — retry
        var endpoint = { type: 'bible', bookId: bookKey, chapter: p.chapter };
        if (p.verse != null) endpoint.verse = p.verse;
        if (p.verseEnd != null) endpoint.verseEnd = p.verseEnd;
        if (onNavigateToLink) onNavigateToLink(endpoint, sourceMeta);
        return true;
      };
      if (tryNav()) return;
      if (typeof window.__loadBibleCorpus === 'function') {
        window.__loadBibleCorpus();
        // Newest tap wins: cancel a retry still pending from an earlier tap,
        // so two quick taps can't race and land on the FIRST verse.
        if (refRetryRef.current) clearInterval(refRetryRef.current);
        var tries = 0;
        var id = setInterval(function() {
          if (tryNav() || ++tries >= 40) {
            clearInterval(id);
            // Only clear the ref if it's still OURS — a newer tap may already
            // have stored its own id here.
            if (refRetryRef.current === id) refRetryRef.current = null;
          }
        }, 250);
        refRetryRef.current = id;
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
  }
  function doDelete() {
    JournalStore.remove(entry.id);
    onBack && onBack();
  }

  // ONE ⋯ nav icon opens the same entry-options sheet the hub cards use
  // (Edit / Pin / Delete-with-triple-confirm) — JournalCardMenu, with the
  // redundant "Open Entry" item hidden since we're already inside the entry.
  var navExtras = (
    <button
      className="nav-search-btn jrn-entry-menu-btn"
      onClick={function() { setMenuOpen(true); }}
      title="Entry options"
      aria-label="Entry options"
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
      </svg>
    </button>
  );

  var displayTitle = JournalHelpers.entryDisplayTitle(entry);

  return (
    <ScreenLayout navChildren={buildNavChildren({ right: navExtras })}>
      <div className="jrn-viewer">
        {jrnBack ? (
          <div className="back-hint-row">
            <button className="back-hint-pill" onClick={jrnGoBack} aria-label={'Back to ' + jrnBack.fromTitle}>
              <span className="back-hint-arrow">‹</span>Back to{' '}
              <span className="back-hint-title">{jrnBack.fromTitle}</span>
            </button>
          </div>
        ) : backHint ? (
          // ONE pill max — .back-hint-row is position:sticky, so two of them
          // would double-cover the entry. tapThroughBack is called DIRECTLY,
          // not via window.handleAndroidBack, whose journal-viewer branch
          // would have to re-derive this same decision.
          <div className="back-hint-row">
            <button className="back-hint-pill" onClick={function() { tapThroughBack && tapThroughBack(); }} aria-label={'Back to ' + (backHint.volumeLabel ? backHint.volumeLabel + ' · ' + backHint.title : backHint.title)}>
              <span className="back-hint-arrow">‹</span>Back to{' '}
              <span className="back-hint-title">{backHint.volumeLabel ? backHint.volumeLabel + ' · ' + backHint.title : backHint.title}</span>
            </button>
          </div>
        ) : null}
        <div className="jrn-viewer-meta">
          <h1 className={'jrn-viewer-title' + (displayTitle ? '' : ' untitled')}>{displayTitle || 'Untitled'}</h1>
          <div className="jrn-viewer-date">
            {JournalHelpers.longDate(entry.created)}
            <span className="jrn-card-time">{' · ' + JournalHelpers.shortTime(entry.created)}</span>
            {entry.pinned && ' · Pinned'}
          </div>
        </div>
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
      {menuOpen && (
        <JournalCardMenu
          entry={entry}
          hideOpen
          onClose={function() { setMenuOpen(false); }}
          onEdit={onEdit}
          onTogglePin={togglePin}
          onDelete={doDelete}
        />
      )}
    </ScreenLayout>
  );
}
