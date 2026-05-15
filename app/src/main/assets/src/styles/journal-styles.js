/* ═══════════════════════════════════════════════════════════════
   JOURNAL STYLES — self-contained CSS injection
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Injects all journal-related CSS into a dedicated <style> element so
   the feature is segregated from the main CSS template literal.
   Inherits color/font tokens (--gold, --cream-dim, --bg, --font-cinzel,
   etc.) from the main stylesheet — does NOT redefine them.

   All journal classes are prefixed `jrn-` to prevent collisions with
   existing app CSS.
═══════════════════════════════════════════════════════════════ */

(function injectJournalStyles() {
  if (document.getElementById('jrn-styles')) return;

  var rules = [];
  function R(s) { rules.push(s); }

  // Library tile (Journal becomes active)
  R('.library-tile.jrn-active { cursor: pointer; }');

  // Hub screen
  R('.jrn-hub { padding: 0 0 110px; }');
  R('.jrn-hub-header { padding: 14px 22px 8px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }');
  R('.jrn-hub-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 22px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }');
  R('.jrn-hub-count { font-family: var(--font-garamond); font-style: italic; color: var(--gold-dim); font-size: 13px; }');

  // Stats strip
  R('.jrn-stats { margin: 8px 18px; padding: 14px 16px; background: linear-gradient(135deg, var(--bg2), var(--bg)); border: 1px solid var(--gold-border); border-radius: 12px; }');
  R('body.light .jrn-stats { background: linear-gradient(135deg, #f3ecdc, #faf5e7); }');
  R('.jrn-stats-streak { display: flex; align-items: center; gap: 10px; font-family: var(--font-garamond); font-size: 15px; color: var(--cream-dim); }');
  R('body.light .jrn-stats-streak { color: #3a3528; }');
  R('.jrn-stats-flame { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: var(--gold); }');
  R('.jrn-stats-flame svg { width: 20px; height: 20px; fill: currentColor; }');
  R('.jrn-stats-value { color: var(--gold); font-weight: 500; }');
  R('.jrn-stats-sep { color: var(--gold-dim); margin: 0 2px; }');
  R('.jrn-stats-meta { color: var(--gold-dim); font-size: 13px; font-style: italic; }');
  R('.jrn-stats-milestones { display: flex; gap: 8px; margin-top: 12px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }');
  R('.jrn-stats-milestones::-webkit-scrollbar { display: none; }');
  R('.jrn-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; background: var(--gold-faint); border: 1px solid var(--gold-border); border-radius: 999px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); white-space: nowrap; flex-shrink: 0; }');
  R('.jrn-badge::before { content: "\\2726"; font-size: 11px; color: var(--gold); }');

  // Tab strip
  R('.jrn-tabs { display: flex; border-bottom: 1px solid var(--gold-border); padding: 0 18px; margin-top: 6px; }');
  R('.jrn-tab { background: none; border: none; padding: 12px 14px 14px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--gold-dim); cursor: pointer; position: relative; transition: color 0.2s; }');
  R('.jrn-tab.active { color: var(--gold); }');
  R('.jrn-tab.active::after { content: ""; position: absolute; bottom: -1px; left: 14px; right: 14px; height: 2px; background: var(--gold); border-radius: 2px 2px 0 0; }');
  R('.jrn-tab:hover { color: var(--gold); }');

  // Controls row
  R('.jrn-controls { display: flex; gap: 10px; padding: 12px 18px; align-items: center; }');
  R('.jrn-search { flex: 1; background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 14px; outline: none; }');
  R('body.light .jrn-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }');
  R('.jrn-search:focus { border-color: var(--gold); }');
  R('.jrn-sort-btn { background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-garamond); font-size: 13px; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap; }');
  R('.jrn-sort-btn:hover { border-color: var(--gold-border); color: var(--gold); }');

  // Entry list / cards
  R('.jrn-list { padding: 0 14px; display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }');
  R('.jrn-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px 14px 22px; cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.1s; position: relative; }');
  R('body.light .jrn-card { background: #faf5e7; }');
  R('.jrn-card:hover { background: var(--bg3); border-color: var(--gold-border); }');
  R('body.light .jrn-card:hover { background: #f3ecdc; }');
  R('.jrn-card:active { transform: scale(0.99); }');
  R('.jrn-card.pinned::before { content: ""; position: absolute; top: 14px; right: 14px; width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg); box-shadow: 0 0 8px var(--gold-glow); }');
  R('.jrn-card-mood { position: absolute; left: 8px; top: 14px; bottom: 14px; width: 3px; border-radius: 2px; background: var(--gold); }');
  R('.jrn-card-mood.silver { background: #b8b8b8; }');
  R('.jrn-card-mood.deep { background: #a8543f; }');
  R('.jrn-card-mood.quiet { background: #6b8593; }');
  R('.jrn-card-mood.none { background: transparent; }');
  R('.jrn-card-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }');
  R('.jrn-card-title { font-family: var(--font-garamond); font-size: 17px; font-weight: 500; color: var(--cream); margin: 0; }');
  R('body.light .jrn-card-title { color: #2a2520; }');
  R('.jrn-card-title.untitled { font-style: italic; color: var(--cream-muted); }');
  R('.jrn-card-date { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); white-space: nowrap; }');
  R('.jrn-card-preview { font-family: var(--font-garamond); font-size: 14px; color: var(--cream-dim); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0; }');
  R('body.light .jrn-card-preview { color: #5a4f3d; }');
  R('.jrn-card-attachments { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }');
  R('.jrn-attach { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--gold-faint); border-radius: 4px; font-size: 10px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); }');
  R('.jrn-attach svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 1.8; }');
  R('.jrn-card-meta { display: flex; gap: 8px; margin-top: 8px; font-size: 11px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.06em; color: var(--gold-dim); align-items: center; flex-wrap: wrap; }');
  R('.jrn-card-meta-sep { color: var(--gold-dim); opacity: 0.5; }');
  R('.jrn-tags { display: flex; gap: 4px; flex-wrap: wrap; }');
  R('.jrn-tag { color: var(--gold); font-style: italic; font-family: var(--font-garamond); font-size: 12px; text-transform: none; letter-spacing: 0; }');
  R('.jrn-empty { padding: 60px 30px; text-align: center; }');
  R('.jrn-empty-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }');
  R('.jrn-empty-hint { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 15px; line-height: 1.5; max-width: 320px; margin: 0 auto; }');

  // Notebook tab
  R('.jrn-nb-grid { padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }');
  R('.jrn-nb-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 18px 16px; cursor: pointer; min-height: 120px; display: flex; flex-direction: column; justify-content: space-between; transition: border-color 0.15s, background 0.15s; }');
  R('body.light .jrn-nb-card { background: #faf5e7; }');
  R('.jrn-nb-card:hover { border-color: var(--gold-border); background: var(--bg3); }');
  R('.jrn-nb-card.uncategorized { border-style: dashed; border-color: var(--gold-dim); }');
  R('.jrn-nb-card.new { border-style: dashed; border-color: var(--gold-dim); align-items: center; justify-content: center; color: var(--gold-dim); }');
  R('.jrn-nb-card.new .plus { font-size: 28px; color: var(--gold-dim); font-family: var(--font-cinzel); margin-bottom: 4px; line-height: 1; }');
  R('.jrn-nb-card.new .label { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }');
  R('.jrn-nb-eyebrow { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); }');
  R('.jrn-nb-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 8px 0; }');
  R('.jrn-nb-count { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 13px; }');
  R('.jrn-nb-drill-header { display: flex; align-items: center; gap: 10px; padding: 12px 18px 4px; }');
  R('.jrn-nb-drill-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; flex: 1; }');
  R('.jrn-nb-action { background: none; border: 1px solid var(--gold-border); color: var(--gold); font-family: var(--font-cinzel); font-size: 10px; padding: 5px 12px; border-radius: 999px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; }');
  R('.jrn-nb-action:hover { background: var(--gold-faint); }');
  R('.jrn-nb-action.danger { color: #c75c4a; border-color: rgba(199, 92, 74, 0.3); }');
  R('.jrn-nb-action.danger:hover { background: rgba(199, 92, 74, 0.1); }');
  R('.jrn-inline-confirm { display: flex; gap: 8px; align-items: center; padding: 8px 18px; background: rgba(199, 92, 74, 0.08); border-top: 1px solid rgba(199, 92, 74, 0.2); border-bottom: 1px solid rgba(199, 92, 74, 0.2); font-family: var(--font-garamond); font-size: 13px; color: var(--cream-dim); }');
  R('.jrn-inline-confirm-q { flex: 1; }');
  R('.jrn-inline-confirm button { background: none; border: 1px solid var(--gold-dim); color: var(--gold-dim); padding: 4px 12px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }');
  R('.jrn-inline-confirm button.danger { background: #c75c4a; color: white; border-color: #c75c4a; }');
  R('.jrn-rename-input { width: 100%; background: var(--bg3); border: 1px solid var(--gold); color: var(--cream); font-family: var(--font-cinzel); font-size: 16px; padding: 8px 14px; border-radius: 6px; outline: none; text-transform: uppercase; letter-spacing: 0.04em; }');
  R('body.light .jrn-rename-input { background: white; color: #2a2520; }');

  // Editor screen
  R('.jrn-editor { display: flex; flex-direction: column; flex: 1; }');
  R('.jrn-editor-meta { padding: 18px 22px 8px; }');
  R('.jrn-editor-title { width: 100%; background: none; border: none; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; outline: none; padding: 0; }');
  R('body.light .jrn-editor-title { color: #8b6f30; }');
  R('.jrn-editor-title::placeholder { color: var(--gold-dim); opacity: 0.6; font-style: italic; text-transform: none; letter-spacing: 0.02em; font-weight: 400; }');
  R('.jrn-editor-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }');
  R('.jrn-mood-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--gold); border: 1px solid var(--gold-border); cursor: pointer; }');
  R('.jrn-mood-dot.silver { background: #b8b8b8; }');
  R('.jrn-mood-dot.deep { background: #a8543f; }');
  R('.jrn-mood-dot.quiet { background: #6b8593; }');
  R('.jrn-mood-dot.none { background: transparent; border: 1px dashed var(--gold-dim); }');
  R('.jrn-saved-ind { font-style: italic; color: var(--gold-dim); font-family: var(--font-garamond); font-size: 12px; text-transform: none; letter-spacing: 0; padding: 0 8px; }');
  R('.jrn-blocks { padding: 0 18px 24px; display: flex; flex-direction: column; gap: 6px; }');
  R('.jrn-block { position: relative; padding: 4px 0; }');
  R('.jrn-block-textarea { width: 100%; background: none; border: none; color: var(--cream-dim); font-family: var(--font-garamond); font-size: 17px; line-height: 1.65; resize: none; outline: none; padding: 6px 4px; border-radius: 4px; transition: background 0.15s; }');
  R('body.light .jrn-block-textarea { color: #3a3528; }');
  R('.jrn-block-textarea:focus { background: rgba(212, 183, 114, 0.04); }');
  R('.jrn-block-textarea.h2 { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }');
  R('.jrn-block-quote { border-left: 3px solid var(--gold); padding: 10px 0 10px 18px; margin: 4px 0; }');
  R('.jrn-block-quote textarea { width: 100%; background: none; border: none; color: var(--cream); font-family: var(--font-garamond); font-style: italic; font-size: 17px; line-height: 1.6; resize: none; outline: none; padding: 2px 0; }');
  R('body.light .jrn-block-quote textarea { color: #2a2520; }');
  R('.jrn-block-quote-cite { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); margin-top: 8px; }');
  R('.jrn-divider { text-align: center; padding: 16px 0; color: var(--gold); letter-spacing: 1em; font-size: 14px; user-select: none; }');

  // Embed cards
  R('.jrn-embed-letter, .jrn-embed-chapter, .jrn-embed-bookmark, .jrn-embed-note, .jrn-embed-journal { background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 8px; padding: 14px 16px; cursor: pointer; position: relative; transition: background 0.15s, border-color 0.15s; }');
  R('body.light .jrn-embed-letter, body.light .jrn-embed-chapter, body.light .jrn-embed-bookmark, body.light .jrn-embed-note, body.light .jrn-embed-journal { background: #f3ecdc; }');
  R('.jrn-embed-letter:hover, .jrn-embed-chapter:hover, .jrn-embed-bookmark:hover, .jrn-embed-note:hover, .jrn-embed-journal:hover { border-color: var(--gold); }');
  R('.jrn-emb-eyebrow { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); margin-bottom: 4px; }');
  R('.jrn-emb-title { font-family: var(--font-cinzel); color: var(--cream); font-size: 16px; font-weight: 500; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }');
  R('body.light .jrn-emb-title { color: #2a2520; }');
  R('.jrn-emb-body { font-family: var(--font-garamond); color: var(--cream-dim); font-size: 14px; line-height: 1.5; font-style: italic; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }');
  R('.jrn-emb-date { position: absolute; top: 12px; right: 14px; font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }');
  R('.jrn-emb-delete { position: absolute; bottom: 6px; right: 6px; background: none; border: none; color: var(--gold-dim); width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: none; align-items: center; justify-content: center; }');
  R('.jrn-block:hover .jrn-emb-delete { display: flex; }');
  R('.jrn-emb-delete:hover { background: rgba(199, 92, 74, 0.15); color: #c75c4a; }');
  R('.jrn-embed-verse { background: var(--bg3); border-left: 3px solid var(--gold); border-radius: 6px; padding: 14px 16px; position: relative; }');
  R('body.light .jrn-embed-verse { background: #f3ecdc; }');
  R('.jrn-embed-verse .jrn-emb-cite { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold); margin-bottom: 6px; }');
  R('.jrn-embed-verse .jrn-emb-text { font-family: var(--font-garamond); color: var(--cream); font-size: 16px; line-height: 1.6; }');
  R('body.light .jrn-embed-verse .jrn-emb-text { color: #2a2520; }');
  R('.jrn-embed-verse .vsup { color: var(--gold); font-size: 0.65em; font-family: var(--font-cinzel); vertical-align: super; margin-right: 3px; }');

  // Image embed
  R('.jrn-embed-image { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); position: relative; }');
  R('.jrn-embed-image img { width: 100%; display: block; max-height: 420px; object-fit: cover; }');
  R('.jrn-embed-image .jrn-img-caption { padding: 8px 14px; background: var(--bg2); font-family: var(--font-garamond); font-style: italic; font-size: 13px; color: var(--cream-dim); border: none; width: 100%; outline: none; }');
  R('body.light .jrn-embed-image .jrn-img-caption { background: #f3ecdc; color: #5a4f3d; }');
  R('.jrn-img-delete { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.55); color: var(--cream); width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer; z-index: 2; display: flex; align-items: center; justify-content: center; }');
  R('.jrn-img-delete:hover { background: rgba(199, 92, 74, 0.7); }');

  // Audio embed
  R('.jrn-embed-audio { background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; position: relative; }');
  R('body.light .jrn-embed-audio { background: #f3ecdc; }');
  R('.jrn-aud-play { width: 38px; height: 38px; border-radius: 50%; background: var(--gold); border: none; color: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }');
  R('.jrn-aud-play svg { width: 14px; height: 14px; fill: currentColor; }');
  R('.jrn-aud-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }');
  R('.jrn-aud-waveform { height: 28px; display: flex; align-items: center; gap: 2px; overflow: hidden; }');
  R('.jrn-aud-waveform .bar { width: 2px; background: var(--gold-dim); border-radius: 1px; flex-shrink: 0; }');
  R('.jrn-aud-meta { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); display: flex; justify-content: space-between; }');

  // Editor toolbar
  R('.jrn-toolbar { position: sticky; bottom: 0; background: var(--bg2); border-top: 1px solid var(--border); padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); display: flex; gap: 10px; align-items: center; justify-content: space-between; z-index: 10; }');
  R('body.light .jrn-toolbar { background: #f3ecdc; }');
  R('.jrn-toolbar-group { display: flex; gap: 6px; align-items: center; }');
  R('.jrn-toolbar button { background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--cream-dim); cursor: pointer; padding: 8px 12px; font-family: var(--font-garamond); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; transition: border-color 0.15s, color 0.15s; }');
  R('body.light .jrn-toolbar button { color: #3a3528; }');
  R('.jrn-toolbar button:hover { border-color: var(--gold-border); color: var(--gold); }');
  R('.jrn-toolbar button.primary { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R('.jrn-toolbar button svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.8; }');
  R('.jrn-between-add { display: flex; align-items: center; height: 22px; position: relative; opacity: 0.45; transition: opacity 0.15s; cursor: pointer; }');
  R('.jrn-between-add:hover { opacity: 1; }');
  R('.jrn-between-add::before { content: ""; position: absolute; left: 34px; right: 30px; top: 50%; height: 1px; background: var(--gold-border); }');
  R('.jrn-between-add .plus { margin-left: 12px; z-index: 1; background: var(--bg); color: var(--gold); border: 1px solid var(--gold-border); width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-cinzel); font-size: 14px; }');
  R('body.light .jrn-between-add .plus { background: #fbf6e8; }');

  // Viewer
  R('.jrn-viewer { display: flex; flex-direction: column; flex: 1; padding-bottom: 60px; }');
  R('.jrn-viewer-meta { padding: 22px 22px 12px; }');
  R('.jrn-viewer-title { font-family: var(--font-cinzel); font-size: 24px; font-weight: 600; color: var(--gold); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }');
  R('.jrn-viewer-title.untitled { font-style: italic; color: var(--gold-dim); text-transform: none; letter-spacing: 0.02em; font-weight: 400; }');
  R('.jrn-viewer-date { font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); margin-top: 6px; }');
  R('.jrn-viewer-blocks { padding: 8px 22px 100px; display: flex; flex-direction: column; gap: 12px; }');
  R('.jrn-viewer-blocks .jrn-p { font-family: var(--font-garamond); font-size: 17px; line-height: 1.7; color: var(--cream-dim); margin: 4px 0; }');
  R('body.light .jrn-viewer-blocks .jrn-p { color: #3a3528; }');
  R('.jrn-viewer-blocks .jrn-h2 { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 18px 0 4px; }');
  R('.jrn-inline-letter, .jrn-inline-bookmark, .jrn-inline-journal { color: var(--gold); border-bottom: 1px dotted var(--gold-border); cursor: pointer; padding-bottom: 1px; }');
  R('.jrn-inline-letter:hover, .jrn-inline-bookmark:hover, .jrn-inline-journal:hover { color: var(--gold); border-bottom-color: var(--gold); }');
  R('.jrn-inline-ref { color: var(--gold); font-family: var(--font-cinzel); font-size: 0.92em; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; padding: 1px 4px; background: var(--gold-faint); border-radius: 3px; margin: 0 1px; }');

  // Inbound chip + sheet
  R('.jrn-inbound-chip { position: relative; }');
  R('.jrn-inbound-chip-badge { position: absolute; top: 2px; right: 2px; min-width: 14px; height: 14px; border-radius: 7px; background: var(--gold); color: var(--bg); font-family: var(--font-cinzel); font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 1.5px solid var(--bg); pointer-events: none; }');
  R('.jrn-inbound-list { padding: 6px 14px 20px; display: flex; flex-direction: column; gap: 8px; }');
  R('.jrn-inbound-item { padding: 12px 14px; background: var(--bg3); border-radius: 8px; border: 1px solid var(--border); cursor: pointer; }');
  R('body.light .jrn-inbound-item { background: #f3ecdc; }');
  R('.jrn-inbound-item:hover { border-color: var(--gold-border); }');
  R('.jrn-inbound-title { font-family: var(--font-garamond); font-size: 15px; color: var(--cream); font-weight: 500; }');
  R('body.light .jrn-inbound-title { color: #2a2520; }');
  R('.jrn-inbound-date { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); margin-top: 2px; }');
  R('.jrn-inbound-preview { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 13px; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }');

  // Insert sheet
  R('.jrn-insert-section { padding: 14px 20px 6px; }');
  R('.jrn-insert-section h4 { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--gold-dim); margin: 0 0 10px; }');
  R('.jrn-insert-list { display: flex; flex-direction: column; gap: 2px; }');
  R('.jrn-insert-item { display: flex; align-items: center; gap: 14px; padding: 12px 10px; border-radius: 8px; cursor: pointer; transition: background 0.12s; background: none; border: none; width: 100%; text-align: left; }');
  R('.jrn-insert-item:hover { background: var(--bg3); }');
  R('body.light .jrn-insert-item:hover { background: #f3ecdc; }');
  R('.jrn-insert-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--gold-faint); display: flex; align-items: center; justify-content: center; color: var(--gold); flex-shrink: 0; font-family: var(--font-cinzel); font-size: 13px; }');
  R('.jrn-insert-icon svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; }');
  R('.jrn-insert-text { display: flex; flex-direction: column; }');
  R('.jrn-insert-label { font-family: var(--font-garamond); font-size: 16px; color: var(--cream); }');
  R('body.light .jrn-insert-label { color: #2a2520; }');
  R('.jrn-insert-desc { font-family: var(--font-garamond); font-style: italic; font-size: 12px; color: var(--gold-dim); }');

  // Library picker (reuses sheet shell)
  R('.jrn-picker-results { padding: 6px 14px 24px; display: flex; flex-direction: column; gap: 4px; }');
  R('.jrn-picker-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; background: none; border: none; width: 100%; text-align: left; }');
  R('.jrn-picker-item:hover { background: var(--bg3); }');
  R('.jrn-picker-spine { width: 32px; height: 42px; border-radius: 3px; background: var(--gold-faint); border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; font-family: var(--font-cinzel); font-size: 10px; font-weight: 600; color: var(--gold); text-transform: uppercase; flex-shrink: 0; }');
  R('.jrn-picker-text { flex: 1; min-width: 0; }');
  R('.jrn-picker-label { font-family: var(--font-cinzel); font-size: 14px; color: var(--gold); text-transform: uppercase; letter-spacing: 0.04em; }');
  R('.jrn-picker-cat { font-family: var(--font-garamond); font-style: italic; font-size: 12px; color: var(--cream-dim); margin-top: 2px; }');

  // Recording sheet
  R('.jrn-rec-content { padding: 24px 24px 30px; text-align: center; }');
  R('.jrn-rec-status { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #d05a4a; }');
  R('.jrn-rec-status::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #d05a4a; animation: jrnPulseRec 1s ease-in-out infinite; }');
  R('@keyframes jrnPulseRec { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }');
  R('.jrn-rec-time { font-family: var(--font-cinzel); font-size: 42px; font-weight: 500; color: var(--cream); letter-spacing: 0.05em; margin: 16px 0; }');
  R('body.light .jrn-rec-time { color: #2a2520; }');
  R('.jrn-rec-waveform { display: flex; align-items: flex-end; justify-content: center; height: 56px; gap: 3px; margin: 12px 0; }');
  R('.jrn-rec-waveform .bar { width: 3px; background: var(--gold); border-radius: 1px; transition: height 0.15s; min-height: 4px; }');
  R('.jrn-rec-error { font-family: var(--font-garamond); font-style: italic; color: #d05a4a; font-size: 14px; padding: 14px 24px; }');
  R('.jrn-rec-actions { display: flex; justify-content: center; gap: 14px; margin-top: 24px; }');
  R('.jrn-rec-actions button { padding: 10px 24px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; border: none; }');
  R('.jrn-rec-cancel { background: none; border: 1px solid var(--gold-dim) !important; color: var(--gold-dim); }');
  R('.jrn-rec-stop { background: var(--gold); color: var(--bg); }');
  R('.jrn-rec-preview .jrn-rec-status { color: var(--gold); }');
  R('.jrn-rec-preview .jrn-rec-status::before { background: var(--gold); animation: none; }');

  // Hub FAB (reuses surprise-fab visuals if available, else custom)
  R('.jrn-fab { position: fixed; bottom: 24px; right: 22px; width: 56px; height: 56px; border-radius: 50%; background: var(--gold); color: var(--bg); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 20px rgba(212, 183, 114, 0.4); z-index: 35; transition: transform 0.15s; }');
  R('.jrn-fab:hover { transform: scale(1.05); }');
  R('.jrn-fab:active { transform: scale(0.96); }');
  R('.jrn-fab svg { width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 2.2; }');

  // Milestone toast
  R('.jrn-milestone-toast { position: fixed; top: 80px; left: 50%; transform: translateX(-50%) translateY(-20px); background: var(--bg3); border: 1px solid var(--gold); color: var(--gold); padding: 10px 18px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; z-index: 9000; opacity: 0; pointer-events: none; transition: opacity 0.3s, transform 0.3s; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 18px rgba(0,0,0,0.4); }');
  R('.jrn-milestone-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }');

  var styleEl = document.createElement('style');
  styleEl.id = 'jrn-styles';
  styleEl.textContent = rules.join('\n');
  document.head.appendChild(styleEl);
})();
