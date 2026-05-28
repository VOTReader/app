(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // app/src/main/assets/src/styles/journal-styles.js
  (function injectJournalStyles() {
    if (document.getElementById("jrn-styles")) return;
    var rules = [];
    function R(s) {
      rules.push(s);
    }
    R(".library-tile.jrn-active { cursor: pointer; }");
    R(".jrn-hub { padding: 0 0 110px; }");
    R(".jrn-hub-header { padding: 14px 22px 8px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }");
    R(".jrn-hub-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 22px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }");
    R(".jrn-hub-count { font-family: var(--font-garamond); font-style: italic; color: var(--gold-dim); font-size: 13px; }");
    R(".jrn-nav-spacer { flex: 1; min-width: 0; }");
    R(".jrn-tabs { display: flex; border-bottom: 1px solid var(--gold-border); padding: 0 18px; margin-top: 6px; }");
    R(".jrn-tab { background: none; border: none; padding: 12px 14px 14px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--gold-dim); cursor: pointer; position: relative; transition: color 0.2s; }");
    R(".jrn-tab.active { color: var(--gold); }");
    R('.jrn-tab.active::after { content: ""; position: absolute; bottom: -1px; left: 14px; right: 14px; height: 2px; background: var(--gold); border-radius: 2px 2px 0 0; }');
    R(".jrn-tab:hover { color: var(--gold); }");
    R(".jrn-controls { display: flex; gap: 10px; padding: 12px 18px; align-items: center; flex-wrap: wrap; }");
    R(".jrn-done-btn { background: var(--gold-faint); border: 1px solid var(--gold); color: var(--gold); font-family: var(--font-cinzel); font-size: 11px; padding: 6px 14px; border-radius: 999px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }");
    R(".jrn-done-btn:hover { background: var(--gold); color: var(--bg); }");
    R(".jrn-search { flex: 1; background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 14px; outline: none; }");
    R("body.light .jrn-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }");
    R(".jrn-search:focus { border-color: var(--gold); }");
    R(".jrn-sort-btn { background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-garamond); font-size: 13px; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap; }");
    R(".jrn-sort-btn:hover { border-color: var(--gold-border); color: var(--gold); }");
    R(".jrn-list { padding: 0 14px; display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }");
    R(".jrn-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px 14px 22px; cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.1s; position: relative; }");
    R("body.light .jrn-card { background: #faf5e7; }");
    R(".jrn-card:hover { background: var(--bg3); border-color: var(--gold-border); }");
    R("body.light .jrn-card:hover { background: #f3ecdc; }");
    R(".jrn-card:active { transform: scale(0.99); }");
    R(".jrn-card-pin-marker { position: absolute; top: 12px; right: 44px; width: 13px; height: 16px; color: var(--gold); pointer-events: none; }");
    R(".jrn-card-pin-marker svg { width: 100%; height: 100%; filter: drop-shadow(0 0 4px var(--gold-glow)); }");
    R(".jrn-card { padding-right: 42px; }");
    R(".jrn-card-menu-btn { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 50%; background: transparent; border: none; color: var(--gold-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; transition: background 0.12s, color 0.12s; z-index: 2; }");
    R(".jrn-card-menu-btn:hover { background: var(--gold-faint); color: var(--gold); }");
    R(".jrn-card-menu-btn:active { transform: scale(0.92); }");
    R(".jrn-card-menu-btn svg { width: 18px; height: 18px; }");
    R(".jrn-card.edit-mode { padding-right: 44px; }");
    R(".jrn-card-del-x { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; background: rgba(199, 92, 74, 0.12); border: 1px solid rgba(199, 92, 74, 0.45); color: #c75c4a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; transition: background 0.12s, color 0.12s, transform 0.1s; z-index: 2; }");
    R(".jrn-card-del-x:hover { background: #c75c4a; color: white; }");
    R(".jrn-card-del-x:active { transform: scale(0.92); }");
    R(".jrn-card-del-x svg { width: 14px; height: 14px; }");
    R(".jrn-card-confirm { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: rgba(199, 92, 74, 0.16); border: 1px solid rgba(199, 92, 74, 0.5); border-radius: 999px; z-index: 3; }");
    R(".jrn-card-confirm-q { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #c75c4a; padding: 0 2px; }");
    R(".jrn-card-confirm-cancel { background: none; border: none; color: var(--cream-dim); width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; }");
    R(".jrn-card-confirm-cancel:hover { background: var(--bg3); color: var(--cream); }");
    R(".jrn-card-confirm-yes { background: #c75c4a; border: none; color: white; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }");
    R(".jrn-card-confirm-yes svg { width: 13px; height: 13px; }");
    R(".jrn-card-confirm-yes:hover { background: #b04d3d; }");
    R(".jrn-card-mood { position: absolute; left: 8px; top: 14px; bottom: 14px; width: 3px; border-radius: 2px; background: var(--gold); }");
    R(".jrn-card-mood.silver { background: #b8b8b8; }");
    R(".jrn-card-mood.deep { background: #a8543f; }");
    R(".jrn-card-mood.quiet { background: #6b8593; }");
    R(".jrn-card-mood.none { background: transparent; }");
    R(".jrn-card-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }");
    R(".jrn-card-title { font-family: var(--font-garamond); font-size: 17px; font-weight: 500; color: var(--cream); margin: 0; }");
    R("body.light .jrn-card-title { color: #2a2520; }");
    R(".jrn-card-title.untitled { font-style: italic; color: var(--cream-muted); }");
    R(".jrn-card-date { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); white-space: nowrap; }");
    R(".jrn-card-time { opacity: 0.62; font-size: 0.85em; letter-spacing: 0.04em; }");
    R(".jrn-card-preview { font-family: var(--font-garamond); font-size: 14px; color: var(--cream-dim); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0; }");
    R("body.light .jrn-card-preview { color: #5a4f3d; }");
    R(".jrn-card-attachments { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }");
    R(".jrn-attach { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--gold-faint); border-radius: 4px; font-size: 10px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); }");
    R(".jrn-attach svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 1.8; }");
    R(".jrn-card-meta { display: flex; gap: 8px; margin-top: 8px; font-size: 11px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.06em; color: var(--gold-dim); align-items: center; flex-wrap: wrap; }");
    R(".jrn-card-meta-sep { color: var(--gold-dim); opacity: 0.5; }");
    R(".jrn-tags { display: flex; gap: 4px; flex-wrap: wrap; }");
    R(".jrn-tag { color: var(--gold); font-style: italic; font-family: var(--font-garamond); font-size: 12px; text-transform: none; letter-spacing: 0; }");
    R(".jrn-empty { padding: 60px 30px; text-align: center; }");
    R(".jrn-empty-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }");
    R(".jrn-empty-hint { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 15px; line-height: 1.5; max-width: 320px; margin: 0 auto; }");
    R(".jrn-nb-grid { padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }");
    R(".jrn-nb-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 18px 16px; cursor: pointer; min-height: 120px; display: flex; flex-direction: column; justify-content: space-between; transition: border-color 0.15s, background 0.15s; }");
    R("body.light .jrn-nb-card { background: #faf5e7; }");
    R(".jrn-nb-card:hover { border-color: var(--gold-border); background: var(--bg3); }");
    R(".jrn-nb-card.uncategorized { border-style: dashed; border-color: var(--gold-dim); }");
    R(".jrn-nb-card.new { border-style: dashed; border-color: var(--gold-dim); align-items: center; justify-content: center; color: var(--gold-dim); }");
    R(".jrn-nb-card.new .plus { font-size: 28px; color: var(--gold-dim); font-family: var(--font-cinzel); margin-bottom: 4px; line-height: 1; }");
    R(".jrn-nb-card.new .label { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }");
    R(".jrn-nb-eyebrow { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); }");
    R(".jrn-nb-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 8px 0; }");
    R(".jrn-nb-count { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 13px; }");
    R(".jrn-nb-drill-header { display: flex; align-items: center; gap: 10px; padding: 12px 18px 4px; }");
    R(".jrn-nb-drill-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; flex: 1; }");
    R(".jrn-nb-action { background: none; border: 1px solid var(--gold-border); color: var(--gold); font-family: var(--font-cinzel); font-size: 10px; padding: 5px 12px; border-radius: 999px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; }");
    R(".jrn-nb-action:hover { background: var(--gold-faint); }");
    R(".jrn-nb-action.danger { color: #c75c4a; border-color: rgba(199, 92, 74, 0.3); }");
    R(".jrn-nb-action.danger:hover { background: rgba(199, 92, 74, 0.1); }");
    R(".jrn-inline-confirm { display: flex; gap: 8px; align-items: center; padding: 8px 18px; background: rgba(199, 92, 74, 0.08); border-top: 1px solid rgba(199, 92, 74, 0.2); border-bottom: 1px solid rgba(199, 92, 74, 0.2); font-family: var(--font-garamond); font-size: 13px; color: var(--cream-dim); }");
    R(".jrn-inline-confirm-q { flex: 1; }");
    R(".jrn-inline-confirm button { background: none; border: 1px solid var(--gold-dim); color: var(--gold-dim); padding: 4px 12px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }");
    R(".jrn-inline-confirm button.danger { background: #c75c4a; color: white; border-color: #c75c4a; }");
    R(".jrn-rename-input { width: 100%; background: var(--bg3); border: 1px solid var(--gold); color: var(--cream); font-family: var(--font-cinzel); font-size: 16px; padding: 8px 14px; border-radius: 6px; outline: none; text-transform: uppercase; letter-spacing: 0.04em; }");
    R("body.light .jrn-rename-input { background: white; color: #2a2520; }");
    R(".jrn-editor { display: flex; flex-direction: column; flex: 1; padding-bottom: calc(96px + env(safe-area-inset-bottom)); }");
    R(".jrn-editor-meta { padding: 18px 22px 4px; }");
    R(".jrn-editor-title { width: 100%; background: none; border: none; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; outline: none; padding: 0; }");
    R("body.light .jrn-editor-title { color: #8b6f30; }");
    R(".jrn-editor-title::placeholder { color: var(--gold-dim); opacity: 0.6; font-style: italic; text-transform: none; letter-spacing: 0.02em; font-weight: 400; }");
    R(".jrn-saved-ind { font-style: italic; color: var(--gold-dim); font-family: var(--font-garamond); font-size: 12px; text-transform: none; letter-spacing: 0; padding: 0 8px; }");
    R(".jrn-blocks { padding: 6px 18px 24px; display: flex; flex-direction: column; gap: 0; }");
    R(".jrn-body-surface { min-height: 65vh; cursor: text; }");
    R(".jrn-block { position: relative; padding: 0; }");
    R(".jrn-block-textarea { width: 100%; background: none; border: none; color: var(--cream-dim); font-family: var(--font-garamond); font-size: 17px; line-height: 1.65; resize: none; outline: none; padding: 4px 4px; border-radius: 4px; transition: background 0.15s; min-height: 28px; }");
    R("body.light .jrn-block-textarea { color: #3a3528; }");
    R(".jrn-block-textarea:focus { background: rgba(212, 183, 114, 0.04); }");
    R(".jrn-block-textarea.h2 { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }");
    R(".jrn-block-quote { border-left: 3px solid var(--gold); padding: 10px 0 10px 18px; margin: 4px 0; }");
    R(".jrn-block-quote textarea { width: 100%; background: none; border: none; color: var(--cream); font-family: var(--font-garamond); font-style: italic; font-size: 17px; line-height: 1.6; resize: none; outline: none; padding: 2px 0; }");
    R("body.light .jrn-block-quote textarea { color: #2a2520; }");
    R(".jrn-block-quote-cite { width: 100%; background: none; border: none; outline: none; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); margin-top: 8px; }");
    R(".jrn-divider { text-align: center; padding: 16px 0; color: var(--gold); letter-spacing: 1em; font-size: 14px; user-select: none; }");
    R(".jrn-block:has(.jrn-embed-image), .jrn-block:has(.jrn-embed-audio), .jrn-block:has(.jrn-embed-letter), .jrn-block:has(.jrn-embed-chapter), .jrn-block:has(.jrn-embed-bookmark), .jrn-block:has(.jrn-embed-note), .jrn-block:has(.jrn-embed-journal), .jrn-block:has(.jrn-embed-verse) { margin: 8px 0; }");
    R(".jrn-embed-letter, .jrn-embed-chapter, .jrn-embed-bookmark, .jrn-embed-note, .jrn-embed-journal { background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 8px; padding: 14px 16px; cursor: pointer; position: relative; transition: background 0.15s, border-color 0.15s; }");
    R("body.light .jrn-embed-letter, body.light .jrn-embed-chapter, body.light .jrn-embed-bookmark, body.light .jrn-embed-note, body.light .jrn-embed-journal { background: #f3ecdc; }");
    R(".jrn-embed-letter:hover, .jrn-embed-chapter:hover, .jrn-embed-bookmark:hover, .jrn-embed-note:hover, .jrn-embed-journal:hover { border-color: var(--gold); }");
    R(".jrn-embed-notebook { display: flex; align-items: center; gap: 12px; background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 8px; padding: 12px 14px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }");
    R("body.light .jrn-embed-notebook { background: #f3ecdc; }");
    R(".jrn-embed-notebook:hover { border-color: var(--gold); background: var(--bg2); }");
    R(".jrn-emb-notebook-icon { width: 34px; height: 34px; border-radius: 8px; background: var(--gold-faint); display: flex; align-items: center; justify-content: center; color: var(--gold); flex-shrink: 0; }");
    R(".jrn-emb-notebook-icon svg { width: 18px; height: 18px; }");
    R(".jrn-emb-notebook-text { flex: 1; min-width: 0; }");
    R(".jrn-emb-notebook-text .jrn-emb-eyebrow { margin-bottom: 2px; }");
    R(".jrn-emb-notebook-text .jrn-emb-title { margin: 0; }");
    R(".jrn-emb-notebook-arrow { color: var(--gold-dim); font-size: 20px; flex-shrink: 0; }");
    R(".jrn-emb-eyebrow { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); margin-bottom: 4px; }");
    R(".jrn-emb-title { font-family: var(--font-cinzel); color: var(--cream); font-size: 16px; font-weight: 500; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }");
    R("body.light .jrn-emb-title { color: #2a2520; }");
    R(".jrn-emb-body { font-family: var(--font-garamond); color: var(--cream-dim); font-size: 14px; line-height: 1.5; font-style: italic; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }");
    R(".jrn-emb-body.is-collapsed, .jrn-emb-body.is-expanded { display: block; -webkit-line-clamp: unset; overflow: visible; }");
    R(".jrn-emb-date { position: absolute; top: 12px; right: 14px; font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }");
    R(".jrn-emb-delete { position: absolute; bottom: 6px; right: 6px; background: none; border: none; color: var(--gold-dim); width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: none; align-items: center; justify-content: center; }");
    R(".jrn-block:hover .jrn-emb-delete { display: flex; }");
    R(".jrn-emb-delete:hover { background: rgba(199, 92, 74, 0.15); color: #c75c4a; }");
    R(".jrn-embed-verse { background: var(--bg3); border-left: 3px solid var(--gold); border-radius: 6px; padding: 14px 16px; position: relative; transition: border-color 0.15s; }");
    R("body.light .jrn-embed-verse { background: #f3ecdc; }");
    R('.jrn-embed-verse[role="button"]:hover { border-left-color: var(--gold-bright); }');
    R(".jrn-embed-verse .jrn-emb-cite { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold); margin-bottom: 6px; }");
    R(".jrn-embed-verse .jrn-emb-text { font-family: var(--font-garamond); color: var(--cream); font-size: 16px; line-height: 1.6; }");
    R("body.light .jrn-embed-verse .jrn-emb-text { color: #2a2520; }");
    R(".jrn-embed-verse .vsup { color: var(--gold); font-size: 0.65em; font-family: var(--font-cinzel); vertical-align: super; margin-right: 3px; }");
    R(".jrn-emb-excerpt { font-style: italic; color: var(--cream); position: relative; padding-left: 12px; }");
    R("body.light .jrn-emb-excerpt { color: #2a2520; }");
    R('.jrn-emb-excerpt::before { content: "\\201C"; position: absolute; left: 0; top: -2px; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; line-height: 1; }');
    R(".jrn-embed-letter.is-excerpt, .jrn-embed-verse.is-excerpt { border-left-style: solid; }");
    R(".jrn-block-quote-body { font-style: italic; color: var(--cream); font-family: var(--font-garamond); font-size: 17px; line-height: 1.6; }");
    R("body.light .jrn-block-quote-body { color: #2a2520; }");
    R(".jrn-expand-toggle { background: none; border: none; padding: 0 0 0 6px; color: var(--gold); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; -webkit-tap-highlight-color: transparent; white-space: nowrap; }");
    R(".jrn-expand-toggle:hover { color: var(--gold-bright); }");
    R(".jrn-expand-toggle:active { color: var(--gold-dim); }");
    R(".is-expanded .jrn-expand-toggle { margin-top: 4px; }");
    R(".jrn-embed-image { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); position: relative; }");
    R(".jrn-embed-image img { width: 100%; display: block; max-height: 420px; object-fit: cover; }");
    R(".jrn-embed-image .jrn-img-caption { padding: 8px 14px; background: var(--bg2); font-family: var(--font-garamond); font-style: italic; font-size: 13px; color: var(--cream-dim); border: none; width: 100%; outline: none; }");
    R("body.light .jrn-embed-image .jrn-img-caption { background: #f3ecdc; color: #5a4f3d; }");
    R(".jrn-img-delete { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.55); color: var(--cream); width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer; z-index: 2; display: flex; align-items: center; justify-content: center; }");
    R(".jrn-img-delete:hover { background: rgba(199, 92, 74, 0.7); }");
    R(".jrn-embed-audio { background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; position: relative; }");
    R("body.light .jrn-embed-audio { background: #f3ecdc; }");
    R(".jrn-aud-play { width: 38px; height: 38px; border-radius: 50%; background: var(--gold); border: none; color: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }");
    R(".jrn-aud-play svg { width: 14px; height: 14px; fill: currentColor; }");
    R(".jrn-aud-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }");
    R(".jrn-aud-waveform { height: 28px; display: flex; align-items: center; gap: 2px; overflow: hidden; }");
    R(".jrn-aud-waveform .bar { width: 2px; background: var(--gold-dim); border-radius: 1px; flex-shrink: 0; transition: background 0.1s; }");
    R(".jrn-aud-waveform .bar.is-played { background: var(--gold); }");
    R(".jrn-aud-meta { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); display: flex; justify-content: space-between; gap: 8px; }");
    R(".jrn-aud-delete { background: none; border: none; color: var(--gold-dim); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.12s, color 0.12s; }");
    R(".jrn-aud-delete svg { width: 16px; height: 16px; }");
    R(".jrn-aud-delete:hover { background: rgba(199, 92, 74, 0.15); color: #c75c4a; }");
    R(".jrn-aud-confirm { padding: 0; min-width: 0; flex: 1; }");
    R(".jrn-aud-confirm .ann-chip-confirm-q { color: #c75c4a; }");
    R(".jrn-viewer { display: flex; flex-direction: column; flex: 1; padding-bottom: 60px; }");
    R(".jrn-viewer-meta { padding: 22px 22px 12px; }");
    R(".jrn-viewer-title { font-family: var(--font-cinzel); font-size: 24px; font-weight: 600; color: var(--gold); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }");
    R(".jrn-viewer-title.untitled { font-style: italic; color: var(--gold-dim); text-transform: none; letter-spacing: 0.02em; font-weight: 400; }");
    R(".jrn-viewer-date { font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); margin-top: 6px; }");
    R(".jrn-viewer-blocks { padding: 8px 22px 100px; display: flex; flex-direction: column; gap: 12px; }");
    R(".jrn-viewer-blocks .jrn-p { font-family: var(--font-garamond); font-size: 17px; line-height: 1.7; color: var(--cream-dim); margin: 4px 0; }");
    R("body.light .jrn-viewer-blocks .jrn-p { color: #3a3528; }");
    R(".jrn-viewer-blocks .jrn-h2 { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 18px 0 4px; }");
    R(".jrn-inline-letter, .jrn-inline-bookmark, .jrn-inline-journal { color: var(--gold); border-bottom: 1px dotted var(--gold-border); cursor: pointer; padding-bottom: 1px; }");
    R(".jrn-inline-letter:hover, .jrn-inline-bookmark:hover, .jrn-inline-journal:hover { color: var(--gold); border-bottom-color: var(--gold); }");
    R(".jrn-inline-ref { color: var(--gold); font-family: var(--font-cinzel); font-size: 0.92em; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; padding: 1px 4px; background: var(--gold-faint); border-radius: 3px; margin: 0 1px; }");
    R(".jrn-inbound-chip { position: relative; }");
    R(".jrn-inbound-chip-badge { position: absolute; top: 2px; right: 2px; min-width: 14px; height: 14px; border-radius: 7px; background: var(--gold); color: var(--bg); font-family: var(--font-cinzel); font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 1.5px solid var(--bg); pointer-events: none; }");
    R(".jrn-inbound-list { padding: 6px 14px 20px; display: flex; flex-direction: column; gap: 8px; }");
    R(".jrn-inbound-item { padding: 12px 14px; background: var(--bg3); border-radius: 8px; border: 1px solid var(--border); cursor: pointer; }");
    R("body.light .jrn-inbound-item { background: #f3ecdc; }");
    R(".jrn-inbound-item:hover { border-color: var(--gold-border); }");
    R(".jrn-inbound-title { font-family: var(--font-garamond); font-size: 15px; color: var(--cream); font-weight: 500; }");
    R("body.light .jrn-inbound-title { color: #2a2520; }");
    R(".jrn-inbound-date { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); margin-top: 2px; }");
    R(".jrn-inbound-preview { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 13px; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }");
    R(".jrn-pin-btn { color: var(--gold-dim); transition: color 0.15s; }");
    R(".jrn-pin-btn:hover { color: var(--gold); }");
    R(".jrn-pin-btn.is-pinned { color: var(--gold); }");
    R(".jrn-pin-btn.is-pinned svg { filter: drop-shadow(0 0 4px var(--gold-glow)); }");
    R(".jrn-del-btn { color: var(--gold-dim); transition: color 0.15s; }");
    R(".jrn-del-btn:hover { color: #c75c4a; }");
    R(".jrn-insert-section { padding: 14px 20px 6px; }");
    R(".jrn-insert-section h4 { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--gold-dim); margin: 0 0 10px; }");
    R(".jrn-insert-list { display: flex; flex-direction: column; gap: 2px; }");
    R(".jrn-insert-item { display: flex; align-items: center; gap: 14px; padding: 12px 10px; border-radius: 8px; cursor: pointer; transition: background 0.12s; background: none; border: none; width: 100%; text-align: left; }");
    R(".jrn-insert-item:hover { background: var(--bg3); }");
    R("body.light .jrn-insert-item:hover { background: #f3ecdc; }");
    R(".jrn-insert-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--gold-faint); display: flex; align-items: center; justify-content: center; color: var(--gold); flex-shrink: 0; font-family: var(--font-cinzel); font-size: 13px; }");
    R(".jrn-insert-icon svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; }");
    R(".jrn-insert-text { display: flex; flex-direction: column; }");
    R(".jrn-insert-label { font-family: var(--font-garamond); font-size: 16px; color: var(--cream); }");
    R("body.light .jrn-insert-label { color: #2a2520; }");
    R(".jrn-insert-desc { font-family: var(--font-garamond); font-style: italic; font-size: 12px; color: var(--gold-dim); }");
    R(".jrn-picker-search-row { padding: 8px 14px 6px; }");
    R(".jrn-picker-search { width: 100%; background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 14px; outline: none; transition: border-color 0.15s; box-sizing: border-box; }");
    R("body.light .jrn-picker-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }");
    R(".jrn-picker-search:focus { border-color: var(--gold); }");
    R(".jrn-picker-search::placeholder { color: var(--gold-dim); font-style: italic; }");
    R(".jrn-picker-results { padding: 6px 14px 24px; display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }");
    R(".jrn-picker-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; background: none; border: none; width: 100%; text-align: left; transition: background 0.12s; }");
    R(".jrn-picker-item:hover { background: var(--bg3); }");
    R("body.light .jrn-picker-item:hover { background: #f3ecdc; }");
    R(".jrn-picker-spine { width: 32px; height: 42px; border-radius: 3px; background: var(--gold-faint); border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; font-family: var(--font-cinzel); font-size: 10px; font-weight: 600; color: var(--gold); text-transform: uppercase; flex-shrink: 0; }");
    R(".jrn-picker-text { flex: 1; min-width: 0; }");
    R(".jrn-picker-label { font-family: var(--font-cinzel); font-size: 14px; color: var(--gold); text-transform: uppercase; letter-spacing: 0.04em; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }");
    R(".jrn-picker-cat { font-family: var(--font-garamond); font-style: italic; font-size: 12px; color: var(--cream-dim); margin-top: 2px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }");
    R(".jrn-picker-empty { padding: 28px 16px; text-align: center; font-family: var(--font-garamond); font-style: italic; color: var(--gold-dim); font-size: 14px; }");
    R(".jrn-insert-sheet { max-height: 80vh; display: flex; flex-direction: column; }");
    R(".jrn-blockpick-header { padding: 8px 18px 4px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }");
    R(".jrn-blockpick-title { font-family: var(--font-cinzel); font-size: 14px; font-weight: 600; color: var(--gold); text-transform: uppercase; letter-spacing: 0.04em; flex: 1; }");
    R(".jrn-blockpick-date { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }");
    R(".jrn-blockpick-divider { padding: 14px 18px 6px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); border-top: 1px solid var(--gold-border); margin-top: 8px; font-style: italic; }");
    R(".jrn-blockpick-whole .jrn-picker-spine { background: var(--gold); color: var(--bg); border-color: var(--gold); }");
    R(".jrn-linked-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; background: var(--gold-faint); border: 1px solid var(--gold-border); border-radius: 999px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gold); white-space: nowrap; margin-bottom: 8px; }");
    R(".jrn-linked-wrap.is-linked { padding-top: 4px; }");
    R(".jrn-linked-wrap.is-linked > .jrn-excerpt-source { margin-bottom: 6px; padding: 4px 10px; background: var(--gold-faint); border: 1px solid var(--gold-border); border-radius: 999px; display: inline-block; cursor: pointer; font-size: 10px; }");
    R(".jrn-linked-wrap.is-linked > .jrn-excerpt-source:hover { background: var(--gold-border); }");
    R(".jrn-embed-journal-excerpt { background: var(--bg3); border: 1px solid var(--gold-border); border-left: 3px solid var(--gold); border-radius: 6px; padding: 12px 16px; position: relative; }");
    R("body.light .jrn-embed-journal-excerpt { background: #f3ecdc; }");
    R(".jrn-embed-journal-excerpt .jrn-excerpt-source { display: inline-block; cursor: pointer; padding: 2px 0 4px; font-size: 10px; color: var(--gold); }");
    R(".jrn-embed-journal-excerpt .jrn-excerpt-source:hover { color: var(--gold-bright); text-decoration: underline; }");
    R(".jrn-emb-excerpt-body { font-family: var(--font-garamond); color: var(--cream); font-size: 16px; line-height: 1.6; font-style: italic; }");
    R("body.light .jrn-emb-excerpt-body { color: #2a2520; }");
    R('.jrn-emb-excerpt-body.is-quote::before { content: "\\201C"; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; line-height: 1; margin-right: 4px; vertical-align: -4px; }');
    R(".jrn-embed-journal-excerpt.is-heading .jrn-emb-excerpt-body { font-family: var(--font-cinzel); font-style: normal; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); font-size: 16px; }");
    R(".jrn-block-edit { position: relative; padding-right: 36px; display: flex; flex-direction: column; }");
    R(".jrn-block-del-btn { position: absolute; top: 8px; right: 4px; width: 26px; height: 26px; border-radius: 50%; background: transparent; border: 1px solid transparent; color: var(--gold-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0.55; transition: opacity 0.12s, color 0.12s, background 0.12s, border-color 0.12s; z-index: 2; }");
    R(".jrn-block-del-btn:hover { opacity: 1; color: #c75c4a; background: rgba(199, 92, 74, 0.12); border-color: rgba(199, 92, 74, 0.45); }");
    R(".jrn-block-del-btn:active { transform: scale(0.92); }");
    R(".jrn-block-del-btn svg { width: 14px; height: 14px; }");
    R(".jrn-block-confirm { order: -1; align-self: stretch; padding: 8px 12px; margin: 0 0 10px; background: rgba(199, 92, 74, 0.14); border: 1px solid rgba(199, 92, 74, 0.45); border-radius: 8px; }");
    R(".jrn-block-confirm .ann-chip-confirm-q { color: #c75c4a; }");
    R(".jrn-tripledel { margin: 0 18px 12px; padding: 14px 18px; background: rgba(199, 92, 74, 0.08); border: 1px solid rgba(199, 92, 74, 0.45); border-radius: 10px; }");
    R(".jrn-tripledel-step-label { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #c75c4a; margin-bottom: 6px; }");
    R(".jrn-tripledel-question { font-family: var(--font-garamond); font-size: 15px; line-height: 1.4; color: var(--cream); margin-bottom: 12px; }");
    R("body.light .jrn-tripledel-question { color: #2a2520; }");
    R(".jrn-tripledel-cascade { font-family: var(--font-garamond); font-size: 13.5px; line-height: 1.45; color: #d98a6a; background: rgba(199, 92, 74, 0.10); border-left: 2px solid rgba(199, 92, 74, 0.55); padding: 8px 12px; margin: -4px 0 12px; border-radius: 0 6px 6px 0; }");
    R("body.light .jrn-tripledel-cascade { color: #a8442f; }");
    R(".jrn-tripledel-input { width: 100%; box-sizing: border-box; background: var(--bg2); border: 1px solid rgba(199, 92, 74, 0.55); color: var(--cream); font-family: var(--font-cinzel); font-size: 14px; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; outline: none; text-transform: uppercase; letter-spacing: 0.06em; }");
    R(".jrn-tripledel-input:focus { border-color: #c75c4a; }");
    R("body.light .jrn-tripledel-input { background: #fff; color: #2a2520; }");
    R(".jrn-tripledel-actions { display: flex; gap: 10px; justify-content: flex-end; }");
    R(".jrn-tripledel-cancel { background: none; border: 1px solid var(--gold-border); color: var(--gold); padding: 6px 14px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }");
    R(".jrn-tripledel-cancel:hover { background: var(--gold-faint); }");
    R(".jrn-tripledel-next { background: rgba(199, 92, 74, 0.15); border: 1px solid #c75c4a; color: #c75c4a; padding: 6px 14px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }");
    R(".jrn-tripledel-next:hover { background: rgba(199, 92, 74, 0.25); }");
    R(".jrn-tripledel-final { background: #c75c4a; border: none; color: white; padding: 6px 16px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; font-weight: 600; }");
    R(".jrn-tripledel-final:disabled { background: rgba(199, 92, 74, 0.25); color: rgba(255,255,255,0.6); cursor: not-allowed; }");
    R(".jrn-tripledel-final:hover:not(:disabled) { background: #b04d3d; }");
    R(".jrn-rec-content { padding: 24px 24px 30px; text-align: center; }");
    R(".jrn-rec-requesting { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 14px; padding: 20px 0; }");
    R(".jrn-rec-status { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #d05a4a; }");
    R('.jrn-rec-status::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #d05a4a; animation: jrnPulseRec 1s ease-in-out infinite; }');
    R(".jrn-rec-status.is-paused { color: var(--gold-dim); }");
    R(".jrn-rec-status.is-paused::before { background: var(--gold-dim); animation: none; }");
    R("@keyframes jrnPulseRec { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }");
    R(".jrn-rec-time { font-family: var(--font-cinzel); font-size: 42px; font-weight: 500; color: var(--cream); letter-spacing: 0.05em; margin: 16px 0; }");
    R("body.light .jrn-rec-time { color: #2a2520; }");
    R(".jrn-rec-time-total { color: var(--gold-dim); font-size: 22px; font-weight: 400; }");
    R(".jrn-rec-waveform { display: flex; align-items: center; justify-content: center; height: 56px; gap: 3px; margin: 12px 0; }");
    R(".jrn-rec-waveform .bar { width: 3px; background: var(--gold-dim); border-radius: 1px; transition: height 0.15s, background 0.1s; min-height: 4px; }");
    R(".jrn-rec-waveform .bar.is-played { background: var(--gold); }");
    R(".jrn-rec-waveform.is-scrubbable { cursor: pointer; padding: 0 6px; }");
    R(".jrn-rec-error { font-family: var(--font-garamond); font-style: italic; color: #d05a4a; font-size: 14px; padding: 14px 24px; }");
    R(".jrn-rec-actions { display: flex; justify-content: center; gap: 14px; margin-top: 24px; align-items: center; }");
    R(".jrn-rec-cancel { background: none; padding: 10px 24px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; border: 1px solid var(--gold-dim); color: var(--gold-dim); }");
    R(".jrn-rec-cancel:hover { color: var(--gold); border-color: var(--gold); }");
    R(".jrn-rec-pause-btn { width: 56px; height: 56px; border-radius: 50%; background: none; border: 2px solid var(--gold); color: var(--gold); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }");
    R(".jrn-rec-pause-btn svg { width: 22px; height: 22px; fill: currentColor; }");
    R(".jrn-rec-pause-btn:hover { background: var(--gold-faint); }");
    R(".jrn-rec-stop-btn { width: 56px; height: 56px; border-radius: 50%; background: #d05a4a; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 4px 14px rgba(208, 90, 74, 0.4); }");
    R(".jrn-rec-stop-btn svg { width: 22px; height: 22px; }");
    R(".jrn-rec-stop-btn:hover { background: #b84a3c; }");
    R(".jrn-rec-preview-actions { display: flex; justify-content: center; margin: 4px 0 6px; }");
    R(".jrn-rec-pp { width: 64px; height: 64px; border-radius: 50%; background: var(--gold); border: none; color: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 6px 18px rgba(212, 183, 114, 0.35); }");
    R(".jrn-rec-pp svg { width: 26px; height: 26px; fill: currentColor; }");
    R(".jrn-rec-pp:hover { transform: scale(1.04); }");
    R(".jrn-rec-discard-btn { width: 52px; height: 52px; border-radius: 50%; background: none; border: 2px solid #c75c4a; color: #c75c4a; cursor: pointer; font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; }");
    R(".jrn-rec-discard-btn:hover { background: rgba(199, 92, 74, 0.12); }");
    R(".jrn-rec-confirm-btn { width: 52px; height: 52px; border-radius: 50%; background: #4caf50; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4); }");
    R(".jrn-rec-confirm-btn svg { width: 24px; height: 24px; }");
    R(".jrn-rec-confirm-btn:hover { background: #3e9a42; }");
    R(".jrn-rec-preview .jrn-rec-status { color: var(--gold); }");
    R(".jrn-rec-preview .jrn-rec-status::before { background: var(--gold); animation: none; }");
    R(".jrn-fab { position: fixed; bottom: calc(24px + env(safe-area-inset-bottom)); right: calc(22px + env(safe-area-inset-right)); width: 56px; height: 56px; border-radius: 50%; background: var(--gold); color: var(--bg); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 20px rgba(212, 183, 114, 0.4); z-index: 35; transition: transform 0.15s, background 0.15s, box-shadow 0.15s; padding: 0; }");
    R(".jrn-fab:hover { transform: scale(1.05); }");
    R(".jrn-fab:active { transform: scale(0.96); }");
    R(".jrn-fab svg { width: 24px; height: 24px; display: block; }");
    R(".jrn-fab-plus { right: calc(22px + env(safe-area-inset-right)); left: auto; }");
    R(".jrn-fab-mic { left: calc(22px + env(safe-area-inset-left)); right: auto; background: var(--bg3); color: var(--gold); border: 2px solid var(--gold); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }");
    R(".jrn-fab-mic:hover { background: var(--gold-faint); }");
    R("body.light .jrn-fab-mic { background: #fbf6e8; }");
    R(".jrn-fab-action.is-edit { background: var(--bg3); color: var(--gold); border: 2px solid var(--gold); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }");
    R(".jrn-fab-action.is-edit:hover { background: var(--gold-faint); }");
    R("body.light .jrn-fab-action.is-edit { background: #fbf6e8; }");
    R(".jrn-fab-action.is-create { background: var(--gold); color: var(--bg); box-shadow: 0 6px 20px rgba(212, 183, 114, 0.55); }");
    R(".jrn-fab-newentry { width: auto; min-width: 56px; height: 52px; border-radius: 999px; padding: 0 22px 0 18px; gap: 9px; font-family: var(--font-cinzel); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }");
    R(".jrn-fab-newentry svg { width: 19px; height: 19px; }");
    R(".jrn-fab-newentry-label { white-space: nowrap; }");
    var styleEl = document.createElement("style");
    styleEl.id = "jrn-styles";
    styleEl.textContent = rules.join("\n");
    document.head.appendChild(styleEl);
  })();

  // app/src/main/assets/src/stores/idb-adapter.js
  var IDBAdapter = (function() {
    const DB_NAME = "votreader";
    const DB_VERSION = 2;
    const STORE_NAMES = Object.freeze([
      "vot-welcomed",
      "vot-about-seen",
      "vot-garden-warning-acked",
      "vot-ann-migrated",
      "vot-recent-nav",
      "vot-prophecy-cards",
      "vot-journal",
      "vot-journal-notebooks",
      "vot-journal-index",
      "vot-journal-stats",
      "vot-bookmarks",
      "vot-notebooks",
      "vot-history",
      "vot-state",
      "vot-annotations",
      "vot-notes",
      "vot-links",
      "vot-home-order",
      "meta"
    ]);
    const STORE_SET = new Set(STORE_NAMES);
    let _dbPromise = null;
    function wrapRequest(req) {
      return new Promise(function(resolve, reject) {
        req.onsuccess = function() {
          resolve(req.result);
        };
        req.onerror = function() {
          reject(req.error || new Error("IDB request failed"));
        };
      });
    }
    function open() {
      if (_dbPromise) return _dbPromise;
      const p = new Promise(function(resolve, reject) {
        if (typeof indexedDB === "undefined" || !indexedDB) {
          reject(new Error("IndexedDB is not available"));
          return;
        }
        let req;
        try {
          req = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) {
          reject(e);
          return;
        }
        req.onupgradeneeded = function(e) {
          const db = (
            /** @type {IDBOpenDBRequest} */
            e.target.result
          );
          for (const name of STORE_NAMES) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name);
            }
          }
        };
        req.onsuccess = function(e) {
          const db = (
            /** @type {IDBOpenDBRequest} */
            e.target.result
          );
          db.onversionchange = function() {
            try {
              db.close();
            } catch (_e) {
            }
            if (_dbPromise === p) _dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = function(e) {
          const err = (
            /** @type {IDBOpenDBRequest} */
            e.target.error
          );
          reject(err || new Error("IDB open failed"));
        };
        req.onblocked = function() {
          reject(new Error("IDB open blocked (another connection holds an older version)"));
        };
      });
      p.catch(function() {
        if (_dbPromise === p) _dbPromise = null;
      });
      _dbPromise = p;
      return p;
    }
    function txStore(storeName, mode) {
      if (!STORE_SET.has(storeName)) {
        return Promise.reject(new Error("Unknown IDB store: " + storeName));
      }
      return open().then(function(db) {
        const tx = db.transaction([storeName], mode);
        const store = tx.objectStore(storeName);
        return { store, tx };
      });
    }
    function get(storeName, key) {
      return txStore(storeName, "readonly").then(function(ctx) {
        return wrapRequest(ctx.store.get(key));
      });
    }
    function put(storeName, key, value) {
      if (value === void 0) return _self.delete(storeName, key);
      return _self._putOnce(storeName, key, value).catch(function(err) {
        if (err && err.name === "AbortError") {
          return _self._putOnce(storeName, key, value);
        }
        throw err;
      });
    }
    function _putOnce(storeName, key, value) {
      return txStore(storeName, "readwrite").then(function(ctx) {
        return new Promise(function(resolve, reject) {
          let settled = false;
          const settle = function(action) {
            if (!settled) {
              settled = true;
              action();
            }
          };
          let req;
          try {
            req = ctx.store.put(value, key);
          } catch (e) {
            settle(function() {
              reject(e);
            });
            return;
          }
          req.onerror = function() {
            settle(function() {
              reject(req.error || _makeAbortError());
            });
          };
          ctx.tx.oncomplete = function() {
            settle(function() {
              resolve(void 0);
            });
          };
          ctx.tx.onerror = function() {
            settle(function() {
              reject(ctx.tx.error || req && req.error || _makeAbortError());
            });
          };
          ctx.tx.onabort = function() {
            settle(function() {
              reject(ctx.tx.error || req && req.error || _makeAbortError());
            });
          };
        });
      });
    }
    function del(storeName, key) {
      return txStore(storeName, "readwrite").then(function(ctx) {
        return new Promise(function(resolve, reject) {
          let settled = false;
          const settle = function(action) {
            if (!settled) {
              settled = true;
              action();
            }
          };
          let req;
          try {
            req = ctx.store.delete(key);
          } catch (e) {
            settle(function() {
              reject(e);
            });
            return;
          }
          req.onerror = function() {
            settle(function() {
              reject(req.error || _makeAbortError());
            });
          };
          ctx.tx.oncomplete = function() {
            settle(function() {
              resolve(void 0);
            });
          };
          ctx.tx.onabort = function() {
            settle(function() {
              reject(ctx.tx.error || req && req.error || _makeAbortError());
            });
          };
        });
      });
    }
    function getAll(storeName) {
      return txStore(storeName, "readonly").then(function(ctx) {
        return new Promise(function(resolve, reject) {
          const out = {};
          const req = ctx.store.openCursor();
          req.onsuccess = function(e) {
            const cursor = (
              /** @type {IDBRequest<IDBCursorWithValue | null>} */
              e.target.result
            );
            if (cursor) {
              out[String(cursor.key)] = cursor.value;
              cursor.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function() {
            reject(req.error || new Error("cursor failed"));
          };
        });
      });
    }
    function isQuotaError(err) {
      if (!err) return false;
      const e = (
        /** @type {any} */
        err
      );
      if (e.name === "QuotaExceededError") return true;
      if (e.code === 22) return true;
      return false;
    }
    function _makeAbortError() {
      if (typeof DOMException === "function") {
        try {
          return new DOMException("Transaction aborted", "AbortError");
        } catch (_e) {
        }
      }
      const e = new Error("Transaction aborted");
      e.name = "AbortError";
      return e;
    }
    function _resetForTests() {
      _dbPromise = null;
    }
    const _self = {
      DB_NAME,
      DB_VERSION,
      STORE_NAMES,
      open,
      get,
      put,
      delete: del,
      getAll,
      isQuotaError,
      _putOnce,
      _wrapRequest: wrapRequest,
      _resetForTests
    };
    return _self;
  })();

  // app/src/main/assets/src/stores/cached-store.js
  var _idbStoreRegistry = /* @__PURE__ */ new Set();
  function CachedStore(storageKey, defaultVal, opts) {
    opts = opts || {};
    const useIdb = opts.idb === true;
    const idbStoreName = opts.storeName || storageKey;
    const lsShim = opts.lsShim || null;
    const hydrationTimeoutMs = opts.hydrationTimeoutMs != null ? opts.hydrationTimeoutMs : 3e3;
    const legacyLsKey = opts.legacyLsKey === null ? null : opts.legacyLsKey || storageKey;
    const backgroundRetryDelays = [5e3, 1e4, 3e4, 6e4];
    function copyDefault() {
      if (Array.isArray(defaultVal)) return (
        /** @type {any} */
        []
      );
      if (defaultVal !== null && typeof defaultVal === "object") return (
        /** @type {any} */
        {}
      );
      return defaultVal;
    }
    const inst = {
      _cache: null,
      _pendingCache: null,
      /**
       * Stable defaults reference used during pending/degraded states.
       * Lazy-allocated on first _load(); cleared by _rebaseAndPromote +
       * _resetForTests so a re-entered pending state allocates fresh.
       * @type {T | null}
       */
      _defaultRef: null,
      /** Internal mirror of useIdb so tests / consumers can ask. */
      _idb: useIdb,
      _idbStoreName: idbStoreName,
      _idbLsShim: lsShim,
      _idbHydrationTimeoutMs: hydrationTimeoutMs,
      _backgroundRetryDelays: backgroundRetryDelays,
      _state: (
        /** @type {StoreState} */
        useIdb ? "pending" : "loaded"
      ),
      _queue: [],
      _replaying: false,
      _applyingPending: false,
      _hydratePromise: (
        /** @type {Promise<void> | null} */
        null
      ),
      /**
       * Sync read. LS-mode: lazy init from localStorage. IDB-mode loaded:
       * return `_cache`. IDB-mode pending/degraded: return `_pendingCache`
       * if populated (so UI shows current-session writes even while IDB
       * is slow), else a fresh defaults copy.
       */
      _load() {
        if (this._cache !== null) return this._cache;
        if (useIdb && this._state !== "loaded") {
          if (this._pendingCache !== null) return (
            /** @type {T} */
            this._pendingCache
          );
          if (!this._defaultRef) this._defaultRef = /** @type {any} */
          copyDefault();
          return (
            /** @type {T} */
            this._defaultRef
          );
        }
        try {
          this._cache = JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(defaultVal));
        } catch (_e) {
          this._cache = /** @type {any} */
          copyDefault();
        }
        return (
          /** @type {T} */
          this._cache
        );
      },
      /**
       * Persist the current cache. LS-mode: write JSON to localStorage.
       * IDB-mode: write to IDB (async, fire-and-forget; QuotaExceededError
       * is logged but not thrown — W2.7 will route to StorageHealth). If
       * `lsShim` is configured (vot-state), also writes a reduced copy to
       * localStorage for the synchronous boot-script read at index.html.
       *
       * Suppressed during `_replaying` (batched single flush at end of
       * replay) and during `_applyingPending` (pending-mode writes are
       * not durable until the eventual rebase).
       */
      _save() {
        if (this._replaying || this._applyingPending) return;
        if (useIdb) {
          const cacheToWrite = this._cache;
          if (cacheToWrite !== null) {
            IDBAdapter.put(idbStoreName, "v", cacheToWrite).catch(function(err) {
              console.warn("IDB write failed for", storageKey, err);
            });
          }
          if (lsShim) {
            try {
              const reduced = lsShim(cacheToWrite);
              localStorage.setItem(storageKey, JSON.stringify(reduced));
            } catch (e) {
              console.warn("LS shim write failed for", storageKey, e);
            }
          }
          return;
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(this._cache));
        } catch (e) {
          console.warn("localStorage write failed for", storageKey, e);
        }
      },
      raw() {
        return this._load();
      },
      /* ─── React 18 reactivity contract (subscribe + getSnapshot) ─── */
      _version: 0,
      _listeners: (
        /** @type {Set<() => void> | null} */
        null
      ),
      /**
       * Increment version + notify all subscribers. Suppressed during
       * `_replaying` (the single end-of-replay `_bump` covers the batch).
       * Fires during `_applyingPending` so the UI updates immediately
       * when a user adds a bookmark / note / etc during pending or
       * degraded states.
       */
      _bump() {
        if (this._replaying) return;
        this._version += 1;
        this._notifySubscribers();
      },
      /**
       * Iterate `_listeners` with try/catch isolation. Shared by `_bump`
       * (data-change notification) and the state-transition notification
       * sites in `_hydrate` (timeout → degraded, error → degraded) and
       * `_rebaseAndPromote` (post-replay). All three sites need the
       * same "increment + iterate with isolated try/catch" sequence; this
       * helper is the single place to maintain that loop.
       *
       * Does NOT touch `_version` — the caller decides when to bump.
       * Does NOT respect `_replaying` — state-transition callers need to
       * fire notifications even when an immediately-preceding replay
       * suppressed bumps; the replaying flag is reset before they call in.
       */
      _notifySubscribers() {
        if (!this._listeners) return;
        for (const cb of this._listeners) {
          try {
            cb();
          } catch (e) {
            console.warn("store subscriber threw for", storageKey, e);
          }
        }
      },
      subscribe(callback) {
        if (!this._listeners) this._listeners = /* @__PURE__ */ new Set();
        this._listeners.add(callback);
        return () => {
          if (this._listeners) this._listeners.delete(callback);
        };
      },
      getVersion() {
        return this._version;
      },
      /* ─── W2.2 IDB-backing API ─── */
      /** True iff the store has successfully hydrated. */
      isReady() {
        return this._state === "loaded";
      },
      /** Current state-machine state. */
      getState() {
        return this._state;
      },
      /**
       * Deferred-write guard called by mutation methods as their first
       * line in IDB-backed stores:
       *
       *   add(item) {
       *     if (this._shouldDefer('add', item)) return;
       *     this._load().push(item); this._save(); this._bump();
       *   }
       *
       * Returns `true` when the op is queued (caller exits early).
       * Returns `false` when the caller should proceed normally
       * (LS-mode, loaded state, or already inside a replay / pending
       * application).
       *
       * Side effect when returning true: pushes onto `_queue` (for
       * future rebase) AND applies the op to `_pendingCache` (for
       * UI continuity).
       */
      _shouldDefer(opName, ...args) {
        if (!useIdb) return false;
        if (this._replaying || this._applyingPending) return false;
        if (this._state === "loaded") return false;
        this._queue.push({ op: opName, args });
        this._applyToPendingCache(opName, args);
        return true;
      },
      /**
       * Apply an op to `_pendingCache` by re-invoking the store's own
       * method with the swap trick: temporarily point `_cache` at
       * `_pendingCache` so the method's normal `this._load()` /
       * `this._cache = ...` semantics work, then restore. `_save()` is
       * suppressed during this (pending writes aren't durable until
       * rebase) but `_bump()` fires so subscribers re-render with the
       * overlay.
       */
      _applyToPendingCache(opName, args) {
        const method = (
          /** @type {any} */
          this[opName]
        );
        if (typeof method !== "function") return;
        if (this._pendingCache === null) this._pendingCache = /** @type {any} */
        copyDefault();
        const savedCache = this._cache;
        this._cache = this._pendingCache;
        this._applyingPending = true;
        try {
          method.apply(this, args);
        } catch (e) {
          console.warn("pending-overlay apply failed for", storageKey, opName, e);
        } finally {
          this._pendingCache = this._cache;
          this._cache = savedCache;
          this._applyingPending = false;
        }
      },
      /**
       * Begin async hydration. Idempotent — returns the same in-flight
       * promise if already running. Resolves when state transitions to
       * 'loaded' or 'degraded'. No-op for LS-only stores (resolves
       * immediately).
       *
       * Times out per `hydrationTimeoutMs` (default 3000ms). On timeout,
       * state transitions to 'degraded' and a background retry chain
       * kicks off; the original IDB request continues, and whichever
       * succeeds first promotes the store back to 'loaded'.
       */
      _hydrate() {
        if (!useIdb) return Promise.resolve();
        if (this._hydratePromise) return this._hydratePromise;
        const self = this;
        this._hydratePromise = new Promise(function(resolve) {
          let settled = false;
          const settle = function() {
            if (settled) return;
            settled = true;
            resolve();
          };
          const timeoutId = setTimeout(function() {
            if (settled) return;
            if (self._state !== "loaded") {
              self._state = "degraded";
              self._version += 1;
              self._notifySubscribers();
              self._backgroundRetry();
            }
            settle();
          }, hydrationTimeoutMs);
          IDBAdapter.get(idbStoreName, "v").then(function(loadedData) {
            clearTimeout(timeoutId);
            if (self._state === "loaded") {
              settle();
              return;
            }
            if ((loadedData === void 0 || loadedData === null) && legacyLsKey) {
              try {
                const lsRaw = localStorage.getItem(legacyLsKey);
                if (lsRaw) {
                  const parsed = JSON.parse(lsRaw);
                  IDBAdapter.put(idbStoreName, "v", parsed).catch(function(e) {
                    console.warn("IDB legacy-LS seed failed for", storageKey, e);
                  });
                  loadedData = parsed;
                }
              } catch (e) {
                console.warn("legacy LS parse failed for", storageKey, e);
              }
            }
            self._rebaseAndPromote(
              /** @type {any} */
              loadedData
            );
            settle();
          }).catch(function(err) {
            clearTimeout(timeoutId);
            if (self._state === "loaded") {
              settle();
              return;
            }
            console.warn("IDB hydration failed for", storageKey, err);
            if (self._state !== "degraded") {
              self._state = "degraded";
              self._version += 1;
              self._notifySubscribers();
              self._backgroundRetry();
            }
            settle();
          });
        });
        return this._hydratePromise;
      },
      /**
       * Promote from any pre-loaded state to 'loaded' by rebasing the
       * queue on top of `loadedData` (the IDB snapshot). Discards
       * `_pendingCache` because the real cache is now authoritative.
       */
      _rebaseAndPromote(loadedData) {
        this._cache = /** @type {any} */
        loadedData !== void 0 && loadedData !== null ? loadedData : copyDefault();
        this._state = "loaded";
        this._pendingCache = null;
        this._defaultRef = null;
        this._replayQueueOnto();
        this._save();
        this._version += 1;
        this._notifySubscribers();
      },
      /**
       * Replay every queued op on top of `_cache`. `_save()` and
       * `_bump()` are suppressed during the loop (via `_replaying`); the
       * caller is responsible for the single end-of-replay save + bump.
       */
      _replayQueueOnto() {
        const queue = this._queue;
        this._queue = [];
        this._replaying = true;
        try {
          for (const entry of queue) {
            const method = (
              /** @type {any} */
              this[entry.op]
            );
            if (typeof method !== "function") {
              console.warn("no replay handler for op", entry.op, "in store", storageKey);
              continue;
            }
            try {
              method.apply(this, entry.args);
            } catch (e) {
              console.warn("replay handler failed for", storageKey, entry.op, e);
            }
          }
        } finally {
          this._replaying = false;
        }
      },
      /**
       * TEST-ONLY: reset the full state machine. Tests that assign
       * `_cache = null` need to also clear `_pendingCache`, `_queue`,
       * `_state`, and `_hydratePromise` — otherwise stale overlay data
       * leaks between cases. Use this helper instead of poking fields
       * directly so the reset stays consistent with future state
       * additions. Do NOT call from production code.
       *
       * @param {{ forceLoaded?: boolean }} [opts]
       *   `forceLoaded: true` skips the IDB-mode 'pending' default and
       *   sets state to 'loaded' — used by store tests that exercise
       *   LS-side fallback migration paths synchronously (e.g.
       *   link-store.test's legacy {a,b} → {source,target} cases),
       *   bypassing the async _hydrate roundtrip.
       */
      _resetForTests(opts2) {
        this._cache = null;
        this._pendingCache = null;
        this._defaultRef = null;
        this._queue = [];
        this._replaying = false;
        this._applyingPending = false;
        this._hydratePromise = null;
        const forceLoaded = opts2 && opts2.forceLoaded === true;
        this._state = forceLoaded || !useIdb ? "loaded" : "pending";
      },
      /**
       * Schedule a chain of background IDB retries while in 'degraded'
       * state. Each tick attempts `IDBAdapter.get`; on success, promotes
       * to 'loaded' via rebase. On failure, schedules the next tick from
       * `_backgroundRetryDelays`. Idempotent — bails early if already
       * loaded.
       */
      _backgroundRetry() {
        const self = this;
        let attempt = 0;
        const tick = function() {
          if (self._state === "loaded") return;
          IDBAdapter.get(idbStoreName, "v").then(function(loadedData) {
            if (self._state === "loaded") return;
            if ((loadedData === void 0 || loadedData === null) && legacyLsKey) {
              try {
                const lsRaw = localStorage.getItem(legacyLsKey);
                if (lsRaw) {
                  const parsed = JSON.parse(lsRaw);
                  IDBAdapter.put(idbStoreName, "v", parsed).catch(function() {
                  });
                  loadedData = parsed;
                }
              } catch (_e) {
              }
            }
            self._rebaseAndPromote(
              /** @type {any} */
              loadedData
            );
          }).catch(function() {
            attempt += 1;
            const delay = self._backgroundRetryDelays[Math.min(attempt, self._backgroundRetryDelays.length - 1)];
            setTimeout(tick, delay);
          });
        };
        setTimeout(tick, this._backgroundRetryDelays[0]);
      }
    };
    if (useIdb) _idbStoreRegistry.add(inst);
    return inst;
  }
  function hydrateAllStores() {
    const stores = Array.from(_idbStoreRegistry);
    if (stores.length === 0) return Promise.resolve();
    return Promise.allSettled(stores.map(function(s) {
      return s._hydrate();
    })).then(function() {
    });
  }
  function hasAnyPendingStores() {
    for (const s of _idbStoreRegistry) {
      if (s._state === "pending") return true;
    }
    return false;
  }
  var LS_SKIP_LIST = Object.freeze(["vot-state", "vot-ann-migrated"]);
  var LS_MIGRATION_FLAG_KEY = "migrated-v1";
  async function clearLegacyLs() {
    let alreadyDone;
    try {
      alreadyDone = await IDBAdapter.get("meta", LS_MIGRATION_FLAG_KEY);
    } catch (e) {
      console.warn("clearLegacyLs: meta read failed; deferring to next boot", e);
      return;
    }
    if (alreadyDone) return;
    const toClear = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("vot-") === 0 && !LS_SKIP_LIST.includes(k)) {
          toClear.push(k);
        }
      }
    } catch (e) {
      console.warn("clearLegacyLs: LS iteration failed", e);
      return;
    }
    for (const k of toClear) {
      try {
        localStorage.removeItem(k);
      } catch (_e) {
      }
    }
    try {
      await IDBAdapter.put("meta", LS_MIGRATION_FLAG_KEY, true);
    } catch (e) {
      console.warn("clearLegacyLs: meta write failed; will retry next boot", e);
    }
  }
  function extendStore(base, methods) {
    return (
      /** @type {B & M} */
      Object.assign(
        /** @type {any} */
        base,
        methods
      )
    );
  }

  // app/src/main/assets/src/utils/toast.js
  var _hideTimers = /* @__PURE__ */ new Map();
  function showToast(opts) {
    if (typeof document === "undefined") return;
    const id = opts && opts.id;
    if (!id) return;
    const html = opts && opts.html != null ? opts.html : "";
    const className = opts && opts.className || id;
    const durationMs = opts && opts.durationMs != null ? opts.durationMs : 3e3;
    const ariaLive = opts && opts.ariaLive || "polite";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.className = className;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", ariaLive);
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    void el.offsetHeight;
    el.classList.add("show");
    const prev = _hideTimers.get(id);
    if (prev != null) clearTimeout(prev);
    if (durationMs > 0) {
      _hideTimers.set(id, setTimeout(function() {
        hideToast(id);
      }, durationMs));
    } else {
      _hideTimers.delete(id);
    }
  }
  function hideToast(id) {
    if (typeof document === "undefined" || !id) return;
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
    const prev = _hideTimers.get(id);
    if (prev != null) {
      clearTimeout(prev);
      _hideTimers.delete(id);
    }
  }

  // app/src/main/assets/src/stores/app-flag-stores.js
  function buildFlagStore(key) {
    return extendStore(
      CachedStore(
        key,
        /** @type {boolean} */
        false,
        { idb: true }
      ),
      {
        /**
         * True iff the flag has been set (legacy "1" string from pre-W2
         * data is truthy after JSON.parse → number 1).
         */
        is() {
          return !!this._load();
        },
        /** Record the flag as truthy. Idempotent. */
        set() {
          if (this._shouldDefer("set")) return;
          this._cache = /** @type {any} */
          true;
          this._save();
          this._bump();
        },
        /** Record the flag as falsy. Idempotent. */
        clear() {
          if (this._shouldDefer("clear")) return;
          this._cache = /** @type {any} */
          false;
          this._save();
          this._bump();
        }
      }
    );
  }
  var WelcomedFlagStore = buildFlagStore("vot-welcomed");
  var AboutSeenFlagStore2 = buildFlagStore("vot-about-seen");
  var GardenWarningFlagStore = buildFlagStore("vot-garden-warning-acked");

  // app/src/main/assets/src/stores/prophecy-cards-store.js
  var ProphecyCardsStore = extendStore(
    CachedStore(
      "vot-prophecy-cards",
      /** @type {ProphecyCardsData} */
      {},
      { idb: true }
    ),
    {
      /**
       * Full state map (defensive copy — callers may mutate without
       * affecting the cache; flush via setAll when done).
       * @returns {ProphecyCardsData}
       */
      getAll() {
        const data = this._load();
        return Object.assign(
          /** @type {ProphecyCardsData} */
          {},
          data || {}
        );
      },
      /**
       * Boolean for one key. Defaults to false (collapsed).
       * @param {string} key
       * @returns {boolean}
       */
      getOne(key) {
        const data = this._load();
        return !!(data && data[key]);
      },
      /**
       * Set the boolean for one key. Idempotent.
       * @param {string} key
       * @param {boolean} value
       * @returns {void}
       */
      setOne(key, value) {
        if (!key) return;
        if (this._shouldDefer("setOne", key, value)) return;
        const data = this._load();
        if (value) data[key] = true;
        else delete data[key];
        this._save();
        this._bump();
      },
      /**
       * Replace the full map. Used by the consumer that batches changes
       * into a ref, then flushes via this method on commit (e.g. tap
       * commit). Filters falsy values so the persisted map stays
       * minimal.
       * @param {ProphecyCardsData | null | undefined} map
       * @returns {void}
       */
      setAll(map) {
        if (this._shouldDefer("setAll", map)) return;
        const next = {};
        if (map && typeof map === "object") {
          for (const k of Object.keys(map)) {
            if (map[k]) next[k] = true;
          }
        }
        this._cache = next;
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/state-store.js
  function _bootScriptShim(full) {
    return {
      theme: full && full.theme,
      settings: {
        fontStyle: full && full.settings && full.settings.fontStyle
      }
    };
  }
  var StateStore = extendStore(
    CachedStore(
      "vot-state",
      /** @type {VotState} */
      {},
      {
        idb: true,
        lsShim: _bootScriptShim
      }
    ),
    {
      /**
       * Full state object (HydrationGate guarantees this is the loaded
       * cache by the time any consumer calls). Returns the live cache
       * reference — mutations through it persist on the next set().
       * @returns {VotState}
       */
      get() {
        return (
          /** @type {VotState} */
          this._load()
        );
      },
      /**
       * Replace the full state. usePersistedState calls this on every
       * effect tick with the latest 8-value union. The W2.2 state
       * machine handles rebase (pending → loaded) by replaying the
       * single queued set() against the IDB-loaded base — last write
       * wins, which matches the pre-W2 semantics where every effect
       * tick wrote the full LS payload.
       *
       * @param {VotState} fullState
       * @returns {void}
       */
      set(fullState) {
        if (this._shouldDefer("set", fullState)) return;
        this._cache = /** @type {any} */
        fullState;
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/history-store.js
  function _historyKey(entry) {
    return entry.type === "letter" ? "lt:" + entry.letterId : "ch:" + entry.bookId + ":" + entry.chapterNum;
  }
  var HistoryStore = extendStore(
    CachedStore(
      "vot-history",
      /** @type {HistoryEntry[]} */
      [],
      { idb: true }
    ),
    {
      /**
       * The full history array, newest first. Live cache reference —
       * callers must NOT mutate; use add/clear/pruneDay/setAll for
       * writes.
       * @returns {HistoryEntry[]}
       */
      list() {
        return this._load();
      },
      /**
       * Prepend an entry with stamped key + ts. Caps the result at
       * 2000. Caller is responsible for the historyEnabled gate (the
       * hook does this so the gate isn't tied to the store API).
       * @param {HistoryEntry} entry
       * @returns {void}
       */
      add(entry) {
        if (!entry) return;
        if (this._shouldDefer("add", entry)) return;
        const stamped = { ...entry, key: _historyKey(entry), ts: Date.now() };
        this._cache = [stamped, ...this._load()].slice(0, 2e3);
        this._save();
        this._bump();
      },
      /**
       * Wipe the history. Idempotent.
       * @returns {void}
       */
      clear() {
        if (this._shouldDefer("clear")) return;
        this._cache = [];
        this._save();
        this._bump();
      },
      /**
       * Within the calendar day starting at (year, month, day), keep
       * only the most-recent visit per dedup key. Entries outside the
       * day are unaffected. (History is newest-first, so the FIRST
       * occurrence in iteration is the most-recent visit.)
       * @param {number} year
       * @param {number} month
       * @param {number} day
       * @returns {void}
       */
      pruneDay(year, month, day) {
        if (this._shouldDefer("pruneDay", year, month, day)) return;
        const dayStart = new Date(year, month, day).getTime();
        const dayEnd = new Date(year, month, day + 1).getTime();
        const seen = /* @__PURE__ */ new Set();
        const out = [];
        for (const e of this._load()) {
          const ts = e.ts || 0;
          const inDay = ts >= dayStart && ts < dayEnd;
          if (inDay) {
            if (seen.has(e.key)) continue;
            seen.add(e.key);
          }
          out.push(e);
        }
        this._cache = out;
        this._save();
        this._bump();
      },
      /**
       * Replace the full array. Used by the import path (W2.6).
       * @param {HistoryEntry[]} entries
       * @returns {void}
       */
      setAll(entries) {
        if (this._shouldDefer("setAll", entries)) return;
        this._cache = Array.isArray(entries) ? entries.slice(0, 2e3) : [];
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/home-order-store.js
  var DEFAULT_HOME_ORDER = Object.freeze([
    "volumes",
    "scriptures",
    "studies",
    "library",
    "settings",
    "history"
  ]);
  var HomeOrderStore = extendStore(
    CachedStore(
      "vot-home-order",
      /** @type {string[]} */
      [],
      { idb: true }
    ),
    {
      /**
       * Saved order if it passes the schema check (exact length match +
       * every default id present); otherwise DEFAULT_HOME_ORDER. Returns
       * a defensive read — callers must not mutate the returned array.
       * @returns {string[]}
       */
      get() {
        const saved = this._load();
        if (Array.isArray(saved) && saved.length === DEFAULT_HOME_ORDER.length && DEFAULT_HOME_ORDER.every((id) => saved.includes(id))) {
          return (
            /** @type {string[]} */
            saved
          );
        }
        return (
          /** @type {string[]} */
          DEFAULT_HOME_ORDER
        );
      },
      /**
       * Replace the saved order. Empty array or schema-mismatched arrays
       * are persisted as-is — the next get() will fall back to
       * DEFAULT_HOME_ORDER until set() is called with a valid order.
       * @param {string[]} order
       * @returns {void}
       */
      set(order) {
        if (this._shouldDefer("set", order)) return;
        this._cache = Array.isArray(order) ? order.slice() : [];
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/annotation-store.js
  function migrateAnnotations() {
    try {
      if (localStorage.getItem("vot-ann-migrated") === "1") return;
      const oldRaw = localStorage.getItem("vot-highlights");
      if (oldRaw) {
        const old = JSON.parse(oldRaw);
        const newAnn = {};
        const newNotes = {};
        Object.keys(old).forEach(function(key) {
          const segs = old[key] || [];
          const byGroup = /* @__PURE__ */ new Map();
          segs.forEach(function(s) {
            const gid = s.groupId || s.id;
            if (!byGroup.has(gid)) byGroup.set(gid, []);
            byGroup.get(gid).push(s);
          });
          const out = [];
          byGroup.forEach(function(entries, gid) {
            const hasNote = entries.some(function(e) {
              return e.note && e.note.trim();
            });
            const kind = (
              /** @type {'highlight' | 'underline' | 'note'} */
              hasNote ? "note" : entries[0].style === "underline" ? "underline" : "highlight"
            );
            entries.forEach(function(e) {
              out.push({
                id: e.id,
                groupId: gid,
                kind,
                color: e.color || "yellow",
                start: e.start,
                end: e.end,
                text: e.text || "",
                created: e.created || Date.now(),
                updated: e.created || Date.now()
              });
            });
            if (hasNote) {
              const bodySrc = entries.reduce(function(acc, e) {
                const t = (e.note || "").trim();
                return t.length > acc.length ? t : acc;
              }, "");
              const fullText = entries.map(function(e) {
                return e.text || "";
              }).join(" \u2026 ");
              newNotes[gid] = {
                groupId: gid,
                notebookIds: [],
                body: bodySrc,
                color: entries[0].color || "yellow",
                fullText,
                keys: [key],
                created: entries[0].created || Date.now(),
                updated: entries[0].created || Date.now()
              };
            }
          });
          if (out.length) newAnn[key] = out;
        });
        localStorage.setItem("vot-annotations", JSON.stringify(newAnn));
        localStorage.setItem("vot-notes", JSON.stringify(newNotes));
      }
      localStorage.setItem("vot-ann-migrated", "1");
    } catch (e) {
      console.warn("annotation migration failed; will retry next launch", e);
    }
  }
  migrateAnnotations();
  var AnnotationStore2 = extendStore(
    CachedStore(
      "vot-annotations",
      /** @type {AnnotationData} */
      {},
      { idb: true }
    ),
    {
      /**
       * All annotation segments anchored at `key`. Empty array if none.
       * @param {string} key
       * @returns {Annotation[]}
       */
      get(key) {
        return this._load()[key] || [];
      },
      /**
       * The full map (hlKey → segments). Mutations through it persist on
       * next _save(); callers prefer the typed methods.
       * @returns {AnnotationData}
       */
      all() {
        return this._load();
      },
      /**
       * Append an annotation segment. Stamps defaults (groupId → id, kind
       * → 'highlight', created/updated) when missing.
       * @param {string} key
       * @param {Partial<Annotation> & { id: string, start: number, end: number }} ann
       * @returns {void}
       */
      add(key, ann) {
        if (this._shouldDefer("add", key, ann)) return;
        const stamped = { ...ann };
        if (!stamped.groupId) stamped.groupId = stamped.id;
        if (!stamped.kind) stamped.kind = "highlight";
        if (!stamped.created) stamped.created = Date.now();
        stamped.updated = Date.now();
        const data = this._load();
        if (!data[key]) data[key] = [];
        data[key].push(
          /** @type {Annotation} */
          stamped
        );
        this._save();
        this._bump();
      },
      /**
       * Patch a single annotation by id (within key's bucket). No-op when
       * key or id is unknown. Bumps updated.
       * @param {string} key
       * @param {string} annId
       * @param {Partial<Annotation>} patch
       * @returns {void}
       */
      update(key, annId, patch) {
        if (this._shouldDefer("update", key, annId, patch)) return;
        const data = this._load();
        const arr = data[key];
        if (!arr) return;
        const idx = arr.findIndex((h) => h.id === annId);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...patch, updated: Date.now() };
          this._save();
          this._bump();
        }
      },
      /**
       * Remove a single annotation by id. Deletes the key's bucket when it
       * becomes empty.
       * @param {string} key
       * @param {string} annId
       * @returns {void}
       */
      remove(key, annId) {
        if (this._shouldDefer("remove", key, annId)) return;
        const data = this._load();
        if (!data[key]) return;
        data[key] = data[key].filter((h) => h.id !== annId);
        if (data[key].length === 0) delete data[key];
        this._save();
        this._bump();
      },
      /**
       * Remove every annotation under `key`.
       * @param {string} key
       * @returns {void}
       */
      removeAllForKey(key) {
        if (this._shouldDefer("removeAllForKey", key)) return;
        const data = this._load();
        delete data[key];
        this._save();
        this._bump();
      },
      /**
       * Remove every segment belonging to a group across all keys. Cleans
       * up empty key buckets as it goes.
       * @param {string} groupId
       * @returns {void}
       */
      removeGroup(groupId) {
        if (this._shouldDefer("removeGroup", groupId)) return;
        const data = this._load();
        Object.keys(data).forEach((k) => {
          data[k] = data[k].filter((h) => h.groupId !== groupId);
          if (data[k].length === 0) delete data[k];
        });
        this._cache = data;
        this._save();
        this._bump();
      },
      /**
       * All segments belonging to a group, with each tagged by its key.
       * Used by NoteSheet/MultiNotePopover to gather the multi-paragraph
       * pieces of a single note.
       * @param {string} groupId
       * @returns {{ key: string, ann: Annotation }[]}
       */
      getByGroup(groupId) {
        const data = this._load();
        const out = [];
        Object.keys(data).forEach((k) => data[k].forEach((h) => {
          if (h.groupId === groupId) out.push({ key: k, ann: h });
        }));
        return out;
      },
      /**
       * Recolor every segment in a group. Single _save() for the whole
       * batch. Bumps updated on each touched segment.
       * @param {string} groupId
       * @param {string} color
       * @returns {void}
       */
      recolorGroup(groupId, color) {
        if (this._shouldDefer("recolorGroup", groupId, color)) return;
        const data = this._load();
        const ts = Date.now();
        Object.keys(data).forEach((k) => data[k].forEach((h) => {
          if (h.groupId === groupId) {
            h.color = color;
            h.updated = ts;
          }
        }));
        this._save();
        this._bump();
      },
      /**
       * Convert a group from one kind to another (e.g. highlight → note).
       * Caller is responsible for creating/removing the corresponding
       * NoteStore record — this method only touches AnnotationStore.
       * @param {string} groupId
       * @param {'highlight' | 'underline' | 'note'} kind
       * @returns {void}
       */
      convertGroup(groupId, kind) {
        if (this._shouldDefer("convertGroup", groupId, kind)) return;
        const data = this._load();
        const ts = Date.now();
        Object.keys(data).forEach((k) => data[k].forEach((h) => {
          if (h.groupId === groupId) {
            h.kind = kind;
            h.updated = ts;
          }
        }));
        this._save();
        this._bump();
      },
      /**
       * Find the group whose segment spans the given range within `key`.
       * Returns the FIRST matching segment (which carries the groupId);
       * null if no segment fully covers [start, end].
       * @param {string} key
       * @param {number} start
       * @param {number} end
       * @returns {Annotation | null}
       */
      groupAt(key, start, end) {
        const arr = this.get(key);
        const hit = arr.find((h) => h.start <= start && h.end >= end);
        return hit || null;
      },
      /**
       * Replace the entire annotation map (W2.6 import path). Coerces
       * non-object input to `{}` so a malformed payload doesn't write
       * a bad shape into the cache.
       * @param {AnnotationData | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        this._cache = data && typeof data === "object" && !Array.isArray(data) ? data : (
          /** @type {any} */
          {}
        );
        this._save();
        this._bump();
      }
    }
  );
  var HighlightStore = AnnotationStore2;

  // app/src/main/assets/src/stores/note-store.js
  var NoteStore2 = extendStore(
    CachedStore(
      "vot-notes",
      /** @type {Record<string, Note>} */
      {},
      { idb: true }
    ),
    {
      /**
       * Look up a note by its groupId.
       * @param {string} groupId
       * @returns {Note | null}
       */
      get(groupId) {
        return this._load()[groupId] || null;
      },
      /**
       * The full underlying map (groupId → Note). Mutations through this
       * persist on next _save() but callers should prefer the typed methods.
       * @returns {Record<string, Note>}
       */
      all() {
        return this._load();
      },
      /**
       * All notes, newest first (by `updated`, falling back to `created`).
       * @returns {Note[]}
       */
      list() {
        const data = this._load();
        return Object.keys(data).map((k) => data[k]).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
      },
      /**
       * Total number of notes.
       * @returns {number}
       */
      count() {
        return Object.keys(this._load()).length;
      },
      /**
       * Upsert a note. Merges with the existing record (preserving created/
       * notebookIds when not overridden); stamps updated to now.
       * @param {string} groupId
       * @param {Partial<Note>} fields
       * @returns {void}
       */
      set(groupId, fields) {
        if (this._shouldDefer("set", groupId, fields)) return;
        const data = this._load();
        const existing = data[groupId];
        const ts = Date.now();
        data[groupId] = {
          groupId,
          notebookIds: [],
          body: "",
          color: "yellow",
          fullText: "",
          keys: [],
          created: ts,
          ...existing || {},
          ...fields,
          updated: ts
        };
        this._save();
        this._bump();
      },
      /**
       * Patch an existing note's fields. No-op when groupId is unknown.
       * @param {string} groupId
       * @param {Partial<Note>} patch
       * @returns {void}
       */
      update(groupId, patch) {
        if (this._shouldDefer("update", groupId, patch)) return;
        const data = this._load();
        if (!data[groupId]) return;
        data[groupId] = { ...data[groupId], ...patch, updated: Date.now() };
        this._save();
        this._bump();
      },
      /**
       * Delete a note record. Idempotent.
       * @param {string} groupId
       * @returns {void}
       */
      remove(groupId) {
        if (this._shouldDefer("remove", groupId)) return;
        const data = this._load();
        delete data[groupId];
        this._save();
        this._bump();
      },
      /**
       * Toggle a notebook membership on a note. No-op when the note doesn't
       * exist. Mutates the notebookIds list in place + bumps updated.
       * @param {string} groupId
       * @param {string} notebookId
       * @returns {void}
       */
      toggleNotebook(groupId, notebookId) {
        if (this._shouldDefer("toggleNotebook", groupId, notebookId)) return;
        const data = this._load();
        const note = data[groupId];
        if (!note) return;
        const ids = Array.isArray(note.notebookIds) ? note.notebookIds.slice() : [];
        const i = ids.indexOf(notebookId);
        if (i >= 0) ids.splice(i, 1);
        else ids.push(notebookId);
        data[groupId] = { ...note, notebookIds: ids, updated: Date.now() };
        this._save();
        this._bump();
      },
      /**
       * Strip a notebookId from every note (called when a notebook is
       * deleted). Only touches notes that actually had the membership.
       * @param {string} notebookId
       * @returns {void}
       */
      /**
       * Replace the entire note map (W2.6 import path).
       * @param {Record<string, Note> | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        this._cache = data && typeof data === "object" && !Array.isArray(data) ? data : (
          /** @type {any} */
          {}
        );
        this._save();
        this._bump();
      },
      pruneNotebook(notebookId) {
        if (this._shouldDefer("pruneNotebook", notebookId)) return;
        const data = this._load();
        const ts = Date.now();
        Object.keys(data).forEach((k) => {
          const ids = (data[k].notebookIds || []).filter((id) => id !== notebookId);
          if (ids.length !== (data[k].notebookIds || []).length) {
            data[k] = { ...data[k], notebookIds: ids, updated: ts };
          }
        });
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/notebook-store.js
  var NotebookStore2 = extendStore(
    CachedStore(
      "vot-notebooks",
      /** @type {NotebookStoreData} */
      { list: [] },
      { idb: true }
    ),
    {
      /**
       * All notebooks sorted by sortIndex, then created. Returns a copy
       * (callers can mutate without affecting the cache).
       * @returns {Notebook[]}
       */
      list() {
        const data = this._load();
        return (data.list || []).slice().sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0) || (a.created || 0) - (b.created || 0));
      },
      /**
       * Look up a notebook by id.
       * @param {string} id
       * @returns {Notebook | null}
       */
      get(id) {
        return (this._load().list || []).find((n) => n.id === id) || null;
      },
      /**
       * Create (or return existing dup) a notebook by name. Case-insensitive
       * dedup means tapping "Create" twice on "Devotional" returns the same
       * notebook both times. Returns null when name is blank.
       * @param {string | null | undefined} name
       * @returns {Notebook | null}
       */
      add(name) {
        const trimmed = (name || "").trim();
        if (!trimmed) return null;
        if (this._shouldDefer("add", name)) return null;
        const data = this._load();
        if (!data.list) data.list = [];
        const existing = data.list.find((n) => (n.name || "").trim().toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing;
        const id = "nb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const ts = Date.now();
        const nb = { id, name: trimmed, sortIndex: data.list.length, created: ts, updated: ts };
        data.list.push(nb);
        this._save();
        this._bump();
        return nb;
      },
      /**
       * Rename a notebook in place. No-op when name is blank or id is unknown.
       * @param {string} id
       * @param {string | null | undefined} name
       * @returns {void}
       */
      rename(id, name) {
        const trimmed = (name || "").trim();
        if (!trimmed) return;
        if (this._shouldDefer("rename", id, name)) return;
        const data = this._load();
        const nb = (data.list || []).find((n) => n.id === id);
        if (nb) {
          nb.name = trimmed;
          nb.updated = Date.now();
          this._save();
          this._bump();
        }
      },
      /**
       * Delete a notebook AND strip its id from every note that referenced
       * it (cascading via NoteStore.pruneNotebook). Notes themselves are
       * preserved — they just lose this notebook tag.
       * @param {string} id
       * @returns {void}
       */
      remove(id) {
        if (this._shouldDefer("remove", id)) return;
        const data = this._load();
        data.list = (data.list || []).filter((n) => n.id !== id);
        this._save();
        this._bump();
        NoteStore2.pruneNotebook(id);
      },
      /**
       * Replace the entire notebook list (W2.6 import path). Coerces to
       * the wrapped `{ list: [] }` shape; non-object input → empty.
       * @param {NotebookStoreData | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        const list = data && typeof data === "object" && Array.isArray(data.list) ? data.list : [];
        this._cache = /** @type {any} */
        { list };
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/recent-nav-store.js
  var RecentNavStore = extendStore(
    CachedStore(
      "vot-recent-nav",
      /** @type {NavItemRecord[]} */
      [],
      { idb: true }
    ),
    {
      /**
       * Top-20 of the recent list (newest first). Reads are synchronous
       * via `_load()` — during pending/degraded states the W2.2 overlay
       * returns the queue-applied snapshot, so the user always sees
       * their most recent writes.
       * @returns {NavItemRecord[]}
       */
      list() {
        return this._load().slice(0, 20);
      },
      /**
       * Insert a nav item at the top of the list. No-op when item is null
       * or has no `kind`. Dedups against the (kind/bookId/chapter/letterId/
       * entryId) tuple and trims the list to 30 entries.
       *
       * During W2.2 pending/degraded states, `_shouldDefer` queues the
       * op and applies it to the overlay so the UI reflects the user's
       * action immediately; on rebase the op replays against the
       * IDB-loaded base.
       *
       * @param {NavItemRecord | null | undefined} item
       * @returns {void}
       */
      add(item) {
        if (!item || !item.kind) return;
        if (this._shouldDefer("add", item)) return;
        let data = this._load();
        const sig = JSON.stringify({ kind: item.kind, bookId: item.bookId, chapter: item.chapter, letterId: item.letterId, entryId: item.entryId });
        data = data.filter((x) => JSON.stringify({ kind: x.kind, bookId: x.bookId, chapter: x.chapter, letterId: x.letterId, entryId: x.entryId }) !== sig);
        data.unshift({ ...item, ts: Date.now() });
        data = data.slice(0, 30);
        this._cache = data;
        this._save();
        this._bump();
      },
      /**
       * Replace the entire recent-nav list (W2.6 import path). Trims
       * to the 30-entry cap that add() enforces.
       * @param {NavItemRecord[] | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        this._cache = Array.isArray(data) ? data.slice(0, 30) : [];
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/link-store.js
  function hlId() {
    return "hl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  }
  function lnkId() {
    return "lnk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  }
  var LinkStore2 = extendStore(
    CachedStore(
      "vot-links",
      /** @type {Link[]} */
      [],
      { idb: true }
    ),
    {
      /**
       * State-aware load. Three branches:
       *
       *   1. _cache already populated → return it (fast path; covers both
       *      LS-mode lazy-init and IDB-mode post-hydration).
       *   2. IDB-mode pending/degraded → return overlay or fresh defaults.
       *      DO NOT read localStorage here; the CachedStore base owns the
       *      legacy-LS-fallback path inside _hydrate, and reading LS
       *      directly here would side-channel the W2.2 state machine.
       *   3. LS-mode initial load → read LS + normalize (legacy {a,b} →
       *      {source,target} migration). After migration, _normalize
       *      flushes via _save.
       *
       * The post-hydration normalization for IDB mode is wired below the
       * extendStore call via a one-shot subscribe — when the store
       * transitions to 'loaded' the first time, _normalize runs against
       * the IDB-loaded cache (which may itself have been seeded from the
       * legacy LS key by the W2.2 fallback).
       *
       * @returns {Link[]}
       */
      _load() {
        if (this._cache) return this._cache;
        if (this._idb && this._state !== "loaded") {
          return (
            /** @type {Link[]} */
            this._pendingCache !== null ? this._pendingCache : []
          );
        }
        try {
          this._cache = JSON.parse(localStorage.getItem("vot-links") || "[]");
        } catch (_e) {
          this._cache = [];
        }
        this._normalize();
        return this._cache;
      },
      /**
       * Apply the legacy {a,b} → {source,target} migration to `this._cache`.
       * Idempotent — once data is in the new shape, the filter is a no-op.
       * Drops records that can't be salvaged (both endpoints missing keys).
       * Flushes via _save when a migration actually happened so the next
       * boot reads pre-normalized data. _bump fires regardless so any
       * subscriber sees the post-normalize state.
       *
       * @returns {void}
       */
      _normalize() {
        if (!Array.isArray(this._cache)) return;
        let migrated = false;
        this._cache = this._cache.filter(function(lnk) {
          if (!lnk || typeof lnk !== "object") return false;
          if (!lnk.source && lnk.a) {
            lnk.source = lnk.a;
            migrated = true;
          }
          if (!lnk.target && lnk.b) {
            lnk.target = lnk.b;
            migrated = true;
          }
          if (lnk.a) {
            delete lnk.a;
            migrated = true;
          }
          if (lnk.b) {
            delete lnk.b;
            migrated = true;
          }
          if (!lnk.source || !lnk.source.key || !lnk.target || !lnk.target.key) {
            console.warn("[LinkStore] dropping malformed record (incomplete endpoints):", lnk.id);
            return false;
          }
          return true;
        });
        if (migrated) {
          this._save();
          this._bump();
        }
      },
      /**
       * All links touching `key` on either endpoint.
       * @param {string} key
       * @returns {Link[]}
       */
      getForKey(key) {
        return this._load().filter((lnk) => lnk.source && lnk.source.key === key || lnk.target && lnk.target.key === key);
      },
      /**
       * All links touching `prefix` (or having `prefix` as a key prefix)
       * on either endpoint. Bidirectional prefix-match — useful for the
       * inline link icon scan in LetterView/WtlbEntryView where block-
       * level keys may have selection-range suffixes.
       * @param {string} prefix
       * @returns {Link[]}
       */
      getForKeyPrefix(prefix) {
        return this._load().filter((lnk) => {
          if (!lnk.source || !lnk.source.key || !lnk.target || !lnk.target.key) return false;
          const srcMatch = lnk.source.key === prefix || lnk.source.key.startsWith(prefix + ":") || prefix.startsWith(lnk.source.key + ":");
          const tgtMatch = lnk.target.key === prefix || lnk.target.key.startsWith(prefix + ":") || prefix.startsWith(lnk.target.key + ":");
          return srcMatch || tgtMatch;
        });
      },
      /**
       * Every link in the store.
       * @returns {Link[]}
       */
      all() {
        return this._load();
      },
      /**
       * Append a link record.
       * @param {Link} link
       * @returns {void}
       */
      add(link) {
        if (this._shouldDefer("add", link)) return;
        this._load().push(link);
        this._save();
        this._bump();
      },
      /**
       * Delete a link by id. Idempotent.
       * @param {string} linkId
       * @returns {void}
       */
      remove(linkId) {
        if (this._shouldDefer("remove", linkId)) return;
        this._cache = this._load().filter((l) => l.id !== linkId);
        this._save();
        this._bump();
      },
      /**
       * Replace the entire link list (W2.6 import path). Imported data
       * is presumed to be in the post-migration {source, target} shape;
       * any half-migrated records get repaired by _normalize on the
       * next read (the post-hydration subscriber doesn't re-fire on
       * replaceAll, so we run normalize inline after the write).
       * @param {Link[] | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        this._cache = Array.isArray(data) ? data.slice() : [];
        this._normalize();
        this._save();
        this._bump();
      }
    }
  );
  (function() {
    if (!LinkStore2._idb) return;
    let unsub = null;
    unsub = LinkStore2.subscribe(function() {
      if (LinkStore2.getState() === "loaded") {
        LinkStore2._normalize();
        try {
          if (unsub) unsub();
        } catch (_e) {
        }
      }
    });
  })();
  function persistLink(sourceEndpoint, targetEndpoint) {
    if (!sourceEndpoint || !sourceEndpoint.key) return null;
    const existing = LinkStore2.getForKey(sourceEndpoint.key);
    const dup = existing.find((l) => l.source.key === targetEndpoint.key || l.target.key === targetEndpoint.key);
    if (dup) return dup;
    const link = { id: lnkId(), source: sourceEndpoint, target: targetEndpoint, created: Date.now() };
    LinkStore2.add(link);
    return link;
  }

  // app/src/main/assets/src/stores/bookmark-store.js
  function bkmId() {
    return "bkm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  }
  var BookmarkStore2 = extendStore(
    CachedStore(
      "vot-bookmarks",
      /** @type {Bookmark[]} */
      [],
      { idb: true }
    ),
    {
      /**
       * Look up a bookmark by id.
       * @param {string} id
       * @returns {Bookmark | null}
       */
      get(id) {
        return this._load().find(function(b) {
          return b.id === id;
        }) || null;
      },
      /**
       * The full bookmark list (mutation through it persists on _save()).
       * @returns {Bookmark[]}
       */
      all() {
        return this._load();
      },
      /**
       * Total bookmark count.
       * @returns {number}
       */
      count() {
        return this._load().length;
      },
      /**
       * Get all bookmarks whose hlKey exactly matches `key`, OR whose
       * key's prefix (everything before the last colon) matches — this
       * second branch lets a verse-level key match a bookmark stored on
       * the whole verse plus selection range.
       * @param {string} key
       * @returns {Bookmark[]}
       */
      getForKey(key) {
        return this._load().filter(function(b) {
          return b.hlKey === key || b.hlKey.split(":").slice(0, -1).join(":") === key;
        });
      },
      /**
       * Get all bookmarks whose hlKey shares a block-level prefix with
       * `prefix`, OR whose stored key is itself a prefix of `prefix`.
       * Mirrors the LinkStore.getForKeyPrefix() convention used by inline
       * icon scanners.
       * @param {string} prefix
       * @returns {Bookmark[]}
       */
      getForKeyPrefix(prefix) {
        return this._load().filter(function(b) {
          var k = b.hlKey;
          return k === prefix || k.indexOf(prefix + ":") === 0 || prefix.indexOf(k + ":") === 0;
        });
      },
      /**
       * Append a bookmark. No-op when bookmark is null or missing id/hlKey.
       * Stamps created/updated if absent.
       * @param {Bookmark | null | undefined} bookmark
       * @returns {void}
       */
      add(bookmark) {
        if (!bookmark || !bookmark.id || !bookmark.hlKey) return;
        if (this._shouldDefer("add", bookmark)) return;
        var ts = Date.now();
        if (!bookmark.created) bookmark.created = ts;
        if (!bookmark.updated) bookmark.updated = ts;
        this._load().push(bookmark);
        this._save();
        this._bump();
      },
      /**
       * Patch an existing bookmark — typically used to update label/thought.
       * No-op when id is unknown. Bumps updated.
       * @param {string} id
       * @param {Partial<Bookmark>} patch
       * @returns {void}
       */
      update(id, patch) {
        if (this._shouldDefer("update", id, patch)) return;
        var data = this._load();
        var idx = data.findIndex(function(b) {
          return b.id === id;
        });
        if (idx < 0) return;
        data[idx] = Object.assign({}, data[idx], patch, { updated: Date.now() });
        this._save();
        this._bump();
      },
      /**
       * Delete a bookmark by id. Idempotent.
       * @param {string} id
       * @returns {void}
       */
      remove(id) {
        if (this._shouldDefer("remove", id)) return;
        this._cache = this._load().filter(function(b) {
          return b.id !== id;
        });
        this._save();
        this._bump();
      },
      /**
       * Replace the entire bookmark list (W2.6 import path).
       * @param {Bookmark[] | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        this._cache = Array.isArray(data) ? data.slice() : [];
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/journal-media-store.js
  var JournalMediaStore2 = /* @__PURE__ */ (function() {
    var DB_NAME = "vot-journal-media";
    var DB_VERSION = 1;
    var STORE = "media";
    var _dbPromise = null;
    var _urlCache = {};
    function openDb() {
      if (_dbPromise) return _dbPromise;
      _dbPromise = new Promise(function(resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error("IndexedDB not available"));
          return;
        }
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function(e) {
          var db = (
            /** @type {IDBOpenDBRequest} */
            e.target.result
          );
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "id" });
          }
        };
        req.onsuccess = function(e) {
          resolve(
            /** @type {IDBOpenDBRequest} */
            e.target.result
          );
        };
        req.onerror = function(e) {
          reject(
            /** @type {IDBOpenDBRequest} */
            e.target.error
          );
        };
      });
      return _dbPromise;
    }
    function tx(mode) {
      return openDb().then(function(db) {
        return db.transaction([STORE], mode).objectStore(STORE);
      });
    }
    function mediaId() {
      return "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    }
    return {
      /**
       * Insert a media record. Auto-generates id/created/size/mime when
       * absent. Pre-warms the URL cache on success so the next render is
       * instant. Rejects when blob/type is missing.
       * @param {MediaRecord} record
       * @returns {Promise<string>}  the (possibly auto-generated) id
       */
      put: function(record) {
        if (!record || !record.blob || !record.type) {
          return Promise.reject(new Error("Invalid media record: requires blob + type"));
        }
        if (!record.id) record.id = mediaId();
        if (!record.created) record.created = Date.now();
        if (!record.size && record.blob.size) record.size = record.blob.size;
        if (!record.mime && record.blob.type) record.mime = record.blob.type;
        return tx("readwrite").then(function(store) {
          return new Promise(function(resolve, reject) {
            var req = store.put(record);
            req.onsuccess = function() {
              try {
                _urlCache[record.id] = URL.createObjectURL(record.blob);
              } catch (_e) {
              }
              resolve(record.id);
            };
            req.onerror = function(e) {
              reject(
                /** @type {IDBRequest} */
                e.target.error
              );
            };
          });
        });
      },
      /**
       * Read one record by id (full record including blob). Resolves null
       * when id is falsy or unknown.
       * @param {string | null | undefined} id
       * @returns {Promise<MediaRecord | null>}
       */
      get: function(id) {
        if (!id) return Promise.resolve(null);
        return tx("readonly").then(function(store) {
          return new Promise(function(resolve, reject) {
            var req = store.get(id);
            req.onsuccess = function(e) {
              resolve(
                /** @type {IDBRequest} */
                e.target.result || null
              );
            };
            req.onerror = function(e) {
              reject(
                /** @type {IDBRequest} */
                e.target.error
              );
            };
          });
        });
      },
      /**
       * Delete a record AND revoke its cached object URL. Idempotent.
       * @param {string | null | undefined} id
       * @returns {Promise<void>}
       */
      delete: function(id) {
        if (!id) return Promise.resolve();
        if (_urlCache[id]) {
          try {
            URL.revokeObjectURL(_urlCache[id]);
          } catch (_e) {
          }
          delete _urlCache[id];
        }
        return tx("readwrite").then(function(store) {
          return new Promise(function(resolve, reject) {
            var req = store.delete(id);
            req.onsuccess = function() {
              resolve();
            };
            req.onerror = function(e) {
              reject(
                /** @type {IDBRequest} */
                e.target.error
              );
            };
          });
        });
      },
      /**
       * Metadata for every record (no blobs). Cheap enough to call on
       * hub renders; expensive blobs load lazily via objectUrl().
       * @returns {Promise<MediaMetadata[]>}
       */
      list: function() {
        return tx("readonly").then(function(store) {
          return new Promise(function(resolve, reject) {
            var out = [];
            var req = store.openCursor();
            req.onsuccess = function(e) {
              var cursor = (
                /** @type {IDBRequest<IDBCursorWithValue | null>} */
                e.target.result
              );
              if (cursor) {
                var v = cursor.value;
                out.push({ id: v.id, type: v.type, mime: v.mime, size: v.size, width: v.width, height: v.height, duration: v.duration, created: v.created });
                cursor.continue();
              } else {
                resolve(out);
              }
            };
            req.onerror = function(e) {
              reject(
                /** @type {IDBRequest} */
                e.target.error
              );
            };
          });
        });
      },
      /**
       * Every id in the store. Uses openKeyCursor when available (cheaper
       * — no value materialization).
       * @returns {Promise<string[]>}
       */
      allIds: function() {
        return tx("readonly").then(function(store) {
          return new Promise(function(resolve, reject) {
            var out = [];
            var req = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
            req.onsuccess = function(e) {
              var cursor = (
                /** @type {IDBRequest<IDBCursor | null>} */
                e.target.result
              );
              if (cursor) {
                out.push(String(cursor.key !== void 0 ? cursor.key : (
                  /** @type {any} */
                  cursor.value.id
                )));
                cursor.continue();
              } else {
                resolve(out);
              }
            };
            req.onerror = function(e) {
              reject(
                /** @type {IDBRequest} */
                e.target.error
              );
            };
          });
        });
      },
      /**
       * Cached object URL for a media id. First call creates + caches the
       * URL; subsequent calls return the cached value. Resolves null when
       * id is unknown or createObjectURL throws.
       * @param {string | null | undefined} id
       * @returns {Promise<string | null>}
       */
      objectUrl: function(id) {
        if (!id) return Promise.resolve(null);
        if (_urlCache[id]) return Promise.resolve(_urlCache[id]);
        return this.get(id).then(function(rec) {
          if (!rec || !rec.blob) return null;
          try {
            var url = URL.createObjectURL(rec.blob);
            _urlCache[id] = url;
            return url;
          } catch (_e) {
            return null;
          }
        });
      },
      /**
       * Remove every blob NOT referenced by `referencedIds`. Returns the
       * count of removed records (for diagnostic logging). Used by the
       * orphan-cleanup pass on app start.
       * @param {string[]} referencedIds
       * @returns {Promise<number>}
       */
      pruneOrphans: function(referencedIds) {
        var set = {};
        (referencedIds || []).forEach(function(id) {
          set[id] = true;
        });
        var self = this;
        return this.allIds().then(function(ids) {
          var toRemove = ids.filter(function(id) {
            return !set[id];
          });
          return Promise.all(toRemove.map(function(id) {
            return self.delete(id);
          })).then(function() {
            return toRemove.length;
          });
        });
      },
      /**
       * Compress an image File/Blob to a smaller JPEG suitable for storage.
       * Returns the compressed blob + computed dimensions. Caller `put`s
       * the result with type:'image'.
       *
       * EXIF: older Android WebViews do NOT auto-apply EXIF orientation
       * to `<img>`, so phone photos (orientation 6/8) would store sideways.
       * When createImageBitmap supports `imageOrientation:'from-image'`
       * we use it so the baked pixels are upright. Falls back to the
       * <img> path otherwise.
       *
       * @param {File | Blob} fileOrBlob
       * @param {{ maxDim?: number, quality?: number }} [opts]
       *   maxDim defaults to 1600; quality defaults to 0.8.
       * @returns {Promise<{ blob: Blob, width: number, height: number }>}
       */
      compressImage: function(fileOrBlob, opts) {
        opts = opts || {};
        var maxDim = opts.maxDim || 1600;
        var quality = opts.quality || 0.8;
        function encodeFrom(source, w, h, cleanup) {
          return new Promise(function(resolve, reject) {
            if (!w || !h) {
              cleanup && cleanup();
              reject(new Error("Image has zero dimensions"));
              return;
            }
            var scale = Math.min(1, maxDim / Math.max(w, h));
            var nw = Math.max(1, Math.round(w * scale));
            var nh = Math.max(1, Math.round(h * scale));
            var canvas = document.createElement("canvas");
            canvas.width = nw;
            canvas.height = nh;
            var ctx = canvas.getContext("2d");
            if (!ctx) {
              cleanup && cleanup();
              reject(new Error("Canvas 2D unavailable"));
              return;
            }
            try {
              ctx.drawImage(source, 0, 0, nw, nh);
            } catch (_e) {
              cleanup && cleanup();
              reject(new Error("Image draw failed"));
              return;
            }
            if (!canvas.toBlob) {
              cleanup && cleanup();
              try {
                var durl = canvas.toDataURL("image/jpeg", quality);
                var bin = atob(durl.split(",")[1]);
                var arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                resolve({ blob: new Blob([arr], { type: "image/jpeg" }), width: nw, height: nh });
              } catch (_e2) {
                reject(new Error("Image encoding failed"));
              }
              return;
            }
            canvas.toBlob(function(blob) {
              cleanup && cleanup();
              if (!blob || !blob.size) {
                reject(new Error("Image encoding failed"));
                return;
              }
              resolve({ blob, width: nw, height: nh });
            }, "image/jpeg", quality);
          });
        }
        if (fileOrBlob && typeof fileOrBlob.size === "number" && fileOrBlob.size === 0) {
          return Promise.reject(new Error("Image file is empty"));
        }
        var canBitmap = typeof createImageBitmap === "function";
        if (canBitmap) {
          return createImageBitmap(fileOrBlob, { imageOrientation: "from-image" }).then(function(bmp) {
            return encodeFrom(bmp, bmp.width, bmp.height, function() {
              try {
                bmp.close && bmp.close();
              } catch (_e) {
              }
            });
          }).catch(function() {
            return createImageBitmap(fileOrBlob).then(function(bmp) {
              return encodeFrom(bmp, bmp.width, bmp.height, function() {
                try {
                  bmp.close && bmp.close();
                } catch (_e) {
                }
              });
            }).catch(function() {
              return imgPath();
            });
          });
        }
        return imgPath();
        function imgPath() {
          return new Promise(function(resolve, reject) {
            var url = URL.createObjectURL(fileOrBlob);
            var img = new Image();
            img.onload = function() {
              encodeFrom(img, img.naturalWidth, img.naturalHeight, function() {
                URL.revokeObjectURL(url);
              }).then(resolve, reject);
            };
            img.onerror = function() {
              URL.revokeObjectURL(url);
              reject(new Error("Image load failed"));
            };
            img.src = url;
          });
        }
      },
      /** Exposed for callers that need to generate ids ahead of put(). */
      mediaId
    };
  })();

  // app/src/main/assets/src/stores/journal-stats-store.js
  function _jrnDateStr(ts) {
    var d = ts ? new Date(ts) : /* @__PURE__ */ new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function _jrnDaysBetween(d1, d2) {
    var a = /* @__PURE__ */ new Date(d1 + "T00:00:00");
    var b = /* @__PURE__ */ new Date(d2 + "T00:00:00");
    return Math.round((b.getTime() - a.getTime()) / 864e5);
  }
  var MILESTONE_DEFS = [
    { key: "first", type: "entries", threshold: 1, label: "First entry" },
    { key: "entries-10", type: "entries", threshold: 10, label: "10 entries" },
    { key: "entries-30", type: "entries", threshold: 30, label: "30 entries" },
    { key: "entries-100", type: "entries", threshold: 100, label: "100 entries" },
    { key: "streak-7", type: "streak", threshold: 7, label: "7-day streak" },
    { key: "streak-30", type: "streak", threshold: 30, label: "30-day streak" },
    { key: "streak-100", type: "streak", threshold: 100, label: "100-day streak" }
  ];
  var JournalStatsStore2 = extendStore(
    CachedStore(
      "vot-journal-stats",
      /** @type {JournalStatsData} */
      {
        totalEntries: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastEntryDate: null,
        milestonesUnlocked: []
      },
      { idb: true }
    ),
    {
      /**
       * Read the full stats object.
       * @returns {JournalStatsData}
       */
      get() {
        return this._load();
      },
      /**
       * Milestone defs paired with their unlocked flag, in MILESTONE_DEFS order.
       * @returns {{ key: string, label: string, unlocked: boolean }[]}
       */
      milestones() {
        var data = this._load();
        var u = data.milestonesUnlocked || [];
        return MILESTONE_DEFS.map(function(m) {
          return { key: m.key, label: m.label, unlocked: u.indexOf(m.key) >= 0 };
        });
      },
      /**
       * Only milestones the user has unlocked.
       * @returns {{ key: string, label: string, unlocked: boolean }[]}
       */
      unlockedMilestones() {
        return this.milestones().filter(function(m) {
          return m.unlocked;
        });
      },
      /**
       * Record a NEW entry (not edits). Increments total, advances streak
       * if it's a new calendar day, checks milestones, returns the newly-
       * unlocked milestones so the caller can fire a toast.
       *
       * @param {number} ts  epoch ms (typically Date.now())
       * @returns {MilestoneDef[]}  newly-unlocked milestones (may be empty)
       */
      recordNewEntry(ts) {
        if (this._shouldDefer("recordNewEntry", ts)) return [];
        var data = this._load();
        var today = _jrnDateStr(ts);
        data.totalEntries = (data.totalEntries || 0) + 1;
        if (!data.lastEntryDate) {
          data.currentStreak = 1;
        } else {
          var delta = _jrnDaysBetween(data.lastEntryDate, today);
          if (delta === 0) {
          } else if (delta === 1) {
            data.currentStreak = (data.currentStreak || 0) + 1;
          } else {
            data.currentStreak = 1;
          }
        }
        data.lastEntryDate = today;
        if (data.currentStreak > (data.longestStreak || 0)) {
          data.longestStreak = data.currentStreak;
        }
        var newlyUnlocked = this._checkMilestones(data);
        this._save();
        return newlyUnlocked;
      },
      /**
       * Called on app load. Breaks the streak if the user missed a day
       * (today - lastEntryDate >= 2). Pure read otherwise; only writes
       * when the streak state actually changes.
       *
       * @returns {JournalStatsData}
       */
      recomputeFromLoad() {
        var data = this._load();
        if (!data.lastEntryDate) return data;
        var today = _jrnDateStr();
        var delta = _jrnDaysBetween(data.lastEntryDate, today);
        if (delta >= 2 && data.currentStreak > 0) {
          data.currentStreak = 0;
          this._save();
        }
        return data;
      },
      /**
       * Decrement total on entry deletion. Does NOT recompute streak
       * history (that would require walking every entry); the streak
       * field stays as-is and self-heals on the next recordNewEntry().
       *
       * @returns {void}
       */
      recordDeletion() {
        if (this._shouldDefer("recordDeletion")) return;
        var data = this._load();
        data.totalEntries = Math.max(0, (data.totalEntries || 0) - 1);
        this._save();
      },
      /**
       * Replace the entire stats object (W2.6 import path). Defaults
       * fill in any missing fields so a partial payload doesn't break
       * downstream readers that expect every field present.
       * @param {Partial<JournalStatsData> | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        var d = data && typeof data === "object" && !Array.isArray(data) ? data : (
          /** @type {any} */
          {}
        );
        this._cache = /** @type {any} */
        {
          totalEntries: d.totalEntries || 0,
          currentStreak: d.currentStreak || 0,
          longestStreak: d.longestStreak || 0,
          lastEntryDate: d.lastEntryDate || null,
          milestonesUnlocked: Array.isArray(d.milestonesUnlocked) ? d.milestonesUnlocked : []
        };
        this._save();
        this._bump();
      },
      /**
       * Check every milestone def against the current stats; add newly-
       * met ones to unlocked. Returns the just-added defs (caller fires
       * toasts).
       *
       * @param {JournalStatsData} data
       * @returns {MilestoneDef[]}
       */
      _checkMilestones(data) {
        var u = data.milestonesUnlocked || (data.milestonesUnlocked = []);
        var newly = [];
        MILESTONE_DEFS.forEach(function(m) {
          if (u.indexOf(m.key) >= 0) return;
          var n = m.type === "entries" ? data.totalEntries : data.currentStreak;
          if (n >= m.threshold) {
            u.push(m.key);
            newly.push(m);
          }
        });
        return newly;
      }
    }
  );
  JournalStatsStore2.recomputeFromLoad();
  (function() {
    if (!JournalStatsStore2._idb) return;
    var unsub = JournalStatsStore2.subscribe(function() {
      if (JournalStatsStore2.getState() === "loaded") {
        JournalStatsStore2.recomputeFromLoad();
        try {
          unsub();
        } catch (_e) {
        }
      }
    });
  })();
  function jrnShowMilestoneToast2(milestone) {
    if (!milestone) return;
    showToast({
      id: "jrn-milestone-toast",
      className: "jrn-milestone-toast",
      html: '<span style="font-size:14px">\u2726</span><span>Milestone: ' + (milestone.label || milestone.key) + "</span>",
      durationMs: 3e3
    });
  }

  // app/src/main/assets/src/stores/journal-index-store.js
  var JournalIndexStore2 = extendStore(
    CachedStore(
      "vot-journal-index",
      /** @type {JournalIndexData} */
      {},
      { idb: true }
    ),
    {
      /**
       * Journal-entry ids that reference `refKey`. Returns a defensive copy
       * (callers can mutate without affecting the cache). Empty array for
       * unknown keys.
       * @param {string | null | undefined} refKey
       * @returns {string[]}
       */
      entriesReferencing(refKey) {
        if (!refKey) return [];
        var data = this._load();
        return (data[refKey] || []).slice();
      },
      /**
       * Cheap "any references?" check — used by the inbound-chip render
       * guard. Avoids the array copy that entriesReferencing makes.
       * @param {string | null | undefined} refKey
       * @returns {boolean}
       */
      hasReferences(refKey) {
        if (!refKey) return false;
        var data = this._load();
        return Array.isArray(data[refKey]) && data[refKey].length > 0;
      },
      /**
       * Sync the index against one entry's current refs. Removes entryId
       * from every refKey it used to point at but no longer does, then
       * adds it to every new refKey. Net effect: the index is consistent
       * with this entry's current state.
       *
       * Caller computes `refs` via JournalHelpers.collectRefs(entry).
       *
       * @param {string} entryId
       * @param {string[]} refs
       * @returns {void}
       */
      rebuildForEntry(entryId, refs) {
        if (!entryId) return;
        if (this._shouldDefer("rebuildForEntry", entryId, refs)) return;
        var data = this._load();
        var newSet = {};
        (refs || []).forEach(function(r) {
          newSet[r] = true;
        });
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (newSet[k]) continue;
          var list = data[k];
          if (!Array.isArray(list)) continue;
          var idx = list.indexOf(entryId);
          if (idx >= 0) {
            list.splice(idx, 1);
            if (list.length === 0) delete data[k];
          }
        }
        Object.keys(newSet).forEach(function(k2) {
          if (!Array.isArray(data[k2])) data[k2] = [];
          if (data[k2].indexOf(entryId) < 0) data[k2].push(entryId);
        });
        this._save();
        this._bump();
      },
      /**
       * Strip entryId from every refKey list. Called on entry deletion.
       * Prunes empty buckets as it goes.
       * @param {string} entryId
       * @returns {void}
       */
      removeEntry(entryId) {
        if (!entryId) return;
        if (this._shouldDefer("removeEntry", entryId)) return;
        var data = this._load();
        var keys = Object.keys(data);
        var changed = false;
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var list = data[k];
          if (!Array.isArray(list)) continue;
          var idx = list.indexOf(entryId);
          if (idx >= 0) {
            list.splice(idx, 1);
            changed = true;
            if (list.length === 0) delete data[k];
          }
        }
        if (changed) {
          this._save();
          this._bump();
        }
      },
      /**
       * Slow-path reverse lookup: which refKeys does this entry contribute
       * to. Used rarely — only on entry deletion if we want to know which
       * inbound chips will lose a count. Most callers should use
       * entriesReferencing() instead.
       * @param {string} entryId
       * @returns {string[]}
       */
      refsForEntry(entryId) {
        if (!entryId) return [];
        var data = this._load();
        var out = [];
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (Array.isArray(data[k]) && data[k].indexOf(entryId) >= 0) out.push(k);
        }
        return out;
      },
      /**
       * Wipe everything. Used when journal is fully cleared via import or
       * "Clear All Personal Data".
       * @returns {void}
       */
      clear() {
        if (this._shouldDefer("clear")) return;
        this._cache = {};
        this._save();
        this._bump();
      },
      /**
       * Replace the entire reverse-index map (W2.6 import path).
       * @param {JournalIndexData | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        this._cache = data && typeof data === "object" && !Array.isArray(data) ? data : (
          /** @type {any} */
          {}
        );
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/stores/journal-store.js
  function jrnId() {
    return "j_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  }
  var JournalStore2 = extendStore(
    CachedStore(
      "vot-journal",
      /** @type {JournalStoreData} */
      { list: [] },
      { idb: true }
    ),
    {
      /**
       * All entries, newest first by `updated` (falling back to `created`).
       * @returns {JournalEntry[]}
       */
      all() {
        var data = this._load();
        return (data.list || []).slice().sort(function(a, b) {
          return (b.updated || b.created || 0) - (a.updated || a.created || 0);
        });
      },
      /**
       * All entries sorted by created date (newest first). Used by the hub
       * when the user toggles to "by created" instead of "by updated".
       * @returns {JournalEntry[]}
       */
      allByCreated() {
        var data = this._load();
        return (data.list || []).slice().sort(function(a, b) {
          return (b.created || 0) - (a.created || 0);
        });
      },
      /**
       * Look up an entry by id.
       * @param {string | null | undefined} id
       * @returns {JournalEntry | null}
       */
      get(id) {
        if (!id) return null;
        var data = this._load();
        return (data.list || []).find(function(e) {
          return e.id === id;
        }) || null;
      },
      /**
       * Total entry count.
       * @returns {number}
       */
      count() {
        return (this._load().list || []).length;
      },
      /**
       * Create a new entry. `seed` optionally provides initial blocks (e.g.
       * when opened from parallel mode pre-attaching a letter card) and
       * other top-level fields (title, notebookIds, mood). Returns the
       * fresh entry record.
       *
       * @param {Partial<JournalEntry> | null | undefined} [seed]
       * @returns {JournalEntry}
       */
      add(seed) {
        seed = seed || {};
        var ts = Date.now();
        var entry = {
          id: jrnId(),
          title: seed.title || "",
          blocks: Array.isArray(seed.blocks) ? seed.blocks.slice() : typeof JournalHelpers !== "undefined" ? JournalHelpers.defaultBlocks() : [],
          mood: seed.mood || null,
          tags: Array.isArray(seed.tags) ? seed.tags.slice() : [],
          notebookIds: Array.isArray(seed.notebookIds) ? seed.notebookIds.slice() : [],
          pinned: !!seed.pinned,
          created: ts,
          updated: ts
        };
        if (this._shouldDefer("add", entry)) return entry;
        var data = this._load();
        if (!data.list) data.list = [];
        data.list.push(entry);
        this._save();
        this._bump();
        this._reindex(entry);
        return entry;
      },
      /**
       * Apply a patch to an entry. `updated` is auto-bumped. When `blocks`
       * is in the patch, the reverse-link index is rebuilt for this entry.
       * Returns the updated entry or null when id is unknown.
       *
       * @param {string} id
       * @param {Partial<JournalEntry>} patch
       * @returns {JournalEntry | null}
       */
      update(id, patch) {
        if (!id || !patch) return null;
        if (this._shouldDefer("update", id, patch)) return null;
        var data = this._load();
        var list = data.list || [];
        var idx = list.findIndex(function(e) {
          return e.id === id;
        });
        if (idx < 0) return null;
        list[idx] = Object.assign({}, list[idx], patch, { updated: Date.now() });
        this._save();
        this._bump();
        if (patch.blocks) this._reindex(list[idx]);
        return list[idx];
      },
      /**
       * Enumerate every annotation/bookmark/link/note tied to an entry's
       * own block keys (prefix `journal:<id>:`). Drives both the delete-
       * confirmation copy (informed consent) AND the cascade. Counts are
       * per LOGICAL mark (a multi-block highlight = 1), matching how the
       * Library hubs count. Never throws — a counting hiccup must not
       * block a deletion the user asked for.
       *
       * @param {string} id
       * @returns {AssociatedScan}
       */
      _scanAssociated(id) {
        var prefix = "journal:" + id + ":";
        var hlG = {};
        var ulG = {};
        var noteG = {};
        var annKeys = [];
        var bkmIds = [];
        var linkIds = [];
        try {
          if (typeof AnnotationStore !== "undefined") {
            var all = AnnotationStore.all() || {};
            Object.keys(all).forEach(function(k) {
              if (k.indexOf(prefix) !== 0) return;
              annKeys.push(k);
              (all[k] || []).forEach(function(a) {
                var gid = a.groupId || a.id;
                if (a.kind === "note") noteG[gid] = 1;
                else if (a.kind === "underline") ulG[gid] = 1;
                else hlG[gid] = 1;
              });
            });
          }
          if (typeof NoteStore !== "undefined" && NoteStore._load) {
            var nraw = NoteStore._load() || {};
            Object.keys(nraw).forEach(function(gid) {
              var keys = nraw[gid] && nraw[gid].keys || [];
              if (keys.some(function(k) {
                return String(k).indexOf(prefix) === 0;
              })) noteG[gid] = 1;
            });
          }
          if (typeof BookmarkStore !== "undefined" && BookmarkStore.getForKeyPrefix) {
            (BookmarkStore.getForKeyPrefix("journal:" + id) || []).forEach(function(b) {
              bkmIds.push(b.id);
            });
          }
          if (typeof LinkStore !== "undefined") {
            (LinkStore.all() || []).forEach(function(ln) {
              var s = ln.source || {}, t = ln.target || {};
              var hit = s.key && String(s.key).indexOf(prefix) === 0 || t.key && String(t.key).indexOf(prefix) === 0 || s.type === "journal" && s.entryId === id || t.type === "journal" && t.entryId === id;
              if (hit) linkIds.push(ln.id);
            });
          }
        } catch (_e) {
        }
        return {
          annKeys,
          noteGroupIds: Object.keys(noteG),
          bookmarkIds: bkmIds,
          linkIds,
          highlights: Object.keys(hlG).length,
          underlines: Object.keys(ulG).length,
          notes: Object.keys(noteG).length,
          bookmarks: bkmIds.length,
          links: linkIds.length
        };
      },
      /**
       * Just the count summary for the delete-confirmation modal.
       * @param {string} id
       * @returns {{ highlights: number, underlines: number, notes: number, bookmarks: number, links: number, total: number }}
       */
      associatedDataCounts(id) {
        var s = this._scanAssociated(id);
        return {
          highlights: s.highlights,
          underlines: s.underlines,
          notes: s.notes,
          bookmarks: s.bookmarks,
          links: s.links,
          total: s.highlights + s.underlines + s.notes + s.bookmarks + s.links
        };
      },
      /**
       * Human-readable summary phrase for the delete confirmation
       * ("2 highlights, 1 bookmark and 1 link"). Null when nothing is tied.
       * @param {string} id
       * @returns {string | null}
       */
      associatedDataSummary(id) {
        var c = this.associatedDataCounts(id);
        if (!c.total) return null;
        var parts = [];
        function p(n, s) {
          if (n > 0) parts.push(n + " " + s + (n === 1 ? "" : "s"));
        }
        p(c.highlights, "highlight");
        p(c.underlines, "underline");
        p(c.notes, "note");
        p(c.bookmarks, "bookmark");
        p(c.links, "link");
        var last = parts.pop();
        return parts.length ? parts.join(", ") + " and " + last : last || null;
      },
      /**
       * Cascade-delete every annotation/bookmark/link tied to an entry.
       * Best-effort: a failure in one store doesn't block the others or
       * the parent entry deletion.
       * @param {string} id
       * @returns {void}
       */
      _purgeAssociated(id) {
        var s = this._scanAssociated(id);
        try {
          s.noteGroupIds.forEach(function(gid) {
            if (typeof NoteStore !== "undefined") NoteStore.remove(gid);
            if (typeof AnnotationStore !== "undefined") AnnotationStore.removeGroup(gid);
          });
          if (typeof AnnotationStore !== "undefined") {
            s.annKeys.forEach(function(k) {
              AnnotationStore.removeAllForKey(k);
            });
          }
          if (typeof BookmarkStore !== "undefined") {
            s.bookmarkIds.forEach(function(bid) {
              BookmarkStore.remove(bid);
            });
          }
          if (typeof LinkStore !== "undefined") {
            s.linkIds.forEach(function(lid) {
              LinkStore.remove(lid);
            });
          }
        } catch (_e) {
        }
      },
      /**
       * Delete an entry. Cascades FIRST so journal-scoped annotations/
       * bookmarks/links can't dangle. Centralized here because every
       * delete path (hub card menu, viewer) routes through remove() — it
       * cannot be bypassed.
       * @param {string} id
       * @returns {void}
       */
      remove(id) {
        if (!id) return;
        if (this._shouldDefer("remove", id)) return;
        this._purgeAssociated(id);
        var data = this._load();
        data.list = (data.list || []).filter(function(e) {
          return e.id !== id;
        });
        this._save();
        this._bump();
        if (typeof JournalIndexStore !== "undefined") JournalIndexStore.removeEntry(id);
        if (typeof JournalStatsStore !== "undefined") JournalStatsStore.recordDeletion();
      },
      /**
       * Set the pin flag explicitly.
       * @param {string} id
       * @param {boolean} pinned
       * @returns {JournalEntry | null}
       */
      setPinned(id, pinned) {
        return this.update(id, { pinned: !!pinned });
      },
      /**
       * Toggle the pin flag.
       * @param {string} id
       * @returns {JournalEntry | null}
       */
      togglePin(id) {
        var e = this.get(id);
        if (!e) return null;
        return this.update(id, { pinned: !e.pinned });
      },
      /**
       * Toggle a notebook membership on an entry.
       * @param {string} id
       * @param {string} notebookId
       * @returns {JournalEntry | null}
       */
      toggleNotebook(id, notebookId) {
        var e = this.get(id);
        if (!e || !notebookId) return null;
        var ids = (e.notebookIds || []).slice();
        var i = ids.indexOf(notebookId);
        if (i >= 0) ids.splice(i, 1);
        else ids.push(notebookId);
        return this.update(id, { notebookIds: ids });
      },
      /**
       * Strip a deleted notebookId from every entry that referenced it.
       * Symmetric with NoteStore.pruneNotebook.
       * @param {string} notebookId
       * @returns {void}
       */
      pruneNotebook(notebookId) {
        if (!notebookId) return;
        if (this._shouldDefer("pruneNotebook", notebookId)) return;
        var data = this._load();
        var list = data.list || [];
        var changed = false;
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (!e.notebookIds || !e.notebookIds.length) continue;
          var before = e.notebookIds.length;
          e.notebookIds = e.notebookIds.filter(function(n) {
            return n !== notebookId;
          });
          if (e.notebookIds.length !== before) {
            e.updated = Date.now();
            changed = true;
          }
        }
        if (changed) {
          this._save();
          this._bump();
        }
      },
      /**
       * Case-insensitive substring search across entry title, block text,
       * and tags. Empty query returns all() (sorted newest first).
       * @param {string | null | undefined} q
       * @returns {JournalEntry[]}
       */
      search(q) {
        var query = (q || "").trim().toLowerCase();
        if (!query) return this.all();
        return this.all().filter(function(e) {
          if ((e.title || "").toLowerCase().indexOf(query) >= 0) return true;
          var blocks = e.blocks || [];
          for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var t = b.text || b.caption || b.label || b.title || "";
            if (typeof t === "string" && t.toLowerCase().indexOf(query) >= 0) return true;
          }
          if (e.tags && e.tags.join(" ").toLowerCase().indexOf(query) >= 0) return true;
          return false;
        });
      },
      /**
       * Every mediaId referenced by every entry. Drives the orphan-cleanup
       * pass that identifies stale IDB blobs.
       * @returns {string[]}
       */
      collectAllMediaIds() {
        var ids = [];
        var list = this._load().list || [];
        for (var i = 0; i < list.length; i++) {
          var blocks = list[i].blocks || [];
          for (var j = 0; j < blocks.length; j++) {
            var b = blocks[j];
            if ((b.type === "image" || b.type === "audio") && b.mediaId) ids.push(b.mediaId);
          }
        }
        return ids;
      },
      /**
       * True iff `mediaId` is referenced by a block in ANY entry other
       * than `exceptEntryId`. Drives shared-media protection — a journal→
       * journal embed shares the source's mediaId, so wiping the blob
       * just because the SOURCE block is deleted would break every embed
       * of it.
       * @param {string | null | undefined} mediaId
       * @param {string} exceptEntryId
       * @returns {boolean}
       */
      isMediaReferencedElsewhere(mediaId, exceptEntryId) {
        if (!mediaId) return false;
        var list = this._load().list || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === exceptEntryId) continue;
          var blocks = list[i].blocks || [];
          for (var j = 0; j < blocks.length; j++) {
            var b = blocks[j];
            if ((b.type === "image" || b.type === "audio") && b.mediaId === mediaId) return true;
          }
        }
        return false;
      },
      /**
       * Rebuild the JournalIndexStore reverse-index for an entry. Called
       * automatically on add() and on update() when blocks change.
       * No-op if JournalIndexStore or JournalHelpers is unavailable
       * (defensive — entries can still be created/edited if the index
       * isn't loaded yet).
       * @param {JournalEntry} entry
       * @returns {void}
       */
      _reindex(entry) {
        if (typeof JournalIndexStore === "undefined" || typeof JournalHelpers === "undefined") return;
        try {
          var refs = JournalHelpers.collectRefs(entry);
          JournalIndexStore.rebuildForEntry(entry.id, refs);
        } catch (e) {
          console.warn("Journal index update failed", e);
        }
      },
      /**
       * Wipe everything (entries + reverse-index). Used by "Clear All
       * Personal Data" in Settings.
       * @returns {void}
       */
      clear() {
        if (this._shouldDefer("clear")) return;
        this._cache = { list: [] };
        this._save();
        this._bump();
        if (typeof JournalIndexStore !== "undefined") JournalIndexStore.clear();
      },
      /**
       * Replace the entire journal-entry list (W2.6 import path). The
       * imported payload is presumed self-consistent — index rebuild
       * happens at the import-handler layer after every store is
       * written, not per-store.
       * @param {JournalStoreData | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        var list = data && typeof data === "object" && Array.isArray(data.list) ? data.list : [];
        this._cache = /** @type {any} */
        { list };
        this._save();
        this._bump();
      }
    }
  );
  var JournalNotebookStore = extendStore(
    CachedStore(
      "vot-journal-notebooks",
      /** @type {JournalNotebookStoreData} */
      { list: [] },
      { idb: true }
    ),
    {
      /**
       * All journal-notebooks sorted by sortIndex, then created.
       * @returns {JournalNotebook[]}
       */
      list() {
        var data = this._load();
        return (data.list || []).slice().sort(function(a, b) {
          return (a.sortIndex || 0) - (b.sortIndex || 0) || (a.created || 0) - (b.created || 0);
        });
      },
      /**
       * Look up a notebook by id.
       * @param {string} id
       * @returns {JournalNotebook | null}
       */
      get(id) {
        return (this._load().list || []).find(function(n) {
          return n.id === id;
        }) || null;
      },
      /**
       * Create a notebook with the given name. Returns null when name is
       * blank. NOT case-insensitive dedup (unlike NotebookStore) — callers
       * have not requested it for the journal side.
       * @param {string | null | undefined} name
       * @returns {JournalNotebook | null}
       */
      add(name) {
        var trimmed = (name || "").trim();
        if (!trimmed) return null;
        if (this._shouldDefer("add", name)) return null;
        var data = this._load();
        if (!data.list) data.list = [];
        var id = "jnb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        var ts = Date.now();
        var nb = { id, name: trimmed, sortIndex: data.list.length, created: ts, updated: ts };
        data.list.push(nb);
        this._save();
        this._bump();
        return nb;
      },
      /**
       * Rename a notebook in place. No-op when name is blank or id is unknown.
       * @param {string} id
       * @param {string | null | undefined} name
       * @returns {void}
       */
      rename(id, name) {
        var trimmed = (name || "").trim();
        if (!trimmed) return;
        if (this._shouldDefer("rename", id, name)) return;
        var data = this._load();
        var nb = (data.list || []).find(function(n) {
          return n.id === id;
        });
        if (nb) {
          nb.name = trimmed;
          nb.updated = Date.now();
          this._save();
          this._bump();
        }
      },
      /**
       * Delete a notebook AND cascade — strip its id from every journal
       * entry that referenced it (via JournalStore.pruneNotebook).
       * @param {string} id
       * @returns {void}
       */
      remove(id) {
        if (this._shouldDefer("remove", id)) return;
        var data = this._load();
        data.list = (data.list || []).filter(function(n) {
          return n.id !== id;
        });
        this._save();
        this._bump();
        if (typeof JournalStore2 !== "undefined") JournalStore2.pruneNotebook(id);
      },
      /**
       * Replace the entire journal-notebook list (W2.6 import path).
       * @param {JournalNotebookStoreData | null | undefined} data
       * @returns {void}
       */
      replaceAll(data) {
        if (this._shouldDefer("replaceAll", data)) return;
        var list = data && typeof data === "object" && Array.isArray(data.list) ? data.list : [];
        this._cache = /** @type {any} */
        { list };
        this._save();
        this._bump();
      }
    }
  );

  // app/src/main/assets/src/components/ExpandableText.jsx
  function ExpandableText(props) {
    var useState2 = React.useState;
    var text = props.text || "";
    var threshold = props.threshold || 240;
    var className = props.className || "";
    var tapToToggle = !!props.tapToToggle;
    var _exp = useState2(false);
    var expanded = _exp[0];
    var setExpanded = _exp[1];
    if (!text || text.length <= threshold) {
      return /* @__PURE__ */ React.createElement("div", { className }, text);
    }
    var head = text.slice(0, threshold).trim();
    function toggle(e) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      setExpanded(function(v) {
        return !v;
      });
    }
    var divProps = { className: className + (expanded ? " is-expanded" : " is-collapsed") };
    if (tapToToggle) {
      divProps.onClick = toggle;
      divProps.role = "button";
      divProps.tabIndex = 0;
      divProps.onKeyDown = function(e) {
        if (e.key === "Enter" || e.key === " ") toggle(e);
      };
      divProps.style = { cursor: "pointer" };
      divProps.title = expanded ? "Tap to collapse" : "Tap to read more";
    }
    return /* @__PURE__ */ React.createElement("div", { ...divProps }, expanded ? text : head + "\u2026", " ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "jrn-expand-toggle", onClick: toggle }, expanded ? "Show less" : "Show more"));
  }
  var JrnExpandable2 = ExpandableText;
  if (typeof window !== "undefined") {
    window.ExpandableText = ExpandableText;
    window.JrnExpandable = ExpandableText;
  }

  // app/src/main/assets/src/components/ErrorBoundary.jsx
  var ErrorBoundary = class extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(err) {
      return { error: err };
    }
    render() {
      if (!this.state.error) return this.props.children;
      return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", textAlign: "center", color: "#e0c97f", fontFamily: "Georgia, serif" } }, /* @__PURE__ */ React.createElement("h2", { style: { marginBottom: "1rem" } }, "Something went wrong"), /* @__PURE__ */ React.createElement("p", { style: { color: "#b0a080", fontSize: "0.85rem", maxWidth: "400px", margin: "0 auto 1.5rem", wordBreak: "break-word" } }, String(this.state.error)), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => location.reload(),
          style: { padding: "0.6rem 1.6rem", background: "transparent", border: "1px solid #e0c97f", color: "#e0c97f", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit" }
        },
        "Reload App"
      ));
    }
  };

  // app/src/main/assets/src/components/HydrationGate.jsx
  var { useState, useEffect } = React;
  function HydrationGate({ children }) {
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
      let alive = true;
      try {
        performance.mark("vot-hydration-start");
      } catch (_e) {
      }
      const startMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      hydrateAllStores().then(() => clearLegacyLs()).finally(() => {
        if (!alive) return;
        const endMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        const elapsed = endMs - startMs;
        window.__hydrationLatencyMs = elapsed;
        try {
          performance.mark("vot-hydration-end");
          performance.measure("vot-hydration", "vot-hydration-start", "vot-hydration-end");
        } catch (_e) {
        }
        setHydrated(true);
      });
      return () => {
        alive = false;
      };
    }, []);
    if (!hydrated) {
      return /* @__PURE__ */ React.createElement("div", { className: "hydration-loading", role: "status", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("div", { className: "hydration-loading-text" }, "VOTReader"));
    }
    return children;
  }

  // app/src/main/assets/src/utils/platform-bridge.js
  var isAndroid = !!(typeof window !== "undefined" && /** @type {any} */
  window.AndroidBridge);
  var androidImpl = {
    setLightStatusBar: (light) => (
      /** @type {any} */
      window.AndroidBridge.setLightStatusBar(light)
    ),
    setKeepScreenOn: (enabled) => (
      /** @type {any} */
      window.AndroidBridge.setKeepScreenOn(enabled)
    ),
    setImmersiveMode: (immersive) => (
      /** @type {any} */
      window.AndroidBridge.setImmersiveMode(immersive)
    ),
    setZoomEnabled: (enabled) => (
      /** @type {any} */
      window.AndroidBridge.setZoomEnabled(enabled)
    ),
    resetZoom: () => (
      /** @type {any} */
      window.AndroidBridge.resetZoom()
    ),
    getZoomScale: () => (
      /** @type {any} */
      window.AndroidBridge.getZoomScale()
    ),
    haptic: (style) => (
      /** @type {any} */
      window.AndroidBridge.haptic(style)
    ),
    startAudioSession: () => (
      /** @type {any} */
      window.AndroidBridge.startAudioSession()
    ),
    endAudioSession: () => (
      /** @type {any} */
      window.AndroidBridge.endAudioSession()
    ),
    requestMicPermission: () => (
      /** @type {any} */
      window.AndroidBridge.requestMicPermission()
    ),
    nativeRecordStart: () => (
      /** @type {any} */
      window.AndroidBridge.nativeRecordStart()
    ),
    nativeRecordPause: () => (
      /** @type {any} */
      window.AndroidBridge.nativeRecordPause()
    ),
    nativeRecordResume: () => (
      /** @type {any} */
      window.AndroidBridge.nativeRecordResume()
    ),
    nativeRecordAmplitude: () => (
      /** @type {any} */
      window.AndroidBridge.nativeRecordAmplitude()
    ),
    nativeRecordStop: () => (
      /** @type {any} */
      window.AndroidBridge.nativeRecordStop()
    ),
    nativeRecordCancel: () => (
      /** @type {any} */
      window.AndroidBridge.nativeRecordCancel()
    ),
    // Android takeScreenshot is sync (PixelCopy on a binder thread); wrap in
    // Promise.resolve to give consumers a uniform Promise<string> shape on
    // both platforms. Web returns html2canvas's genuine async Promise.
    takeScreenshot: async (top, max, q) => (
      /** @type {any} */
      window.AndroidBridge.takeScreenshot(top, max, q)
    ),
    openFilePicker: () => (
      /** @type {any} */
      window.AndroidBridge.openFilePicker()
    ),
    saveToDownloads: (name, content) => (
      /** @type {any} */
      window.AndroidBridge.saveToDownloads(name, content)
    ),
    getCrashLog: () => (
      /** @type {any} */
      window.AndroidBridge.getCrashLog()
    )
  };
  var NYI_TAG = "[PlatformBridge]";
  var notYetImplemented = (name) => () => {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`${NYI_TAG} ${name}() web impl pending (W1.3-W1.5)`);
    }
  };
  var _webWakeLockSentinel = null;
  var _webWakeLockRequestInFlight = false;
  var _webWakeLockLastWarnedReason = null;
  function _warnWakeLock(tag, e) {
    if (typeof console === "undefined" || !console.warn) return;
    const reason = e && e.message || String(e);
    if (reason === _webWakeLockLastWarnedReason) return;
    _webWakeLockLastWarnedReason = reason;
    console.warn(`[PlatformBridge] setKeepScreenOn(${tag}) failed:`, reason);
  }
  function webSetKeepScreenOn(enabled) {
    try {
      const wakeLock = (
        /** @type {any} */
        navigator.wakeLock
      );
      if (!wakeLock || typeof wakeLock.request !== "function") return;
      if (enabled) {
        if (_webWakeLockSentinel && !_webWakeLockSentinel.released) return;
        if (_webWakeLockRequestInFlight) return;
        _webWakeLockRequestInFlight = true;
        wakeLock.request("screen").then((sentinel) => {
          _webWakeLockSentinel = sentinel;
          _webWakeLockLastWarnedReason = null;
        }).catch((e) => {
          _warnWakeLock("true", e);
        }).finally(() => {
          _webWakeLockRequestInFlight = false;
        });
      } else if (_webWakeLockSentinel) {
        const s = _webWakeLockSentinel;
        _webWakeLockSentinel = null;
        _webWakeLockLastWarnedReason = null;
        try {
          const p = s.release();
          if (p && typeof p.catch === "function") {
            p.catch((e) => _warnWakeLock("false", e));
          }
        } catch (e) {
          _warnWakeLock("false", e);
        }
      }
    } catch (e) {
      _warnWakeLock("unexpected", e);
    }
  }
  function webSetImmersiveMode(immersive) {
    try {
      if (immersive) {
        const elem = (
          /** @type {any} */
          document.documentElement
        );
        if (elem && typeof elem.requestFullscreen === "function") {
          const result = elem.requestFullscreen();
          if (result && typeof result.catch === "function") {
            result.catch((e) => {
              if (typeof console !== "undefined" && console.warn) {
                console.warn("[PlatformBridge] setImmersiveMode(true) requestFullscreen blocked:", e && e.message || e);
              }
            });
          }
        }
      } else {
        const doc = (
          /** @type {any} */
          document
        );
        if (typeof doc.exitFullscreen === "function" && doc.fullscreenElement) {
          const result = doc.exitFullscreen();
          if (result && typeof result.catch === "function") {
            result.catch((e) => {
              if (typeof console !== "undefined" && console.warn) {
                console.warn("[PlatformBridge] setImmersiveMode(false) exitFullscreen failed:", e && e.message || e);
              }
            });
          }
        }
      }
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[PlatformBridge] setImmersiveMode unexpected error:",
          /** @type {any} */
          e.message || e
        );
      }
    }
  }
  var webSetZoomEnabled = () => {
  };
  var webResetZoom = () => {
  };
  function webOpenFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = (ev) => {
      const cb = (
        /** @type {any} */
        window.__onImportFile
      );
      const file = ev.target.files && ev.target.files[0];
      if (!file) {
        if (typeof cb === "function") cb(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (re) => {
        const result = String(re.target.result || "");
        const idx = result.indexOf(",");
        const base64 = idx >= 0 ? result.substring(idx + 1) : result;
        if (typeof cb === "function") cb(base64);
      };
      reader.onerror = () => {
        if (typeof cb === "function") cb(null);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
  function webSaveToDownloads(filename, content) {
    try {
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
          a.remove();
        } catch (_e) {
        }
      }, 0);
      return "ok";
    } catch (e) {
      return "error:" + /** @type {any} */
      (e && /** @type {any} */
      e.message || e);
    }
  }
  var SCREENSHOT_IGNORE_CLASSES = [
    "tabs-overview-layer",
    "top-nav",
    "back-hint-row",
    "chapter-nav-sticky",
    "reading-dot-global",
    "surprise-fab",
    "mode-toggle-wrap"
  ];
  async function webTakeScreenshot(_topCropDp, maxDim, jpegQuality) {
    if (typeof /** @type {any} */
    globalThis.html2canvas !== "function") return "";
    const h2c = (
      /** @type {any} */
      globalThis.html2canvas
    );
    const isLight = typeof document !== "undefined" && document.body.classList.contains("light");
    const bg = isLight ? "#f7f2e8" : "#07070e";
    try {
      const canvas = await h2c(document.body, {
        backgroundColor: bg,
        scale: Math.min(
          /** @type {any} */
          window.devicePixelRatio || 1,
          2
        ),
        useCORS: true,
        logging: false,
        allowTaint: false,
        imageTimeout: 2e3,
        ignoreElements: (el) => el.classList && SCREENSHOT_IGNORE_CLASSES.some((c) => el.classList.contains(c))
      });
      const w = canvas.width;
      const h = canvas.height;
      const scale = Math.min(maxDim / w, maxDim / h, 1);
      let out = canvas;
      if (scale < 1) {
        const c2 = document.createElement("canvas");
        c2.width = Math.round(w * scale);
        c2.height = Math.round(h * scale);
        const ctx = c2.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
        }
        out = c2;
      }
      return out.toDataURL("image/jpeg", Math.max(0, Math.min(100, jpegQuality)) / 100);
    } catch (_e) {
      return "";
    }
  }
  var _webRecorder = {
    /** @type {any} */
    mediaStream: null,
    /** @type {any} */
    mediaRecorder: null,
    /** @type {any} */
    audioContext: null,
    /** @type {any} */
    analyser: null,
    /** @type {Uint8Array | null} */
    ampBuffer: null,
    /** @type {any[]} */
    chunks: [],
    /** @type {number} */
    startTimeMs: 0,
    /** @type {number} */
    accumulatedMs: 0,
    /** @type {string} */
    mime: "",
    /** @type {'inactive'|'recording'|'paused'} */
    state: "inactive"
  };
  function _webRecorderCleanup() {
    if (_webRecorder.mediaStream) {
      try {
        _webRecorder.mediaStream.getTracks().forEach((t) => t.stop());
      } catch (_e) {
      }
      _webRecorder.mediaStream = null;
    }
    if (_webRecorder.audioContext) {
      try {
        _webRecorder.audioContext.close();
      } catch (_e) {
      }
      _webRecorder.audioContext = null;
    }
    _webRecorder.analyser = null;
    _webRecorder.ampBuffer = null;
    _webRecorder.chunks = [];
    _webRecorder.mediaRecorder = null;
    _webRecorder.state = "inactive";
    _webRecorder.startTimeMs = 0;
    _webRecorder.accumulatedMs = 0;
    _webRecorder.mime = "";
  }
  function _webRecordBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.substring(idx + 1) : result);
      };
      reader.onerror = () => reject(new Error("blob-read-failed"));
      reader.readAsDataURL(blob);
    });
  }
  function _fireRecordingComplete(b64, durMs, mime) {
    const cb = (
      /** @type {any} */
      window.__onNativeRecordingComplete
    );
    if (typeof cb === "function") {
      try {
        cb(b64, durMs, mime);
      } catch (e) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "[PlatformBridge] __onNativeRecordingComplete consumer threw:",
            /** @type {any} */
            e.message || e
          );
        }
      }
    }
  }
  function webRequestMicPermission() {
    const cbName = "__onMicPermissionResult";
    const fire = (granted) => {
      const cb = (
        /** @type {any} */
        window[cbName]
      );
      if (typeof cb === "function") {
        try {
          cb(granted);
        } catch (_e) {
        }
      }
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fire(false);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      _webRecorder.mediaStream = stream;
      fire(true);
    }).catch((_err) => {
      fire(false);
    });
  }
  function webNativeRecordStart() {
    if (typeof MediaRecorder === "undefined") return "error:no-MediaRecorder";
    if (!_webRecorder.mediaStream) return "error:no-stream";
    const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];
    let mime = "";
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
        mime = c;
        break;
      }
    }
    if (!mime) {
      _webRecorderCleanup();
      return "error:unsupported-codec";
    }
    let rec;
    try {
      rec = new MediaRecorder(_webRecorder.mediaStream, { mimeType: mime });
    } catch (e) {
      _webRecorderCleanup();
      return "error:" + /** @type {any} */
      (e && /** @type {any} */
      e.message || e);
    }
    _webRecorder.mediaRecorder = rec;
    _webRecorder.chunks = [];
    _webRecorder.mime = mime;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) _webRecorder.chunks.push(e.data);
    };
    rec.onstop = () => {
      const finalMime = _webRecorder.mime || mime;
      const blob = new Blob(_webRecorder.chunks, { type: finalMime });
      const durMs = _webRecorder.accumulatedMs;
      _webRecordBlobToBase64(blob).then((b64) => _fireRecordingComplete(b64, durMs, finalMime)).catch(() => _fireRecordingComplete(null, 0, finalMime)).finally(() => _webRecorderCleanup());
    };
    try {
      const AudioCtx = (
        /** @type {any} */
        window.AudioContext || /** @type {any} */
        window.webkitAudioContext
      );
      if (AudioCtx) {
        const ctx = new AudioCtx();
        _webRecorder.audioContext = ctx;
        const source = ctx.createMediaStreamSource(_webRecorder.mediaStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        _webRecorder.analyser = analyser;
        _webRecorder.ampBuffer = new Uint8Array(analyser.frequencyBinCount);
      }
    } catch (_e) {
    }
    rec.start(250);
    _webRecorder.startTimeMs = Date.now();
    _webRecorder.accumulatedMs = 0;
    _webRecorder.state = "recording";
    return "ok";
  }
  function webNativeRecordPause() {
    if (!_webRecorder.mediaRecorder || _webRecorder.state !== "recording") return "error:not-recording";
    try {
      _webRecorder.mediaRecorder.pause();
    } catch (e) {
      return "error:" + /** @type {any} */
      (e && /** @type {any} */
      e.message || e);
    }
    _webRecorder.accumulatedMs += Date.now() - _webRecorder.startTimeMs;
    _webRecorder.state = "paused";
    return "ok";
  }
  function webNativeRecordResume() {
    if (!_webRecorder.mediaRecorder || _webRecorder.state !== "paused") return "error:not-paused";
    try {
      _webRecorder.mediaRecorder.resume();
    } catch (e) {
      return "error:" + /** @type {any} */
      (e && /** @type {any} */
      e.message || e);
    }
    _webRecorder.startTimeMs = Date.now();
    _webRecorder.state = "recording";
    return "ok";
  }
  function webNativeRecordAmplitude() {
    if (!_webRecorder.analyser || !_webRecorder.ampBuffer) return 0;
    _webRecorder.analyser.getByteTimeDomainData(_webRecorder.ampBuffer);
    const buf = _webRecorder.ampBuffer;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return Math.round(rms * 32767);
  }
  function webNativeRecordStop() {
    if (!_webRecorder.mediaRecorder) return;
    if (_webRecorder.state === "recording") {
      _webRecorder.accumulatedMs += Date.now() - _webRecorder.startTimeMs;
    }
    _webRecorder.state = "inactive";
    try {
      _webRecorder.mediaRecorder.stop();
    } catch (_e) {
      _fireRecordingComplete(null, 0, _webRecorder.mime);
      _webRecorderCleanup();
    }
  }
  function webNativeRecordCancel() {
    if (_webRecorder.mediaRecorder) {
      try {
        _webRecorder.mediaRecorder.onstop = null;
        if (_webRecorder.mediaRecorder.state !== "inactive") {
          _webRecorder.mediaRecorder.stop();
        }
      } catch (_e) {
      }
    }
    _webRecorderCleanup();
  }
  var webImpl = {
    // Category 1 — genuine no-ops on web
    setLightStatusBar: () => {
    },
    // CSS body.light handles the theme
    startAudioSession: () => {
    },
    // Browser handles audio session natively
    endAudioSession: () => {
    },
    // Category 2 — safe defaults
    getZoomScale: () => 1,
    getCrashLog: () => "[]",
    // W7.4 will populate the JS DiagnosticLog
    // Category 3 — real web impls
    takeScreenshot: webTakeScreenshot,
    // Tier A (html2canvas)
    setKeepScreenOn: webSetKeepScreenOn,
    // Tier B.1 (WakeLock + de-dup)
    openFilePicker: webOpenFilePicker,
    // Tier B.2 (DOM input + FileReader → __onImportFile)
    saveToDownloads: webSaveToDownloads,
    // Tier B.2 (Blob + URL.createObjectURL + anchor)
    setImmersiveMode: webSetImmersiveMode,
    // Tier B.3 (Fullscreen API, best-effort)
    setZoomEnabled: webSetZoomEnabled,
    // Tier B.3 (no-op — browsers handle zoom natively)
    resetZoom: webResetZoom,
    // Tier B.3 (no-op — no JS API to reset user pinch-zoom)
    // Tier C (W1.4): MediaRecorder + AnalyserNode recording flow
    requestMicPermission: webRequestMicPermission,
    nativeRecordStart: webNativeRecordStart,
    nativeRecordPause: webNativeRecordPause,
    nativeRecordResume: webNativeRecordResume,
    nativeRecordAmplitude: webNativeRecordAmplitude,
    nativeRecordStop: webNativeRecordStop,
    nativeRecordCancel: webNativeRecordCancel,
    // Category 4 — not-yet-implemented warnings (void returns only)
    haptic: notYetImplemented("haptic")
    // future; haptic JS wiring not yet present
  };
  var PlatformBridge = isAndroid ? androidImpl : webImpl;

  // app/src/main/assets/src/hooks/use-ref-mirror.js
  function useRefMirror(value) {
    const r = React.useRef(value);
    r.current = value;
    return r;
  }

  // app/src/main/assets/src/hooks/useMarkAsRead.js
  function useMarkAsRead(enabled, onMarkRead) {
    React.useEffect(() => {
      if (!enabled) return;
      window.__onReadingComplete = onMarkRead;
      return () => {
        window.__onReadingComplete = null;
      };
    }, [enabled, onMarkRead]);
  }
  function useReadProgress({ savedReadItems, markAsReadEnabled }) {
    const [readItems, setReadItems] = React.useState(savedReadItems || {});
    const enabledRef = useRefMirror(markAsReadEnabled);
    const VERSION_ID = "v1";
    const getReadKey = (bid, cid) => `${VERSION_ID}:${bid}:${cid}`;
    const isRead = (bid, cid) => !!readItems[getReadKey(bid, cid)];
    const markRead = (bid, cid) => {
      if (enabledRef.current === false) return;
      const key = getReadKey(bid, cid);
      if (!readItems[key]) setReadItems((prev) => ({ ...prev, [key]: true }));
    };
    const unmarkRead = (bid, cid) => {
      const key = getReadKey(bid, cid);
      setReadItems((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };
    const clearAllProgress = () => setReadItems({});
    const clearReadForBook = (bid) => {
      setReadItems((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.startsWith(`${VERSION_ID}:${bid}:`)) delete next[k];
        });
        return next;
      });
    };
    return { readItems, isRead, markRead, unmarkRead, clearAllProgress, clearReadForBook };
  }

  // app/src/main/assets/src/hooks/use-saved-state.js
  function _validateTabState(s) {
    if ((s.screen === "matthew-ch" || s.screen === "bible-ch") && s.chapterNum == null) s.screen = "home";
    if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-letter$/.test(s.screen) && !s.letterId) s.screen = "home";
    if (s.screen === "vot-letter" && !s.letterId) s.screen = "home";
    if (s.screen === "hm-letter" && !s.letterId) s.screen = "home";
    if (/^(wtlb-one-entry|wtlb-two-entry|blessed-entry|holy-days-entry)$/.test(s.screen) && !s.letterId) s.screen = "home";
    if (s.screen === "garden-view" && s.gardenPage == null) s.screen = "home";
    if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-index$/.test(s.screen)) s.screen = "volumes-home";
    if ((s.screen === "matthew-idx" || s.screen === "bible-idx") && !s.bookId) s.screen = "home";
    if (s.screen === "search") s.screen = "home";
    if (s.screen === "scripture-genre" && !s.genreId) s.screen = "scriptures-home";
    if (s.screen === "bible-study-chapter" && (!s.studyId || !s.studyChapterId)) s.screen = "studies-home";
    if (s.screen === "bible-study-index" && !s.studyId) s.screen = "studies-home";
    if (s.screen === "journal-viewer" || s.screen === "journal-editor") s.screen = "journal-home";
    return s;
  }
  function useSavedState() {
    return React.useMemo(() => {
      try {
        const raw = StateStore.get();
        const s = raw && typeof raw === "object" ? Object.assign({}, raw) : {};
        if (Array.isArray(s.tabs)) s.tabs = s.tabs.map((t) => Object.assign({}, t));
        _validateTabState(s);
        if (Array.isArray(s.tabs)) s.tabs.forEach(_validateTabState);
        return s;
      } catch (_e) {
        return {};
      }
    }, []);
  }

  // app/src/main/assets/src/hooks/use-history.js
  var _subscribeHistory = HistoryStore.subscribe.bind(HistoryStore);
  var _getHistorySnapshot = () => HistoryStore.list();
  function useHistory(historyEnabled) {
    const readHistory = React.useSyncExternalStore(
      _subscribeHistory,
      _getHistorySnapshot
    );
    const enabledRef = useRefMirror(historyEnabled);
    const addToHistory = (entry) => {
      if (enabledRef.current === false) return;
      HistoryStore.add(entry);
    };
    const clearHistory = () => {
      HistoryStore.clear();
    };
    const pruneHistoryDay = (year, month, day) => {
      HistoryStore.pruneDay(year, month, day);
    };
    return { readHistory, addToHistory, clearHistory, pruneHistoryDay };
  }

  // app/src/main/assets/src/hooks/use-thumbnails.js
  function useThumbnails({
    tabs,
    activeTabIdx,
    activeTab,
    tabsEnabled,
    tabsOverviewOpen
  }) {
    const [tabThumbnails, setTabThumbnails] = React.useState({});
    React.useEffect(() => {
      let cancelled = false;
      idbReadAll().then((thumbs) => {
        if (cancelled) return;
        setTabThumbnails(thumbs || {});
      });
      return () => {
        cancelled = true;
      };
    }, []);
    const thumbGcTimerRef = React.useRef(null);
    React.useEffect(() => {
      clearTimeout(thumbGcTimerRef.current);
      thumbGcTimerRef.current = setTimeout(() => {
        const liveKeys = new Set(tabs.map((t) => tabContentKey(t)));
        const deadKeys = Object.keys(tabThumbnails).filter((k) => !liveKeys.has(k));
        if (deadKeys.length === 0) return;
        deadKeys.forEach((k) => idbDelete(k));
        setTabThumbnails((prev) => {
          const out = {};
          for (const k of Object.keys(prev)) if (liveKeys.has(k)) out[k] = prev[k];
          return out;
        });
      }, 2e3);
      return () => clearTimeout(thumbGcTimerRef.current);
    }, [tabs, tabThumbnails]);
    const activeTabIdxRef = useRefMirror(activeTabIdx);
    const tabsRef = useRefMirror(tabs);
    const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);
    const captureInFlightRef = React.useRef(false);
    const thumbnailsRef = React.useRef({});
    const captureActiveTabThumbnail = React.useCallback(async () => {
      if (!tabsEnabled) return;
      if (tabsOverviewOpenRef.current) return;
      if (captureInFlightRef.current) return;
      const tab = tabsRef.current[activeTabIdxRef.current];
      if (!tab) return;
      const key = tabContentKey(tab);
      const navEl = document.querySelector(".top-nav");
      const navHeightDp = navEl ? Math.round(navEl.getBoundingClientRect().height) : 0;
      const applyThumb = (dataUrl) => {
        if (!dataUrl) return;
        thumbnailsRef.current[key] = dataUrl;
        setTabThumbnails((prev) => ({ ...prev, [key]: dataUrl }));
        idbPut(key, dataUrl);
      };
      document.body.classList.add("capturing-thumb");
      void document.body.offsetHeight;
      captureInFlightRef.current = true;
      try {
        const dataUrl = await PlatformBridge.takeScreenshot(navHeightDp, 1440, 90);
        applyThumb(dataUrl);
      } catch (_e) {
      } finally {
        captureInFlightRef.current = false;
        document.body.classList.remove("capturing-thumb");
      }
    }, [tabsEnabled]);
    React.useEffect(() => {
      let scrollTimer = null;
      let currentEl = null;
      const onScroll = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(captureActiveTabThumbnail, 300);
      };
      const attach = () => {
        if (__scrollEl !== currentEl) {
          if (currentEl) currentEl.removeEventListener("scroll", onScroll);
          currentEl = __scrollEl;
          if (currentEl) currentEl.addEventListener("scroll", onScroll, { passive: true });
        }
      };
      attach();
      const poll = setInterval(attach, 400);
      return () => {
        clearInterval(poll);
        clearTimeout(scrollTimer);
        if (currentEl) currentEl.removeEventListener("scroll", onScroll);
      };
    }, [captureActiveTabThumbnail]);
    React.useEffect(() => {
      const update = () => {
        const w = window.innerWidth || 1, h = window.innerHeight || 1;
        document.documentElement.style.setProperty("--card-ar", w + " / " + h);
      };
      update();
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }, []);
    React.useEffect(() => {
      if (!tabsEnabled) return;
      if (tabsOverviewOpen) return;
      const timer = setTimeout(captureActiveTabThumbnail, 350);
      return () => clearTimeout(timer);
    }, [
      activeTab.screen,
      activeTab.bookId,
      activeTab.chapterNum,
      activeTab.letterId,
      activeTab.studyId,
      activeTab.studyChapterId,
      activeTab.genreId,
      activeTab.gardenPage,
      activeTabIdx,
      tabsEnabled,
      tabsOverviewOpen,
      captureActiveTabThumbnail
    ]);
    return { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail };
  }

  // app/src/main/assets/src/hooks/use-scroll-memory.js
  function getScrollKey(scr, bid, cnum, lid, sid, scid) {
    if (scr === "matthew-ch" || scr === "bible-ch") return bid + "-" + cnum;
    if (scr === "bible-study-chapter") return "study-" + (sid || "") + "-" + (scid || "");
    if (scr === "hm-letter") return "entry-" + lid;
    var _sc = COL_BY_LETTER_SC.get(scr);
    if (_sc) {
      var pfx = _sc.kind === "holy-days" ? "holyday" : _sc.kind === "letter" ? "letter" : _sc.kind;
      return pfx + "-" + lid;
    }
    return scr;
  }
  function useScrollMemory({
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    activeTab,
    activeTabIdx,
    updateActiveTab,
    surpriseAnchor,
    tabsOverviewOpen
  }) {
    const scrollKeyRef = React.useRef(getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId));
    const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);
    const flushScrollToActiveTab = React.useCallback(() => {
      if (tabsOverviewOpenRef.current) return;
      const key = scrollKeyRef.current;
      if (!key || !__scrollEl) return;
      const { scrollTop, scrollHeight, clientHeight } = __scrollEl;
      const max = Math.max(scrollHeight - clientHeight, 1);
      const pct = Math.max(0, Math.min(1, scrollTop / max));
      updateActiveTab((t) => ({
        scrollPositions: { ...t.scrollPositions || {}, [key]: { y: scrollTop, pct } }
      }));
    }, [updateActiveTab]);
    React.useEffect(() => {
      let timeout;
      let currentEl = null;
      const onScroll = () => {
        clearTimeout(timeout);
        timeout = setTimeout(flushScrollToActiveTab, 120);
      };
      const attach = () => {
        if (__scrollEl !== currentEl) {
          if (currentEl) currentEl.removeEventListener("scroll", onScroll);
          currentEl = __scrollEl;
          if (currentEl) currentEl.addEventListener("scroll", onScroll, { passive: true });
        }
      };
      attach();
      const poll = setInterval(attach, 300);
      return () => {
        clearInterval(poll);
        if (currentEl) currentEl.removeEventListener("scroll", onScroll);
        clearTimeout(timeout);
      };
    }, [flushScrollToActiveTab]);
    React.useEffect(() => {
      const onVis = () => {
        if (document.visibilityState === "hidden") flushScrollToActiveTab();
      };
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("pagehide", flushScrollToActiveTab);
      return () => {
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pagehide", flushScrollToActiveTab);
      };
    }, [flushScrollToActiveTab]);
    React.useEffect(() => {
      const key = getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId);
      scrollKeyRef.current = key;
      if (surpriseAnchor) return;
      const saved = activeTab && activeTab.scrollPositions && activeTab.scrollPositions[key];
      const savedY = saved == null ? null : typeof saved === "number" ? saved : typeof saved.y === "number" ? saved.y : null;
      if (typeof savedY === "number" && savedY > 0) {
        const timer = setTimeout(() => {
          if (__scrollEl) __scrollEl.scrollTop = savedY;
        }, 0);
        return () => clearTimeout(timer);
      }
      setTimeout(() => {
        if (__scrollEl) __scrollEl.scrollTop = 0;
      }, 0);
    }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx]);
    return { flushScrollToActiveTab };
  }

  // app/src/main/assets/src/hooks/use-reading-dwell.js
  function useReadingDwell({ dwellMs, initialActiveReadKey }) {
    const [activeReadKey, setActiveReadKeyRaw] = React.useState(initialActiveReadKey);
    const dwellTimerRef = React.useRef(null);
    const dwellAccRef = React.useRef(0);
    const dwellStartRef = React.useRef(null);
    const dwellKeyRef = React.useRef(null);
    const pendingReadCommitRef = React.useRef(null);
    const DWELL_MS = () => dwellMs ? Number(dwellMs) : 2e4;
    const commitDwellNow = () => {
      if (!dwellKeyRef.current) return;
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      if (pendingReadCommitRef.current) {
        pendingReadCommitRef.current();
        pendingReadCommitRef.current = null;
      }
      setActiveReadKeyRaw(dwellKeyRef.current);
      dwellAccRef.current = 0;
      dwellStartRef.current = null;
      dwellKeyRef.current = null;
    };
    const cancelDwell = () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      dwellAccRef.current = 0;
      dwellStartRef.current = null;
      dwellKeyRef.current = null;
      pendingReadCommitRef.current = null;
    };
    const scheduleDwell = () => {
      if (!dwellKeyRef.current || dwellTimerRef.current) return;
      const remaining = DWELL_MS() - dwellAccRef.current;
      dwellStartRef.current = Date.now();
      dwellTimerRef.current = setTimeout(() => {
        if (pendingReadCommitRef.current) {
          pendingReadCommitRef.current();
          pendingReadCommitRef.current = null;
        }
        setActiveReadKeyRaw(dwellKeyRef.current);
        dwellTimerRef.current = null;
        dwellAccRef.current = 0;
        dwellStartRef.current = null;
        dwellKeyRef.current = null;
      }, remaining);
    };
    const pauseDwell = () => {
      if (!dwellTimerRef.current || !dwellStartRef.current) return;
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
      dwellAccRef.current += Date.now() - dwellStartRef.current;
      dwellStartRef.current = null;
    };
    const setActiveReadKey = (key, commitFn) => {
      cancelDwell();
      dwellKeyRef.current = key;
      pendingReadCommitRef.current = commitFn || null;
      if (document.visibilityState === "visible") scheduleDwell();
    };
    React.useEffect(() => {
      window.__onDwellCommit = commitDwellNow;
      return () => {
        if (window.__onDwellCommit === commitDwellNow) window.__onDwellCommit = null;
      };
    }, [commitDwellNow]);
    React.useEffect(() => {
      const onVis = () => {
        if (document.visibilityState === "hidden") pauseDwell();
        else scheduleDwell();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }, []);
    return { activeReadKey, setActiveReadKey, cancelDwell };
  }

  // app/src/main/assets/src/hooks/use-settings.js
  function useSettings({ savedSettings, theme }) {
    const [settings, setSettings] = React.useState(() => {
      const savedS = savedSettings || {};
      const migrated = {};
      if ("showChrome" in savedS) {
        if (savedS.showChrome === false) {
          migrated.showChapterTitle = false;
          migrated.showSectionHeadings = false;
        }
      }
      if ("showChapterSummary" in savedS && savedS.showChapterSummary === false) {
        migrated.showChapterTitle = false;
      }
      return {
        showReadingDot: false,
        showSurpriseButton: false,
        markAsRead: false,
        showProgressBar: true,
        // Search defaults — only the values that are actually wired to
        // VotSearch.search() at the call site. Previously this block also
        // declared 12 searchInclude* flags (Notes, Verses, Headings,
        // StudyNotes, CrossRefs, Footnotes, Letters, LetterBody, Wtlb,
        // Blessed, HolyDays, BibleStudies) plus searchFuzzy and
        // searchAllTranslations — all dead defaults (declared, never read,
        // never exposed in UI). Removed 2026-05-11 so future devs aren't
        // misled into wiring against them. If granular include/exclude
        // ever ships, declare AT THAT TIME with both a Settings UI toggle
        // AND a consumer in the search call.
        searchUseStopWords: true,
        searchCorpus: "all",
        // 'all' | 'scriptures' | 'volumes'
        haptic: true,
        keepScreenOn: true,
        scriptureLayout: "genre",
        gardenTier: GARDEN_DEFAULT_TIER,
        showSettingsGear: false,
        translation: "nkjv",
        restoredNames: false,
        showChapterTitle: true,
        showSectionHeadings: true,
        showInlineEchoes: true,
        tabsEnabled: false,
        searchEnabled: true,
        historyEnabled: true,
        historyInNav: false,
        arrowLayout: "split",
        // "split" | "right" | "left" | "nav" | "off"
        ...savedS,
        ...migrated
        // migration wins over stale saved values
      };
    });
    const toggleSetting = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    const updateSetting = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }));
    React.useEffect(() => {
      document.body.classList.toggle("light", theme === "light");
      document.body.classList.toggle("no-gear", !settings.showSettingsGear);
      document.body.classList.toggle("no-search", settings.searchEnabled === false);
      document.body.classList.toggle("no-history", settings.historyEnabled === false);
      document.body.classList.toggle("history-in-nav", !!settings.historyInNav);
      document.body.classList.toggle("arrows-right", settings.arrowLayout === "right");
      document.body.classList.toggle("arrows-left", settings.arrowLayout === "left");
      document.body.classList.toggle("arrows-nav", settings.arrowLayout === "nav");
      document.body.classList.toggle("arrows-off", settings.arrowLayout === "off");
      const customFontsEl = (
        /** @type {HTMLStyleElement | null} */
        document.getElementById("custom-fonts")
      );
      if (customFontsEl) customFontsEl.disabled = settings.fontStyle !== "modern";
      PlatformBridge.setLightStatusBar(theme === "light");
      PlatformBridge.setKeepScreenOn(settings.keepScreenOn !== false);
    }, [theme, settings]);
    return { settings, setSettings, toggleSetting, updateSetting };
  }

  // app/src/main/assets/src/hooks/use-sheet-orchestration.js
  function useSheetOrchestration({
    screen,
    letterId,
    bookId,
    chapterNum,
    studyId,
    studyChapterId,
    setHlTick
  }) {
    const [annChip, setAnnChip] = React.useState(null);
    const [linkSidebarKey, setLinkSidebarKey] = React.useState(null);
    const [linkPickerSource, setLinkPickerSource] = React.useState(null);
    const [linkRefineRequest, setLinkRefineRequest] = React.useState(null);
    const [lastLinkCreated, setLastLinkCreated] = React.useState(null);
    const [linkPickerMode, setLinkPickerMode] = React.useState(null);
    const linkPickerOnPickRef = React.useRef(null);
    const [noteSheetTarget, setNoteSheetTarget] = React.useState(null);
    const [notebookPickerTarget, setNotebookPickerTarget] = React.useState(null);
    const [multiNotePayload, setMultiNotePayload] = React.useState(null);
    const [bookmarkPopoverPayload, setBookmarkPopoverPayload] = React.useState(null);
    const [bookmarkCreatePending, setBookmarkCreatePending] = React.useState(null);
    const [inboundJournalPayload, setInboundJournalPayload] = React.useState(null);
    const openLinkSidebar = React.useCallback((hlKey) => setLinkSidebarKey(hlKey), []);
    const closeLinkSidebar = React.useCallback(() => setLinkSidebarKey(null), []);
    const openLinkPicker = React.useCallback((selInfo) => {
      const hlKey = typeof selInfo === "string" ? selInfo : selInfo.hlKey;
      if (!hlKey) return;
      const parts = hlKey.split(":");
      let label = hlKey;
      if (parts[0] === "bible") {
        const b = _allBooks()[parts[1]];
        label = (b ? b.title : parts[1]) + " " + parts[2] + ":" + parts[3];
      } else if (parts[0] === "study") {
        const m = parts[1].match(/^(.+)-(\d+)$/);
        if (m) label = m[1].charAt(0).toUpperCase() + m[1].slice(1) + " " + m[2] + (parts[2] && parts[2] !== "0" ? ":" + parts[2] : "");
      } else if (parts[0] === "letter" || parts[0] === "wtlb" || parts[0] === "blessed" || parts[0] === "holy-days") {
        const ctx = findEntryContext(parts[1], parts[0]);
        if (ctx && ctx.title) label = ctx.title;
      } else if (parts[0] === "journal") {
        const eid = parts[1];
        const je = typeof JournalStore !== "undefined" ? JournalStore.get(eid) : null;
        if (je && typeof JournalHelpers !== "undefined") {
          label = "Journal \xB7 " + (JournalHelpers.entryDisplayTitle(je) || "Untitled");
        }
      }
      const src = typeof selInfo === "string" ? { key: hlKey, label } : { key: hlKey, label, start: selInfo.start, end: selInfo.end, text: selInfo.text };
      setLinkPickerSource(src);
    }, []);
    const closeLinkPicker = React.useCallback(() => {
      setLinkPickerSource(null);
      setLinkRefineRequest(null);
      setLastLinkCreated(null);
      setLinkPickerMode(null);
      linkPickerOnPickRef.current = null;
      setHlTick((t) => t + 1);
    }, [setHlTick]);
    const openLinkPickerForTarget = React.useCallback((mode, onPick) => {
      linkPickerOnPickRef.current = typeof onPick === "function" ? onPick : null;
      setLinkPickerSource({ key: null, label: null, picker: true });
      setLinkPickerMode(mode || "card");
      setLinkRefineRequest(null);
      setLastLinkCreated(null);
    }, []);
    const openNoteSheet = React.useCallback((groupId, startInEditMode) => {
      setNoteSheetTarget({ groupId, startInEditMode: !!startInEditMode });
      setAnnChip(null);
    }, []);
    const closeNoteSheet = React.useCallback(() => setNoteSheetTarget(null), []);
    React.useEffect(() => {
      window.__openLinkPicker = openLinkPicker;
      window.__openLinkPickerForTarget = openLinkPickerForTarget;
      return () => {
        delete window.__openLinkPicker;
        delete window.__openLinkPickerForTarget;
      };
    }, [openLinkPicker, openLinkPickerForTarget]);
    React.useEffect(() => {
      window.__openNote = openNoteSheet;
      return () => {
        delete window.__openNote;
      };
    }, [openNoteSheet]);
    React.useEffect(() => {
      window.__openLinkSidebar = openLinkSidebar;
      return () => {
        delete window.__openLinkSidebar;
      };
    }, [openLinkSidebar]);
    React.useEffect(() => {
      window.__showAnnChip = (x, y, hlKey, groupId) => setAnnChip({ x, y, hlKey, groupId });
      return () => {
        delete window.__showAnnChip;
      };
    }, []);
    React.useEffect(() => {
      window.__showMultiNote = (groupIds, x, y) => setMultiNotePayload({ groupIds, x, y });
      return () => {
        delete window.__showMultiNote;
      };
    }, []);
    React.useEffect(() => {
      window.__openBookmarkPopover = (bkmIds, x, y, hlKey) => setBookmarkPopoverPayload({ bkmIds, x, y, hlKey });
      return () => {
        delete window.__openBookmarkPopover;
      };
    }, []);
    React.useEffect(() => {
      window.__bookmarkCreate = (info) => setBookmarkCreatePending(info || null);
      return () => {
        delete window.__bookmarkCreate;
      };
    }, []);
    React.useEffect(() => {
      window.__openJournalInbound = (refKey, label) => setInboundJournalPayload(refKey ? { refKey, label } : null);
      return () => {
        delete window.__openJournalInbound;
      };
    }, []);
    React.useEffect(() => {
      window.__bookmarkEdit = (bkmId2, opts) => {
        if (!bkmId2 || typeof BookmarkStore === "undefined") return;
        const bkm = BookmarkStore.get(bkmId2);
        if (!bkm) return;
        const sourceLabel = typeof _bookmarkSourceLabel === "function" ? _bookmarkSourceLabel(bkm.hlKey) : "";
        setBookmarkCreatePending({
          editId: bkm.id,
          hlKey: bkm.hlKey,
          sourceLabel,
          excerpt: "",
          defaultLabel: bkm.label || "",
          currentLabel: bkm.label || "",
          currentThought: bkm.thought || "",
          atSource: !!(opts && opts.atSource)
        });
      };
      return () => {
        delete window.__bookmarkEdit;
      };
    }, []);
    React.useEffect(() => {
      if (typeof window.__hideSelectionToolbar === "function") window.__hideSelectionToolbar();
      setNoteSheetTarget(null);
      setAnnChip(null);
      setMultiNotePayload(null);
      setBookmarkPopoverPayload(null);
    }, [screen, letterId, bookId, chapterNum, studyId, studyChapterId]);
    return {
      annChip,
      setAnnChip,
      linkSidebarKey,
      openLinkSidebar,
      closeLinkSidebar,
      linkPickerSource,
      openLinkPicker,
      openLinkPickerForTarget,
      closeLinkPicker,
      linkRefineRequest,
      setLinkRefineRequest,
      lastLinkCreated,
      setLastLinkCreated,
      linkPickerMode,
      linkPickerOnPickRef,
      noteSheetTarget,
      setNoteSheetTarget,
      openNoteSheet,
      closeNoteSheet,
      notebookPickerTarget,
      setNotebookPickerTarget,
      multiNotePayload,
      setMultiNotePayload,
      bookmarkPopoverPayload,
      setBookmarkPopoverPayload,
      bookmarkCreatePending,
      setBookmarkCreatePending,
      inboundJournalPayload,
      setInboundJournalPayload
    };
  }

  // app/src/main/assets/src/hooks/use-from-letter-stack.js
  function useFromLetterStack({
    tabField,
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    setScreen,
    setBookId,
    setChapterNum,
    setLetterId,
    setStudyId,
    setStudyChapterId
  }) {
    const [fromLetterStack, setFromLetterStack] = tabField("fromLetterStack");
    const fromLetterRef = useRefMirror(fromLetterStack);
    const pushFromLetter = (entry) => setFromLetterStack((prev) => {
      var next = [...prev, entry];
      return next.length > 50 ? next.slice(-50) : next;
    });
    const tapThroughBack = () => {
      const stack = fromLetterRef.current;
      if (!stack || stack.length === 0) return;
      const popped = stack[stack.length - 1];
      setFromLetterStack(stack.slice(0, -1));
      window.__pendingHighlight = null;
      if (popped.sourceBookId !== void 0) setBookId(popped.sourceBookId);
      if (popped.sourceChapterNum !== void 0) setChapterNum(popped.sourceChapterNum);
      if (popped.sourceLetterId !== void 0) setLetterId(popped.sourceLetterId);
      if (popped.sourceStudyId !== void 0) setStudyId(popped.sourceStudyId);
      if (popped.sourceStudyChapterId !== void 0) setStudyChapterId(popped.sourceStudyChapterId);
      if (popped.sourceScreen) setScreen(popped.sourceScreen);
    };
    const _destMatches = (dest) => {
      if (!dest) return true;
      if (dest.screen !== screen) return false;
      if (dest.bookId != null && dest.bookId !== bookId) return false;
      if (dest.chapterNum != null && dest.chapterNum !== chapterNum) return false;
      if (dest.letterId != null && dest.letterId !== letterId) return false;
      if (dest.studyId != null && dest.studyId !== studyId) return false;
      if (dest.studyChapterId != null && dest.studyChapterId !== studyChapterId) return false;
      return true;
    };
    React.useEffect(() => {
      if (fromLetterStack.length === 0) return;
      const top = fromLetterStack[fromLetterStack.length - 1];
      if (!top.destSnapshot) return;
      if (!_destMatches(top.destSnapshot)) {
        setFromLetterStack((prev) => prev.slice(0, -1));
      }
    }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, fromLetterStack]);
    const backHint = fromLetterStack.length > 0 ? (() => {
      const top = fromLetterStack[fromLetterStack.length - 1];
      if (top.destSnapshot && !_destMatches(top.destSnapshot)) return null;
      return {
        title: top.sourceLetterTitle || "previous",
        volumeLabel: top.sourceVolumeLabel || null
      };
    })() : null;
    return {
      fromLetterStack,
      setFromLetterStack,
      pushFromLetter,
      tapThroughBack,
      fromLetterRef,
      backHint
    };
  }

  // app/src/main/assets/src/hooks/use-navigate-to-link.js
  function useNavigateToLink({
    closeLinkSidebar,
    pushFromLetter,
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    setScreen,
    setBookId,
    setChapterNum,
    setLetterId,
    setStudyId,
    setStudyChapterId,
    setSurpriseAnchor,
    setJournalEntryId
  }) {
    const _navToLinkRef = React.useRef(null);
    const navigateToLink = React.useCallback((endpoint, meta) => {
      if (_navToLinkRef.current) _navToLinkRef.current(endpoint, meta);
    }, []);
    _navToLinkRef.current = (endpoint, meta) => {
      closeLinkSidebar();
      window.__pendingScrollHlKey = endpoint && endpoint.key ? String(endpoint.key).replace(/:\d+-\d+$/, "") : null;
      const _BOOKS = typeof BOOKS !== "undefined" ? BOOKS : null;
      let destSnapshot = null;
      if (endpoint.type === "bible" && endpoint.bookId && _BOOKS && _BOOKS[endpoint.bookId]) {
        destSnapshot = { screen: "bible-ch", bookId: endpoint.bookId, chapterNum: endpoint.chapter, letterId: null, studyId: null, studyChapterId: null };
      } else if (endpoint.type === "study" || endpoint.type === "bible" && endpoint.bookId === "matthew") {
        destSnapshot = { screen: "matthew-ch", bookId: "matthew", chapterNum: endpoint.chapter, letterId: null, studyId: null, studyChapterId: null };
      } else if (endpoint.type === "study-letter" && endpoint.studyId && endpoint.studyChapterId) {
        destSnapshot = { screen: "bible-study-chapter", bookId: null, chapterNum: null, letterId: null, studyId: endpoint.studyId, studyChapterId: endpoint.studyChapterId };
      } else if (endpoint.screen) {
        destSnapshot = { screen: endpoint.screen, bookId: null, chapterNum: null, letterId: endpoint.letterId || endpoint.entryId || null, studyId: null, studyChapterId: null };
      }
      pushFromLetter({
        sourceScreen: screen,
        sourceLetterId: letterId,
        sourceBookId: bookId,
        sourceChapterNum: chapterNum,
        sourceStudyId: studyId,
        sourceStudyChapterId: studyChapterId,
        sourceLetterTitle: meta && meta.sourceLetterTitle || null,
        sourceVolumeLabel: meta && meta.sourceVolumeLabel || null,
        destSnapshot
      });
      if (endpoint.type === "bible" && endpoint.bookId && _BOOKS && _BOOKS[endpoint.bookId]) {
        setBookId(endpoint.bookId);
        setChapterNum(endpoint.chapter);
        setScreen("bible-ch");
        setSurpriseAnchor(endpoint.verse ? { type: "verse", verses: [endpoint.verse] } : null);
      } else if (endpoint.type === "study" || endpoint.type === "bible" && endpoint.bookId === "matthew") {
        setBookId("matthew");
        setChapterNum(endpoint.chapter);
        setScreen("matthew-ch");
        setSurpriseAnchor(endpoint.verse ? { type: "verse", verses: [endpoint.verse] } : null);
      } else if (endpoint.type === "study-letter" && endpoint.studyId && endpoint.studyChapterId) {
        setBookId(null);
        setChapterNum(null);
        setLetterId(null);
        setStudyId(endpoint.studyId);
        setStudyChapterId(endpoint.studyChapterId);
        setScreen("bible-study-chapter");
        window.__pendingLinkExcerpt = endpoint.start != null ? { start: endpoint.start, end: endpoint.end, text: endpoint.text, key: endpoint.key } : null;
      } else if (endpoint.type === "journal" && endpoint.entryId) {
        setBookId(null);
        setChapterNum(null);
        setStudyId(null);
        setStudyChapterId(null);
        setLetterId(null);
        setJournalEntryId(endpoint.entryId);
        setScreen("journal-viewer");
        window.__pendingLinkExcerpt = endpoint.start != null ? { start: endpoint.start, end: endpoint.end, text: endpoint.text, key: endpoint.key } : null;
      } else if (endpoint.screen) {
        setBookId(null);
        setChapterNum(null);
        setStudyId(null);
        setStudyChapterId(null);
        if (endpoint.letterId) setLetterId(endpoint.letterId);
        else if (endpoint.entryId) setLetterId(endpoint.entryId);
        setScreen(endpoint.screen);
        window.__pendingLinkExcerpt = endpoint.start != null ? { start: endpoint.start, end: endpoint.end, text: endpoint.text, key: endpoint.key } : null;
      }
    };
    return { navigateToLink };
  }

  // app/src/main/assets/src/hooks/use-tabs.js
  var DEFAULT_TAB = {
    screen: "home",
    bookId: null,
    chapterNum: null,
    letterId: null,
    studyId: null,
    studyChapterId: null,
    fromStudies: false,
    genreId: null,
    mode: "pdf",
    showStudy: true,
    surpriseAnchor: null,
    fromLetterStack: [],
    titleFocusHidden: false,
    headingsFocusHidden: false,
    fromMatthewCh: null,
    fromWtlb: null,
    fromSearch: false,
    searchQuery: "",
    searchOrigin: null,
    searchScope: null,
    searchContext: null,
    navOrigin: null,
    gardenPage: 1,
    scrollPositions: {}
    // per-screen scroll memory: { [screenName]: px }
  };
  function useTabs({ saved }) {
    const [tabs, setTabs] = React.useState(() => {
      if (Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        return saved.tabs.map((t) => ({ ...DEFAULT_TAB, ...t }));
      }
      return [{
        ...DEFAULT_TAB,
        screen: saved.screen || "home",
        bookId: saved.bookId || null,
        chapterNum: saved.chapterNum != null ? saved.chapterNum : null,
        letterId: saved.letterId || null,
        studyId: saved.studyId || null,
        studyChapterId: saved.studyChapterId || null,
        fromStudies: saved.fromStudies || false,
        genreId: saved.genreId || null,
        mode: saved.mode || "pdf",
        showStudy: saved.showStudy !== false,
        gardenPage: saved.gardenPage || 1
      }];
    });
    const [activeTabIdx, setActiveTabIdx] = React.useState(() => {
      const idx = typeof saved.activeTabIdx === "number" ? saved.activeTabIdx : 0;
      return Math.max(0, Math.min(idx, 998));
    });
    const activeTab = tabs[activeTabIdx] || tabs[0];
    const updateActiveTab = React.useCallback((patchOrFn) => {
      setTabs((prev) => prev.map((t, i) => {
        if (i !== activeTabIdx) return t;
        const patch = typeof patchOrFn === "function" ? patchOrFn(t) : patchOrFn;
        return { ...t, ...patch };
      }));
    }, [activeTabIdx]);
    const _uatRef = useRefMirror(updateActiveTab);
    const _tabSetters = React.useRef({});
    const tabField = (key) => {
      if (!_tabSetters.current[key]) {
        _tabSetters.current[key] = (val) => _uatRef.current((cur) => ({
          [key]: typeof val === "function" ? val(cur[key]) : val
        }));
      }
      return [activeTab[key], _tabSetters.current[key]];
    };
    const _tabSettersPrevRef = React.useRef({});
    React.useEffect(() => {
      var cur = _tabSetters.current;
      var prev = _tabSettersPrevRef.current;
      for (var key in cur) {
        if (prev[key] && prev[key] !== cur[key]) {
          console.error("[tabField stability] setter identity changed for key=" + key + " across renders \u2014 this breaks child component stability and triggers cascading re-mounts.");
        }
        prev[key] = cur[key];
      }
    });
    return {
      DEFAULT_TAB,
      tabField,
      activeTab,
      tabs,
      activeTabIdx,
      setTabs,
      setActiveTabIdx,
      updateActiveTab
    };
  }

  // app/src/main/assets/src/hooks/use-tab-actions.js
  var MAX_TABS = 999;
  function useTabActions({ tabState, cancelDwell, setTabThumbnails }) {
    const { tabs, activeTabIdx, setTabs, setActiveTabIdx } = tabState;
    const [tabActionIdx, setTabActionIdx] = React.useState(null);
    const [disableTabsPromptOpen, setDisableTabsPromptOpen] = React.useState(false);
    const lastTabCloseStrikes = React.useRef(0);
    const openNewTab = React.useCallback(() => {
      setTabs((prev) => {
        if (prev.length >= MAX_TABS) return prev;
        const next = [...prev, { ...DEFAULT_TAB }];
        setActiveTabIdx(next.length - 1);
        return next;
      });
    }, []);
    const switchToTab = React.useCallback((idx) => {
      cancelDwell();
      setActiveTabIdx((_prev) => {
        if (idx < 0) return 0;
        return Math.min(idx, tabs.length - 1);
      });
    }, [tabs.length]);
    const closeTab = React.useCallback((idx) => {
      setTabs((prev) => {
        if (prev.length <= 1) {
          lastTabCloseStrikes.current += 1;
          if (lastTabCloseStrikes.current >= 3) {
            setDisableTabsPromptOpen(true);
            lastTabCloseStrikes.current = 0;
          }
          const reset = { ...DEFAULT_TAB };
          setActiveTabIdx(0);
          return [reset];
        }
        lastTabCloseStrikes.current = 0;
        const next = prev.filter((_, i) => i !== idx);
        setActiveTabIdx((prevIdx) => {
          if (idx < prevIdx) return prevIdx - 1;
          if (idx === prevIdx) return Math.max(0, Math.min(prevIdx, next.length - 1));
          return prevIdx;
        });
        return next;
      });
    }, []);
    const closeOtherTabs = React.useCallback((keepIdx) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const kept = prev[keepIdx];
        if (!kept) return prev;
        setActiveTabIdx(0);
        return [kept];
      });
    }, []);
    const closeTabsToTheRight = React.useCallback((keepIdx) => {
      setTabs((prev) => {
        if (keepIdx >= prev.length - 1) return prev;
        setActiveTabIdx((cur) => Math.min(cur, keepIdx));
        return prev.slice(0, keepIdx + 1);
      });
    }, []);
    const closeAllTabs = React.useCallback(() => {
      setTabs([{ ...DEFAULT_TAB }]);
      setActiveTabIdx(0);
      setTabThumbnails({});
    }, []);
    const deduplicateTabs = React.useCallback(() => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const seen = /* @__PURE__ */ new Set();
        const keep = [];
        let activeStillInKept = false;
        let newActiveIdx = 0;
        prev.forEach((t, i) => {
          const k = tabContentKey(t);
          if (!seen.has(k)) {
            seen.add(k);
            if (i === activeTabIdx) {
              activeStillInKept = true;
              newActiveIdx = keep.length;
            }
            keep.push(t);
          } else if (i === activeTabIdx && !activeStillInKept) {
            let idx = keep.findIndex((x) => tabContentKey(x) === k);
            if (idx >= 0) newActiveIdx = idx;
          }
        });
        setActiveTabIdx(newActiveIdx);
        return keep;
      });
    }, [activeTabIdx]);
    return {
      openNewTab,
      switchToTab,
      closeTab,
      closeOtherTabs,
      closeTabsToTheRight,
      closeAllTabs,
      deduplicateTabs,
      tabActionIdx,
      setTabActionIdx,
      disableTabsPromptOpen,
      setDisableTabsPromptOpen,
      lastTabCloseStrikes,
      MAX_TABS
      // re-exported for the TabsOverview render (the cap badge)
    };
  }

  // app/src/main/assets/src/hooks/use-persisted-state.js
  function usePersistedState({
    tabs,
    activeTabIdx,
    theme,
    lastReadChapters,
    lastReadLetterMap,
    activeReadKey,
    settings,
    readItems
  }) {
    React.useEffect(() => {
      StateStore.set({
        tabs,
        activeTabIdx,
        theme,
        lastReadChapters,
        lastReadLetterMap,
        activeReadKey,
        settings,
        readItems
      });
    }, [tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap, activeReadKey, settings, readItems]);
  }

  // app/src/main/assets/src/utils/root-exit-toast.js
  var _timer = null;
  var _armed = false;
  var _toastEl = null;
  var TOAST_ID = "vot-root-exit-toast";
  function _ensureToast() {
    if (_toastEl) return _toastEl;
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.id = TOAST_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.textContent = "Press back again to exit";
    el.style.cssText = [
      "position:fixed",
      // Above all overlays; lower than the Welcome modal (z 9999) which
      // wouldn't be open at root anyway, but be defensive.
      "z-index:9998",
      "left:50%",
      "transform:translateX(-50%)",
      // Anchor near the bottom; respect safe-area inset for notched devices.
      "bottom:calc(env(safe-area-inset-bottom, 0px) + 2rem)",
      "background:rgba(20,20,24,0.92)",
      "color:#f0e6d2",
      "border:1px solid rgba(255,215,140,0.35)",
      "border-radius:24px",
      "padding:10px 18px",
      "font-family:'Cinzel',serif",
      "font-size:0.72rem",
      "letter-spacing:0.08em",
      "text-transform:uppercase",
      "box-shadow:0 6px 24px rgba(0,0,0,0.45)",
      "pointer-events:none",
      "opacity:0",
      "transition:opacity 180ms ease-out"
    ].join(";");
    document.body.appendChild(el);
    _toastEl = el;
    return el;
  }
  function _showToast() {
    const el = _ensureToast();
    if (!el) return;
    void el.offsetHeight;
    el.style.opacity = "1";
  }
  function _hideToast() {
    if (!_toastEl) return;
    _toastEl.style.opacity = "0";
  }
  function arm(durationMs = 2e3) {
    if (_timer != null) clearTimeout(_timer);
    _armed = true;
    _showToast();
    _timer = setTimeout(() => {
      _armed = false;
      _timer = null;
      _hideToast();
    }, durationMs);
  }
  function disarm() {
    if (_timer != null) {
      clearTimeout(_timer);
      _timer = null;
    }
    _armed = false;
    _hideToast();
  }
  function isArmed() {
    return _armed;
  }

  // app/src/main/assets/src/hooks/use-android-back.js
  function useAndroidBack({
    screen,
    bookId,
    genreId,
    fromSearch,
    fromStudies,
    fromMatthewCh,
    studyId,
    fromWtlb,
    tabsOverviewOpen,
    journalEntryId,
    fromLetterRef,
    setScreen,
    setBookId,
    setChapterNum,
    setLetterId,
    setStudyId,
    setStudyChapterId,
    setFromLetterStack,
    setFromSearch,
    setFromStudies,
    setFromWtlb,
    setFromMatthewCh,
    setTabsOverviewOpen,
    cancelDwell,
    goNavOrigin,
    goHome,
    goSearchOrigin,
    goScripturesHome,
    goStudiesHome,
    goVolumesHome,
    goJournalViewer,
    getStudyById
    // App()-local helper; threaded so the bible-study-chapter
    // back path can introspect the current study's chapter count.
    // (Pre-fix this was a bare reference inside the handler that
    // would throw ReferenceError if ever hit — lint caught it.)
  }) {
    const screenRef = useRefMirror(screen);
    const bookIdRef = useRefMirror(bookId);
    const genreIdRef = useRefMirror(genreId);
    const fromSearchRef = useRefMirror(fromSearch);
    const fromStudiesRef = useRefMirror(fromStudies);
    const fromMatthewChRef = useRefMirror(fromMatthewCh);
    const studyIdRef = useRefMirror(studyId);
    const fromWtlbRef = useRefMirror(fromWtlb);
    const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);
    const journalEntryIdRef = useRefMirror(journalEntryId);
    React.useEffect(() => {
      window.handleAndroidBack = () => {
        if (window.__closeSheet) {
          window.__closeSheet();
          window.__closeSheet = null;
          return "true";
        }
        if (tabsOverviewOpenRef.current) {
          setTabsOverviewOpen(false);
          return "true";
        }
        cancelDwell();
        const s = screenRef.current;
        const stack = fromLetterRef.current;
        if (LETTER_SCREEN_SET.has(s) && stack && stack.length > 0) {
          const fl = stack[stack.length - 1];
          setFromLetterStack((prev) => prev.slice(0, -1));
          window.__pendingHighlight = null;
          if (fl.sourceBookId !== void 0) setBookId(fl.sourceBookId);
          if (fl.sourceChapterNum !== void 0) setChapterNum(fl.sourceChapterNum);
          if (fl.sourceLetterId !== void 0) setLetterId(fl.sourceLetterId);
          if (fl.sourceStudyId !== void 0) setStudyId(fl.sourceStudyId);
          if (fl.sourceStudyChapterId !== void 0) setStudyChapterId(fl.sourceStudyChapterId);
          setScreen(fl.sourceScreen);
          return "true";
        }
        if (s === "settings") {
          goNavOrigin();
          return "true";
        } else if (s === "history") {
          goNavOrigin();
          return "true";
        } else if (s === "about") {
          AboutSeenFlagStore.set();
          goNavOrigin();
          return "true";
        } else if (s === "notes-index") {
          setScreen("library");
          return "true";
        } else if (s === "links-index") {
          setScreen("library");
          return "true";
        } else if (s === "bookmarks-index") {
          setScreen("library");
          return "true";
        } else if (s === "highlights-index") {
          setScreen("library");
          return "true";
        } else if (s === "journal-home") {
          setScreen("library");
          return "true";
        } else if (s === "journal-viewer") {
          setScreen("journal-home");
          return "true";
        } else if (s === "journal-editor") {
          goJournalViewer(journalEntryIdRef.current);
          return "true";
        } else if (s === "library") {
          goHome();
          return "true";
        } else if (s === "search") {
          goSearchOrigin();
          return "true";
        } else if (s === "scripture-genre") {
          goScripturesHome();
          return "true";
        } else if (s === "scriptures-home") {
          goHome();
          return "true";
        } else if (s === "volumes-home") {
          goHome();
          return "true";
        } else if (s === "matthew-ch") {
          if (fromSearchRef.current) {
            setFromSearch(false);
            setScreen("search");
          } else {
            setChapterNum(null);
            setScreen("matthew-idx");
          }
          return "true";
        } else if (s === "matthew-idx") {
          if (fromStudiesRef.current) {
            setFromStudies(false);
            goStudiesHome();
          } else {
            goHome();
          }
          return "true";
        } else if (s === "studies-home") {
          goHome();
          return "true";
        } else if (s === "bible-study-index") {
          goStudiesHome();
          return "true";
        } else if (s === "bible-study-chapter") {
          if (fromSearchRef.current) {
            setFromSearch(false);
            setScreen("search");
            return "true";
          }
          const cur = getStudyById(studyIdRef.current);
          if (cur && cur.chapters && cur.chapters.length > 1) {
            setStudyChapterId(null);
            setScreen("bible-study-index");
          } else {
            goStudiesHome();
          }
          return "true";
        } else if (s === "bible-ch") {
          if (fromWtlbRef.current) {
            const ret = fromWtlbRef.current;
            setFromWtlb(null);
            setScreen(ret);
            return "true";
          }
          if (fromSearchRef.current) {
            setFromSearch(false);
            setScreen("search");
          } else {
            const bid = bookIdRef.current;
            const _BOOKS = typeof BOOKS !== "undefined" ? BOOKS : null;
            if (bid && _BOOKS && _BOOKS[bid]?.chapters.length === 1) {
              if (genreIdRef.current) {
                setScreen("scripture-genre");
              } else {
                goScripturesHome();
              }
            } else {
              setChapterNum(null);
              setScreen("bible-idx");
            }
          }
          return "true";
        } else if (s === "bible-idx") {
          if (genreIdRef.current) {
            setScreen("scripture-genre");
          } else {
            goScripturesHome();
          }
          return "true";
        } else {
          const col = COL_BY_LETTER_SC.get(s);
          if (col) {
            if (fromMatthewChRef.current) {
              setFromMatthewCh(null);
              setScreen("matthew-ch");
            } else if (fromSearchRef.current) {
              setFromSearch(false);
              setScreen("search");
            } else if (fromStudiesRef.current) {
              setFromStudies(false);
              setScreen("bible-study-chapter");
            } else if (col.indexScreen) {
              setScreen(col.indexScreen);
            } else {
              goHome();
            }
            return "true";
          }
        }
        if (COL_BY_INDEX_SC.has(s) || s === "garden-view") {
          goVolumesHome();
          return "true";
        }
        return "false";
      };
      return () => {
        delete window.handleAndroidBack;
      };
    }, []);
    React.useEffect(() => {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      if (window.AndroidBridge) return;
      function onKeyDown(e) {
        if (e.key !== "Escape") return;
        if (e.isComposing) return;
        if (document.fullscreenElement) return;
        if (modalRegistry.isAnyOpen()) {
          const top = modalRegistry.peek();
          if (top && typeof top.dismiss === "function") {
            e.preventDefault();
            top.dismiss();
          }
          return;
        }
        const active = document.activeElement;
        if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
          return;
        }
        suppressNextHistoryPush();
        const result = typeof window.handleAndroidBack === "function" ? window.handleAndroidBack() : "false";
        if (result === "false") {
          clearSuppressNextHistoryPush();
        } else {
          e.preventDefault();
        }
      }
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("keydown", onKeyDown);
      };
    }, []);
    React.useEffect(() => {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      if (window.AndroidBridge) return;
      if (typeof window.addEventListener !== "function") return;
      function onPopState() {
        if (!window.__historyReady) return;
        suppressNextHistoryPush();
        const result = typeof window.handleAndroidBack === "function" ? window.handleAndroidBack() : "false";
        if (result !== "false") {
          return;
        }
        clearSuppressNextHistoryPush();
        if (isArmed()) {
          disarm();
          return;
        }
        try {
          history.pushState({}, "", "");
        } catch (_e) {
        }
        arm();
      }
      window.addEventListener("popstate", onPopState);
      return () => {
        window.removeEventListener("popstate", onPopState);
      };
    }, []);
  }

  // app/src/main/assets/src/hooks/use-modal-registry.js
  var _registry = /* @__PURE__ */ new Map();
  var modalRegistry2 = {
    /**
     * Add a modal to the registry, or move an existing entry to the top.
     * Re-registering an existing id deletes-then-sets so the entry moves
     * to the end of the Map's insertion order (= "topmost"). Silently
     * ignores invalid input rather than throwing — registration failure
     * should NOT prevent a modal from rendering.
     *
     * @param {{ id: string, dismiss: () => void }} entry
     * @returns {void}
     */
    register(entry) {
      if (!entry || !entry.id || typeof entry.dismiss !== "function") return;
      _registry.delete(entry.id);
      _registry.set(entry.id, entry.dismiss);
    },
    /**
     * Remove a modal from the registry. Idempotent — unregistering an
     * unknown id is a no-op.
     *
     * @param {string} id
     * @returns {void}
     */
    unregister(id) {
      if (!id) return;
      _registry.delete(id);
    },
    /**
     * @returns {boolean} true iff at least one modal is currently registered.
     */
    isAnyOpen() {
      return _registry.size > 0;
    },
    /**
     * @returns {string[]} all registered IDs in insertion order (first = oldest,
     *                     last = topmost). Useful for debug output.
     */
    openIds() {
      return Array.from(_registry.keys());
    },
    /**
     * @returns {{ id: string, dismiss: () => void } | null}
     *   The most-recently-registered entry (= topmost modal), or null if
     *   the registry is empty. Returns a fresh object each call.
     */
    peek() {
      if (_registry.size === 0) return null;
      let lastId = "";
      let lastDismiss = null;
      for (const [id, dismiss] of _registry) {
        lastId = id;
        lastDismiss = dismiss;
      }
      if (!lastDismiss) return null;
      return { id: lastId, dismiss: lastDismiss };
    },
    /**
     * Clear the registry. TEST-ONLY: production code MUST go through
     * register/unregister so component lifecycles stay symmetric. Test
     * harnesses call this in `beforeEach` since the registry is a
     * module-level singleton that survives between renderHook calls.
     *
     * @returns {void}
     */
    _reset() {
      _registry.clear();
    }
  };
  function useModalRegistry2({ id, dismiss, active = true }) {
    const dismissRef = useRefMirror(dismiss);
    React.useEffect(() => {
      if (!active) return void 0;
      if (!id) return void 0;
      modalRegistry2.register({
        id,
        dismiss: () => {
          const fn = dismissRef.current;
          if (typeof fn === "function") fn();
        }
      });
      return () => modalRegistry2.unregister(id);
    }, [id, active]);
  }

  // app/src/main/assets/src/hooks/use-history-sync.js
  var _suppressNextPush = false;
  function suppressNextHistoryPush2() {
    _suppressNextPush = true;
  }
  function clearSuppressNextHistoryPush2() {
    _suppressNextPush = false;
  }
  function useHistorySync({
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    genreId,
    gardenPage
  }) {
    const lastKeyRef = React.useRef(null);
    React.useEffect(() => {
      if (typeof window !== "undefined" && window.AndroidBridge) return;
      if (typeof history === "undefined" || typeof history.pushState !== "function") return;
      const key = `${screen}|${bookId}|${chapterNum}|${letterId}|${studyId}|${studyChapterId}|${genreId}|${gardenPage}`;
      if (lastKeyRef.current === null) {
        lastKeyRef.current = key;
        window.__historyReady = true;
        return;
      }
      if (lastKeyRef.current === key) {
        return;
      }
      lastKeyRef.current = key;
      if (_suppressNextPush) {
        _suppressNextPush = false;
        return;
      }
      disarm();
      try {
        history.pushState({}, "", "");
      } catch (_e) {
      }
    }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, genreId, gardenPage]);
  }

  // app/src/main/assets/src/hooks/use-nav-history-tracking.js
  function useNavHistoryTracking({
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    addToHistory,
    _findLetter,
    getStudyById,
    getStudyChapter
  }) {
    React.useEffect(() => {
      if (screen === "matthew-ch" && chapterNum) {
        const _MATTHEW = typeof window !== "undefined" ? window.MATTHEW : void 0;
        if (!_MATTHEW) return;
        const ch = _MATTHEW.chapters.find((c) => c.num === chapterNum);
        addToHistory({ type: "chapter", bookId: "matthew", bookTitle: "Matthew", chapterNum, chapterTitle: ch?.title || null });
      } else if (screen === "bible-ch" && bookId && chapterNum) {
        const _BOOKS = typeof window !== "undefined" ? window.BOOKS : void 0;
        if (!_BOOKS) return;
        const book = _BOOKS[bookId];
        const ch = book?.chapters.find((c) => c.num === chapterNum);
        addToHistory({ type: "chapter", bookId, bookTitle: book?.title || bookId, chapterNum, chapterTitle: ch?.title || null });
      } else if (letterId) {
        var _hcol = COL_BY_LETTER_SC.get(screen);
        if (_hcol) {
          var _he = _findLetter(_hcol.volKey);
          if (_he) addToHistory({ type: "letter", letterId, letterTitle: _he.title, letterNum: _he.num || null, volumeScreen: _hcol.indexScreen });
        }
      } else if (screen === "bible-study-chapter" && studyId && studyChapterId) {
        const study = getStudyById(studyId);
        const ch = getStudyChapter(study, studyChapterId);
        if (study && ch) addToHistory({ type: "study-chapter", studyId, studyChapterId, studyTitle: study.title, studySlug: study.slug, chapterTitle: ch.title, chapterNum: ch.num });
      }
    }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId]);
  }

  // app/src/main/assets/src/hooks/use-nav.js
  function useNav({
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    setScreen,
    setBookId,
    setChapterNum,
    setGenreId,
    setNavOrigin,
    setFromSearch,
    setFromWtlb,
    setFromLetterStack,
    setJournalEntryId,
    setGardenPage
  }) {
    const _captureOrigin = () => setNavOrigin({
      screen,
      bookId,
      chapterNum,
      letterId,
      studyId,
      studyChapterId
    });
    const goHome = () => {
      setFromSearch(false);
      setFromWtlb(null);
      setFromLetterStack([]);
      window.__pendingHighlight = null;
      window.__pendingScrollHlKey = null;
      setScreen("home");
      setBookId(null);
      setChapterNum(null);
    };
    const goScripturesHome = () => {
      setScreen("scriptures-home");
      setBookId(null);
      setChapterNum(null);
      setGenreId(null);
    };
    const goScriptureGenre = (gid) => {
      setGenreId(gid);
      setScreen("scripture-genre");
    };
    const goVolumesHome = () => {
      setScreen("volumes-home");
    };
    const goSettings = () => {
      _captureOrigin();
      setScreen("settings");
    };
    const goHistory = () => {
      _captureOrigin();
      setScreen("history");
    };
    const goAbout = () => {
      _captureOrigin();
      setScreen("about");
    };
    const goLibrary = () => {
      _captureOrigin();
      setScreen("library");
    };
    const goJournalHub = () => {
      _captureOrigin();
      setScreen("journal-home");
    };
    const goNotesIndex = () => {
      _captureOrigin();
      setScreen("notes-index");
    };
    const goLinksIndex = () => {
      _captureOrigin();
      setScreen("links-index");
    };
    const goBookmarksIndex = () => {
      _captureOrigin();
      setScreen("bookmarks-index");
    };
    const goHighlightsIndex = () => {
      _captureOrigin();
      setScreen("highlights-index");
    };
    const goJournalViewer = (eid) => {
      if (eid) {
        setJournalEntryId(eid);
        setScreen("journal-viewer");
      }
    };
    const goJournalEditor = (eid) => {
      if (eid) {
        setJournalEntryId(eid);
        setScreen("journal-editor");
      }
    };
    const goColIdx = (volKey) => {
      const c = COL_BY_KEY.get(volKey);
      if (c && c.indexScreen) setScreen(c.indexScreen);
    };
    const goMatthewIdx = () => {
      setChapterNum(null);
      setScreen("matthew-idx");
    };
    const goStudiesHome = () => {
      setScreen("studies-home");
    };
    const goBibleIdx = () => {
      setChapterNum(null);
      setScreen("bible-idx");
    };
    const goToGardenFirst = () => {
      setGardenPage(1);
      setScreen("garden-view");
    };
    return {
      goHome,
      goScripturesHome,
      goScriptureGenre,
      goVolumesHome,
      goSettings,
      goHistory,
      goAbout,
      goLibrary,
      goJournalHub,
      goJournalViewer,
      goJournalEditor,
      goNotesIndex,
      goLinksIndex,
      goBookmarksIndex,
      goHighlightsIndex,
      goColIdx,
      goMatthewIdx,
      goStudiesHome,
      goBibleIdx,
      goToGardenFirst
    };
  }

  // app/src/main/assets/src/hooks/use-search.js
  function useSearch({
    tabField,
    screen,
    bookId,
    chapterNum,
    letterId,
    setScreen,
    setBookId,
    setChapterNum,
    setLetterId,
    setStudyId,
    setStudyChapterId,
    setSurpriseAnchor,
    setFromSearch,
    setActiveReadKey,
    setLastReadForVol,
    handleSurprise,
    goSettings,
    goHome
  }) {
    const [searchQuery, setSearchQuery] = tabField("searchQuery");
    const [searchOrigin, setSearchOrigin] = tabField("searchOrigin");
    const [searchScope, setSearchScope] = tabField("searchScope");
    const [searchContext, setSearchContext] = tabField("searchContext");
    const searchOriginRef = useRefMirror(searchOrigin);
    const goSearch = () => {
      setSearchOrigin({ screen, bookId, chapterNum, letterId });
      let ctx = null;
      if (screen === "matthew-ch") {
        ctx = { kind: "book", bookId: "matthew", label: "Matthew" };
      } else if (screen === "bible-ch" && bookId) {
        const bk = BOOKS[bookId];
        ctx = { kind: "book", bookId, label: bk ? bk.title : bookId };
      } else {
        const _scCol = COL_BY_LETTER_SC.get(screen);
        if (_scCol) ctx = { kind: "volume", volumeId: _scCol.searchVolId, label: _scCol.label };
      }
      setSearchContext(ctx);
      setSearchScope(null);
      if (window.__pendingSearchQuery) {
        setSearchQuery(window.__pendingSearchQuery);
        window.__pendingSearchQuery = null;
      }
      setScreen("search");
    };
    React.useEffect(() => {
      window.__goSearch = goSearch;
      return () => {
        window.__goSearch = null;
      };
    });
    const goSearchOrigin = () => {
      const o = searchOriginRef.current;
      if (o) {
        setSearchOrigin(null);
        setScreen(o.screen);
        if (o.bookId !== void 0) setBookId(o.bookId);
        if (o.chapterNum !== void 0) setChapterNum(o.chapterNum);
        if (o.letterId !== void 0) setLetterId(o.letterId);
      } else {
        goHome();
      }
    };
    const srchVolLookup = (searchVolId) => {
      const col = COL_BY_SEARCH_ID.get(searchVolId);
      if (!col) return null;
      return {
        screen: col.letterScreen,
        lastReadFn: (id) => setLastReadForVol(col.volKey, id),
        activeKey: "vol:" + col.volKey
      };
    };
    const SRCH_VOL_MAP = new Proxy({}, { get: (_, key) => srchVolLookup(key) });
    const srchResolveLetterId = (volumeId, letterNum, lid) => {
      if (lid) return lid;
      if (letterNum == null) return null;
      const col = COL_BY_SEARCH_ID.get(volumeId);
      if (!col) return null;
      const arr = colLetterArr(col);
      for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].num === letterNum) return arr[i].id;
      const pref = colPreface(col);
      if (pref && (letterNum === 0 || arr.length === 0)) return pref.id;
      return null;
    };
    const handleSearchSelect = (entry) => {
      setFromSearch(true);
      if (entry && entry.__direct && entry.ref) {
        const r = entry.ref;
        const useStudyMatthew = entry.__corpus !== "scriptures";
        if (r.kind === "ref-bible" || r.kind === "named-passage") {
          const matthewHit = r.bookId === "matthew" || r.bookId === "matthew-plain";
          const effectiveBookId = matthewHit ? useStudyMatthew ? "matthew" : "matthew-plain" : r.bookId;
          setBookId(effectiveBookId);
          setChapterNum(r.chapter);
          if (r.verseStart) {
            const vs = [];
            const vEnd = r.verseEnd || r.verseStart;
            for (let v = r.verseStart; v <= vEnd; v++) vs.push(v);
            setSurpriseAnchor({ type: "verse", verses: vs });
          } else {
            setSurpriseAnchor(null);
          }
          setScreen(effectiveBookId === "matthew" ? "matthew-ch" : "bible-ch");
          return;
        }
        if (r.kind === "ref-letter") {
          const vm = SRCH_VOL_MAP[r.volumeId];
          if (!vm) return;
          const lid = srchResolveLetterId(r.volumeId, r.letterNum, r.letterId);
          if (!lid) return;
          setLetterId(lid);
          if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(lid));
          else vm.lastReadFn(lid);
          setScreen(vm.screen);
          return;
        }
        if (r.kind === "ref-book") {
          const matthewHit = r.bookId === "matthew" || r.bookId === "matthew-plain";
          const effectiveBookId = matthewHit ? useStudyMatthew ? "matthew" : "matthew-plain" : r.bookId;
          setBookId(effectiveBookId);
          setChapterNum(null);
          setScreen(effectiveBookId === "matthew" ? "matthew-idx" : "bible-idx");
          return;
        }
        return;
      }
      const doc = entry && entry.doc;
      if (!doc) return;
      const k = doc.kind;
      if (k === "verse" || k === "chapter-title" || k === "heading" || k === "study-note" || k === "cross-ref") {
        setBookId(doc.bookId);
        setChapterNum(doc.chapterNum);
        if (doc.verseNum) {
          setSurpriseAnchor({ type: "verse", verses: [doc.verseNum] });
        } else {
          setSurpriseAnchor(null);
        }
        setScreen(doc.bookId === "matthew" ? "matthew-ch" : "bible-ch");
        return;
      }
      if (k === "letter" || k === "letter-title" || k === "footnote" || k === "wtlb" || k === "wtlb-title" || k === "blessed" || k === "blessed-title" || k === "holy-day" || k === "holy-day-title") {
        const vm = SRCH_VOL_MAP[doc.volumeId];
        if (!vm || !doc.letterId) return;
        setLetterId(doc.letterId);
        if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(doc.letterId));
        else vm.lastReadFn(doc.letterId);
        setScreen(vm.screen);
        return;
      }
      if (k === "bible-study") {
        setStudyId(doc.letterId || null);
        setStudyChapterId(doc.chapterNum || null);
        setScreen("bible-study-chapter");
        return;
      }
    };
    const handleSearchCommand = (action) => {
      if (action === "home") {
        setScreen("home");
        return;
      }
      if (action === "settings") {
        goSettings();
        return;
      }
      if (action === "scriptures") {
        setScreen("scriptures-home");
        return;
      }
      if (action === "volumes") {
        setScreen("volumes-home");
        return;
      }
      if (action === "clear-query") {
        setSearchQuery("");
        return;
      }
      if (action === "rebuild-index") {
        if (window.VotSearch) window.VotSearch.rebuild().catch(() => {
        });
        return;
      }
      if (action === "random") {
        handleSurprise();
        return;
      }
    };
    return {
      searchQuery,
      setSearchQuery,
      searchScope,
      setSearchScope,
      searchContext,
      goSearch,
      goSearchOrigin,
      handleSearchSelect,
      handleSearchCommand
    };
  }

  // app/src/main/assets/src/hooks/use-bible-studies.js
  function useBibleStudies({
    setScreen,
    setBookId,
    setChapterNum,
    setStudyId,
    setStudyChapterId,
    setActiveReadKey,
    setLastReadChapters,
    setFromStudies
  }) {
    const STUDIES = _studies();
    const studyReadKey = (slug) => `bible-study-${slug}`;
    const getStudyById = (id) => STUDIES.find((s) => s.id === id) || null;
    const getStudyChapter = (study, chId) => study && study.chapters ? study.chapters.find((c) => c.id === chId) : null;
    const selectStudy = (id) => {
      const study = getStudyById(id);
      if (!study || study.locked || !study.chapters?.length) return;
      setStudyId(id);
      if (study.chapters.length === 1 || study.singlePage) {
        const ch = study.chapters[0];
        setStudyChapterId(ch.id);
        setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: ch.id })));
        setScreen("bible-study-chapter");
      } else {
        setStudyChapterId(null);
        setActiveReadKey(studyReadKey(study.slug));
        setScreen("bible-study-index");
      }
    };
    const selectStudyChapter = (sid, chId) => {
      const study = getStudyById(sid);
      if (!study) return;
      setStudyId(sid);
      setStudyChapterId(chId);
      setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: chId })));
      setScreen("bible-study-chapter");
    };
    const MATTHEW_CHAIN_ENTRY = {
      id: "matthew-study",
      slug: "matthew-study",
      title: "The Volumes of Truth New Testament Study Bible - The Book of Matthew",
      isMatthewStudy: true,
      chapters: (_matthew() || {}).chapters || []
    };
    const CHAIN_ORDER = [
      "more-than-a-man",
      "matthew-study",
      "purity",
      "state-of-the-dead",
      "grace-and-the-law",
      "lamb-of-god",
      "trinity-exposed",
      "odds-chart"
    ];
    const UNIFIED_CHAIN = CHAIN_ORDER.map((slug) => slug === "matthew-study" ? MATTHEW_CHAIN_ENTRY : STUDIES.find((s) => s.id === slug)).filter((e) => e && (e.isMatthewStudy || !e.locked && e.chapters && e.chapters.length > 0));
    const chainIdx = (slug) => UNIFIED_CHAIN.findIndex((e) => e.slug === slug);
    const prevChainEntry = (slug) => {
      const i = chainIdx(slug);
      return i > 0 ? UNIFIED_CHAIN[i - 1] : null;
    };
    const nextChainEntry = (slug) => {
      const i = chainIdx(slug);
      return i >= 0 && i < UNIFIED_CHAIN.length - 1 ? UNIFIED_CHAIN[i + 1] : null;
    };
    const goToChainEntryFirst = (slug) => () => {
      if (slug === "matthew-study") {
        setFromStudies(true);
        setBookId("matthew");
        setChapterNum(1);
        setScreen("matthew-ch");
        setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: 1 })));
        return;
      }
      const s = getStudyById(slug);
      if (!s || !s.chapters?.length) return;
      selectStudyChapter(slug, s.chapters[0].id);
    };
    const goToChainEntryLast = (slug) => () => {
      if (slug === "matthew-study") {
        const _MATTHEW = typeof window !== "undefined" ? window.MATTHEW : null;
        if (!_MATTHEW) return;
        setFromStudies(true);
        const lastNum = _MATTHEW.chapters[_MATTHEW.chapters.length - 1].num;
        setBookId("matthew");
        setChapterNum(lastNum);
        setScreen("matthew-ch");
        setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: lastNum })));
        return;
      }
      const s = getStudyById(slug);
      if (!s || !s.chapters?.length) return;
      selectStudyChapter(slug, s.chapters[s.chapters.length - 1].id);
    };
    return {
      getStudyById,
      getStudyChapter,
      studyReadKey,
      selectStudy,
      selectStudyChapter,
      UNIFIED_CHAIN,
      prevChainEntry,
      nextChainEntry,
      goToChainEntryFirst,
      goToChainEntryLast
    };
  }

  // app/src/main/assets/src/hooks/use-journal-mutations.js
  function useJournalMutations({ setHlTick, setJournalEntryId, setScreen }) {
    const createAndEditJournal = () => {
      if (typeof JournalStore === "undefined") return;
      const e = JournalStore.add();
      if (typeof JournalStatsStore !== "undefined") {
        const newMilestones = JournalStatsStore.recordNewEntry(e.created);
        if (newMilestones && newMilestones.length) {
          newMilestones.forEach((m) => jrnShowMilestoneToast(m));
        }
      }
      setHlTick((t) => t + 1);
      setJournalEntryId(e.id);
      setScreen("journal-editor");
    };
    return { createAndEditJournal };
  }

  // app/src/main/assets/src/hooks/use-tap-through.js
  function useTapThrough({
    screen,
    bookId,
    chapterNum,
    letterId,
    studyId,
    studyChapterId,
    pushFromLetter,
    setScreen,
    setLetterId,
    setStudyId,
    setStudyChapterId,
    setFromMatthewCh,
    setActiveReadKey,
    setLastReadForVol
  }) {
    const goToLetterFromMatthew = (vol, letter, excerpt) => {
      const dest = resolveVotLetter(vol, letter);
      if (!dest) return;
      pushFromLetter({
        sourceScreen: "matthew-ch",
        sourceBookId: "matthew",
        sourceChapterNum: chapterNum,
        sourceLetterId: null,
        sourceStudyId: null,
        sourceStudyChapterId: null,
        sourceLetterTitle: `Matthew ${chapterNum}`,
        sourceVolumeLabel: null
      });
      if (excerpt) {
        window.__pendingHighlight = { excerpt, letterId: dest.id };
      } else {
        window.__pendingHighlight = null;
      }
      setFromMatthewCh({ chapterNum });
      if (dest.isStudy) {
        setStudyId(dest.studyId);
        setStudyChapterId(dest.studyChapterId);
        setActiveReadKey(dest.activeReadKey);
      } else {
        setLetterId(dest.id);
        setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
      }
      setScreen(dest.screen);
    };
    const openInAppLetter = (target, meta) => {
      if (!target || !target.letterTitle) return;
      const dest = resolveVotLetter(target.collection, target.letterTitle);
      if (!dest) return;
      let destSnapshot = null;
      if (dest.isStudy) {
        destSnapshot = { screen: "bible-study-chapter", bookId: null, chapterNum: null, letterId: null, studyId: dest.studyId, studyChapterId: dest.studyChapterId };
      } else {
        destSnapshot = { screen: dest.screen, bookId: null, chapterNum: null, letterId: dest.id, studyId: null, studyChapterId: null };
      }
      pushFromLetter({
        sourceScreen: screen,
        sourceLetterId: letterId,
        sourceBookId: bookId,
        sourceChapterNum: chapterNum,
        sourceStudyId: studyId,
        sourceStudyChapterId: studyChapterId,
        sourceLetterTitle: meta && meta.sourceLetterTitle ? meta.sourceLetterTitle : null,
        sourceVolumeLabel: meta && meta.sourceVolumeLabel ? meta.sourceVolumeLabel : null,
        destSnapshot
      });
      if (target.excerpt) {
        window.__pendingHighlight = { excerpt: target.excerpt, letterId: dest.id };
      } else {
        window.__pendingHighlight = null;
      }
      if (dest.isStudy) {
        setStudyId(dest.studyId);
        setStudyChapterId(dest.studyChapterId);
        setActiveReadKey(dest.activeReadKey);
      } else {
        setLetterId(dest.id);
        setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
      }
      setScreen(dest.screen);
    };
    return { goToLetterFromMatthew, openInAppLetter };
  }

  // app/src/main/assets/src/hooks/use-reading-position-nav.js
  function useReadingPositionNav({
    bookId,
    activeReadKey,
    lastReadLetterMap,
    lastReadChapters,
    setLetterId,
    setBookId,
    setChapterNum,
    setScreen,
    setActiveReadKey,
    setLastReadLetterMap,
    setLastReadChapters,
    getStudyById,
    selectStudy,
    selectStudyChapter
  }) {
    const prophecyCardStatesRef = React.useRef(() => ProphecyCardsStore.getAll());
    if (typeof prophecyCardStatesRef.current === "function") {
      prophecyCardStatesRef.current = prophecyCardStatesRef.current();
    }
    const saveProphecyCardStates = React.useCallback(() => {
      ProphecyCardsStore.setAll(prophecyCardStatesRef.current);
    }, []);
    const setLastReadForVol = (volKey, id) => {
      setLastReadLetterMap((prev) => ({ ...prev, [volKey]: id }));
    };
    const selectMatthewCh = (num) => {
      setChapterNum(num);
      setScreen("matthew-ch");
      setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: num })));
    };
    const selectBibleCh = (num) => {
      setChapterNum(num);
      setScreen("bible-ch");
      setActiveReadKey(bookId, () => setLastReadChapters((prev) => ({ ...prev, [bookId]: num })));
    };
    const goToLastRead = () => {
      if (!activeReadKey) return;
      if (activeReadKey.startsWith("vol:")) {
        const volKey = activeReadKey.slice(4);
        const col = COL_BY_KEY.get(volKey);
        const lid = lastReadLetterMap[volKey] || null;
        if (lid && col) {
          setLetterId(lid);
          setScreen(col.letterScreen);
        }
      } else if (activeReadKey.startsWith("bible-study-")) {
        const slug = activeReadKey.slice("bible-study-".length);
        const chId = lastReadChapters[activeReadKey];
        const study = getStudyById(slug);
        if (study && chId) {
          selectStudyChapter(slug, chId);
        } else if (study) {
          selectStudy(slug);
        }
      } else {
        const ch = lastReadChapters[activeReadKey];
        if (ch) {
          setBookId(activeReadKey);
          setChapterNum(ch);
          setScreen(activeReadKey === "matthew" ? "matthew-ch" : "bible-ch");
        }
      }
    };
    return {
      prophecyCardStatesRef,
      saveProphecyCardStates,
      setLastReadForVol,
      selectMatthewCh,
      selectBibleCh,
      goToLastRead
    };
  }

  // app/src/main/assets/src/hooks/use-reading-chain-nav.js
  function useReadingChainNav({
    book,
    chapter,
    bookId,
    setBookId,
    setChapterNum,
    setScreen,
    setLetterId,
    setActiveReadKey,
    setLastReadForVol,
    goToGardenFirst
  }) {
    const goToRevelationLast = () => {
      const rev = typeof BOOKS !== "undefined" ? BOOKS.revelation : null;
      if (!rev) return;
      setBookId("revelation");
      setChapterNum(rev.chapters[rev.chapters.length - 1].num);
      setScreen("bible-ch");
    };
    const _first = (arr, volKey, scr) => () => {
      if (arr.length > 0) {
        const id = arr[0].id;
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(scr);
      }
    };
    const _last = (arr, volKey, scr) => () => {
      if (arr.length > 0) {
        const id = arr[arr.length - 1].id;
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(scr);
      }
    };
    const _firstPreface = (preface, arr, volKey, scr) => () => {
      const id = preface ? preface.id : arr.length > 0 ? arr[0].id : null;
      if (id) {
        setLetterId(id);
        setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id));
        setScreen(scr);
      }
    };
    var _goFirst = {}, _goLast = {};
    COLLECTIONS.forEach(function(col) {
      if (!col.letterScreen) return;
      var arr = colLetterArr(col);
      var pref = colPreface(col);
      _goFirst[col.volKey] = pref ? _firstPreface(pref, arr, col.volKey, col.letterScreen) : _first(arr, col.volKey, col.letterScreen);
      _goLast[col.volKey] = _last(arr, col.volKey, col.letterScreen);
    });
    const boundaryConfig = (volKey, entry) => {
      const sourceCol = COL_BY_KEY.get(volKey);
      if (!sourceCol) return { prevBoundary: null, onPrevBoundary: null, nextBoundary: null, onNextBoundary: null };
      const hasPrev = !!(entry && (entry.prevLetter || entry.prevEntry));
      const hasNext = !!(entry && (entry.nextLetter || entry.nextEntry));
      const idx = READING_CHAIN.indexOf(volKey);
      let prevBoundary = null, onPrevBoundary = null, nextBoundary = null, onNextBoundary = null;
      if (!hasPrev) {
        if (volKey === "one") {
          const rev = typeof BOOKS !== "undefined" ? BOOKS.revelation : null;
          if (rev) {
            prevBoundary = { short: "Revelation", title: `Revelation \xB7 Chapter ${rev.chapters[rev.chapters.length - 1].num}` };
            onPrevBoundary = goToRevelationLast;
          }
        } else if (idx > 0) {
          for (let i = idx - 1; i >= 0; i--) {
            const pCol = COL_BY_KEY.get(READING_CHAIN[i]);
            const pArr = colLetterArr(pCol);
            if (pArr.length === 0) continue;
            prevBoundary = { short: _boundaryShort(sourceCol, pCol), title: pArr[pArr.length - 1].title || pCol.short };
            onPrevBoundary = _goLast[pCol.volKey];
            break;
          }
        }
      }
      if (!hasNext) {
        if (volKey === "holydays") {
          nextBoundary = { short: "A Return to the Garden", title: "A Return to the Garden" };
          onNextBoundary = goToGardenFirst;
        } else if (idx >= 0 && idx < READING_CHAIN.length - 1) {
          for (let i = idx + 1; i < READING_CHAIN.length; i++) {
            const nCol = COL_BY_KEY.get(READING_CHAIN[i]);
            const nArr = colLetterArr(nCol);
            if (nArr.length === 0) continue;
            const pref = colPreface(nCol);
            nextBoundary = { short: _boundaryShort(sourceCol, nCol), title: (pref ? pref.title : nArr[0].title) || nCol.short };
            onNextBoundary = _goFirst[nCol.volKey];
            break;
          }
        }
      }
      return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
    };
    const bookIdx = book ? BIBLE_BOOK_LIST.findIndex((b) => b.id === bookId) : -1;
    const prevBibleBook = bookIdx > 0 ? BIBLE_BOOK_LIST[bookIdx - 1] : null;
    const nextBibleBook = bookIdx >= 0 && bookIdx < BIBLE_BOOK_LIST.length - 1 ? BIBLE_BOOK_LIST[bookIdx + 1] : null;
    const goNextBibleBook = () => {
      if (!nextBibleBook) return;
      setBookId(nextBibleBook.id);
      setChapterNum(nextBibleBook.chapters[0].num);
      setScreen("bible-ch");
    };
    const goPrevBibleBook = () => {
      if (!prevBibleBook) return;
      setBookId(prevBibleBook.id);
      setChapterNum(prevBibleBook.chapters[prevBibleBook.chapters.length - 1].num);
      setScreen("bible-ch");
    };
    const chIsFirst = chapter && !book?.chapters.find((c) => c.num === chapter.num - 1);
    const chIsLast = chapter && !book?.chapters.find((c) => c.num === chapter.num + 1);
    const bcvPrevBook = chIsFirst ? prevBibleBook : null;
    const bcvOnPrevBook = goPrevBibleBook;
    const bcvPrevBoundaryTitle = null;
    const bcvNextBook = chIsLast ? bookId === "revelation" ? { title: "Volume One", chapters: [{ num: 1 }] } : nextBibleBook : null;
    const bcvOnNextBook = chIsLast && bookId === "revelation" ? _goFirst.one : goNextBibleBook;
    const bcvNextBoundaryTitle = chIsLast && bookId === "revelation" ? "Volume One \xB7 Letter 1" : null;
    return {
      goToRevelationLast,
      boundaryConfig,
      bookIdx,
      prevBibleBook,
      nextBibleBook,
      goNextBibleBook,
      goPrevBibleBook,
      chIsFirst,
      chIsLast,
      bcvPrevBook,
      bcvOnPrevBook,
      bcvPrevBoundaryTitle,
      bcvNextBook,
      bcvOnNextBook,
      bcvNextBoundaryTitle
    };
  }

  // app/src/main/assets/src/hooks/use-surprise.js
  function _randomIndex(max) {
    if (!Number.isInteger(max) || max <= 0) return 0;
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const RANGE = 4294967296;
      const acceptCeiling = RANGE - RANGE % max;
      const buf = new Uint32Array(1);
      for (let i = 0; i < 16; i++) {
        crypto.getRandomValues(buf);
        if (buf[0] < acceptCeiling) return buf[0] % max;
      }
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  function useSurprise({
    setSurpriseAnchor,
    setBookId,
    setChapterNum,
    setScreen,
    setLetterId,
    setActiveReadKey,
    setLastReadForVol,
    selectStudyChapter
  }) {
    const handleSurprise = () => {
      const _MATTHEW = typeof MATTHEW !== "undefined" && MATTHEW ? MATTHEW : null;
      const _BBL = typeof BIBLE_BOOK_LIST !== "undefined" && BIBLE_BOOK_LIST ? BIBLE_BOOK_LIST : [];
      const pool = [
        ..._MATTHEW ? _MATTHEW.chapters.map((ch) => ({ _k: "matthew", num: ch.num })) : [],
        ..._BBL.flatMap((b) => b.chapters.map((ch) => ({ _k: "bible", bookId: b.id, num: ch.num }))),
        ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).flatMap((s) => s.chapters.map((ch) => ({ _k: "study", studyId: s.id, chId: ch.id })))
      ];
      for (const col of COLLECTIONS) {
        if (!col.surpriseType) continue;
        const pref = typeof colPreface === "function" ? colPreface(col) : null;
        if (pref && pref.id) pool.push({ _k: "col", volKey: col.volKey, id: pref.id });
        for (const l of colLetterArr(col)) pool.push({ _k: "col", volKey: col.volKey, id: l.id });
      }
      if (pool.length === 0) {
        if (typeof window.__loadBibleCorpus === "function") window.__loadBibleCorpus();
        if (typeof window.__loadMatthewCorpus === "function") window.__loadMatthewCorpus();
        if (typeof window.__loadVotCorpus === "function") window.__loadVotCorpus();
        return;
      }
      const pick = pool[_randomIndex(pool.length)];
      setSurpriseAnchor(null);
      if (pick._k === "matthew") {
        setBookId("matthew");
        setChapterNum(pick.num);
        setScreen("matthew-ch");
      } else if (pick._k === "bible") {
        setBookId(pick.bookId);
        setChapterNum(pick.num);
        setScreen("bible-ch");
      } else if (pick._k === "study") {
        selectStudyChapter(pick.studyId, pick.chId);
      } else {
        const col = COL_BY_KEY.get(pick.volKey);
        if (!col) return;
        setLetterId(pick.id);
        setActiveReadKey("vol:" + col.volKey, () => setLastReadForVol(col.volKey, pick.id));
        setScreen(col.letterScreen);
      }
    };
    return { handleSurprise };
  }

  // app/src/main/assets/src/hooks/use-app-shell-effects.js
  function useAppShellEffects({ setHlTick, setNavOrigin, setScreen }) {
    React.useEffect(() => {
      window.__bumpHlTick = () => setHlTick((t) => t + 1);
      return () => {
        delete window.__bumpHlTick;
      };
    }, []);
    const [showWelcome, setShowWelcome] = React.useState(() => !WelcomedFlagStore.is());
    const [isOnline, setIsOnline] = React.useState(false);
    React.useEffect(() => {
      let cancelled = false;
      const check = () => {
        fetch("https://www.thevolumesoftruth.com/favicon.ico", { mode: "no-cors", cache: "no-store" }).then(() => {
          if (!cancelled) setIsOnline(true);
        }).catch(() => {
          if (!cancelled) setIsOnline(false);
        });
      };
      check();
      return () => {
        cancelled = true;
      };
    }, [showWelcome]);
    const dismissWelcome = () => {
      WelcomedFlagStore.set();
      setShowWelcome(false);
      if (!AboutSeenFlagStore2.is()) {
        setNavOrigin({ screen: "home", bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });
        setScreen("about");
      }
    };
    return { showWelcome, setShowWelcome, isOnline, dismissWelcome };
  }

  // app/src/main/assets/src/hooks/use-storage-info.js
  function useStorageInfo() {
    const [state, setState] = React.useState(() => ({
      status: (
        /** @type {'loading' | 'ready' | 'unavailable'} */
        "loading"
      ),
      quota: (
        /** @type {number | null} */
        null
      ),
      usage: (
        /** @type {number | null} */
        null
      ),
      persisted: (
        /** @type {boolean | null} */
        null
      ),
      persistDenied: false
    }));
    const apiRef = React.useRef(
      /** @type {StorageManager | null} */
      null
    );
    React.useEffect(() => {
      const nav = typeof navigator !== "undefined" ? navigator : null;
      const storage = nav && nav.storage;
      if (!storage || typeof storage.estimate !== "function") {
        setState((prev) => ({ ...prev, status: "unavailable" }));
        return;
      }
      apiRef.current = storage;
      let cancelled = false;
      const fetchEstimate = storage.estimate();
      const fetchPersisted = typeof storage.persisted === "function" ? storage.persisted() : Promise.resolve(false);
      Promise.all([fetchEstimate.catch(() => null), fetchPersisted.catch(() => false)]).then(([estimate, persisted]) => {
        if (cancelled) return;
        const quota = estimate && typeof estimate.quota === "number" ? estimate.quota : null;
        const usage = estimate && typeof estimate.usage === "number" ? estimate.usage : null;
        setState((prev) => ({
          ...prev,
          status: "ready",
          quota,
          usage,
          persisted: !!persisted
        }));
      });
      return () => {
        cancelled = true;
      };
    }, []);
    const requestPersist = React.useCallback(async () => {
      const storage = apiRef.current;
      if (!storage || typeof storage.persist !== "function") {
        setState((prev) => ({ ...prev, persistDenied: true }));
        return;
      }
      try {
        const granted = await storage.persist();
        setState((prev) => ({
          ...prev,
          persisted: !!granted,
          persistDenied: !granted
        }));
      } catch (_e) {
        setState((prev) => ({ ...prev, persistDenied: true }));
      }
    }, []);
    return {
      status: state.status,
      quota: state.quota,
      usage: state.usage,
      persisted: state.persisted,
      persistDenied: state.persistDenied,
      requestPersist
    };
  }

  // app/src/main/assets/src/utils/format-bytes.js
  function formatBytes(bytes) {
    if (bytes == null || typeof bytes !== "number" || !isFinite(bytes) || bytes < 0) return "?";
    if (bytes < 1024) return bytes + " B";
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + " KB";
    const mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(1) + " MB";
    const gb = mb / 1024;
    if (gb < 1024) return gb.toFixed(1) + " GB";
    const tb = gb / 1024;
    return tb.toFixed(1) + " TB";
  }

  // app/src/main/assets/src/data/journal-helpers.js
  var JournalHelpers2 = /* @__PURE__ */ (function() {
    function blockId() {
      return "b_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    }
    function newBlock(type, extra) {
      return Object.assign({ id: blockId(), type }, extra || {});
    }
    function defaultBlocks() {
      return [newBlock("p", { text: "" })];
    }
    function collectRefs(entry) {
      var seen = {};
      var out = [];
      function push(key) {
        if (key && !seen[key]) {
          seen[key] = true;
          out.push(key);
        }
      }
      var blocks = entry && entry.blocks || [];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        switch (b.type) {
          case "letter-card":
            if (b.volKey && b.letterId) push("letter:" + b.volKey + "/" + b.letterId);
            break;
          case "chapter-card":
            if (b.bookId && b.chapter != null) push("chapter:" + b.bookId + ":" + b.chapter);
            break;
          case "verse-block":
            if (b.ref) push("scripture:" + b.ref);
            break;
          case "bookmark-card":
            if (b.bookmarkId) push("bookmark:" + b.bookmarkId);
            break;
          case "note-card":
            if (b.noteGroupId) push("note:" + b.noteGroupId);
            break;
          case "journal-card":
            if (b.entryId) push("journal:" + b.entryId);
            break;
          case "notebook-card":
            if (b.notebookId) push("notebook:" + b.notebookId);
            break;
          case "p":
          case "h2":
          case "quote": {
            var text = b.text || "";
            var refRe = /\{\{ref:([^}]+)\}\}/g;
            var m;
            while ((m = refRe.exec(text)) !== null) push("scripture:" + m[1].trim());
            var lnkRe = /\[\[(letter|bookmark|journal):([^\]]+)\]\]/g;
            while ((m = lnkRe.exec(text)) !== null) {
              var kind = m[1];
              var ref = m[2].trim();
              if (kind === "letter") push("letter:" + ref);
              else if (kind === "bookmark") push("bookmark:" + ref);
              else if (kind === "journal") push("journal:" + ref);
            }
            break;
          }
        }
      }
      return out;
    }
    function previewText(entry, maxLen) {
      maxLen = maxLen || 180;
      var blocks = entry && entry.blocks || [];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.type === "p" || b.type === "quote" || b.type === "h2") {
          if (b.text && b.text.trim()) {
            var t = b.text.replace(/\{\{ref:([^}]+)\}\}/g, "$1").replace(/\[\[(letter|bookmark|journal):[^\]]+\]\]/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/_(.+?)_/g, "$1").replace(/\s+/g, " ").trim();
            if (t.length > maxLen) t = t.substring(0, maxLen).trim() + "\u2026";
            return t;
          }
        }
      }
      for (var j = 0; j < blocks.length; j++) {
        var b2 = blocks[j];
        if (b2.type === "image") return "[Image]";
        if (b2.type === "audio") return "[Voice recording]";
        if (b2.type === "letter-card") {
          var ctx = typeof findEntryContext === "function" ? findEntryContext(b2.letterId, "letter") : null;
          return ctx && ctx.title ? "[Letter: " + ctx.title + "]" : "[Letter]";
        }
        if (b2.type === "chapter-card") {
          var title = typeof _bookTitle === "function" ? _bookTitle(b2.bookId) : b2.bookId;
          return "[" + title + " " + b2.chapter + "]";
        }
        if (b2.type === "verse-block") return "[" + (b2.ref || "Scripture") + "]";
        if (b2.type === "bookmark-card") return "[Bookmark]";
        if (b2.type === "note-card") return "[Note]";
        if (b2.type === "journal-excerpt") {
          var ex = (b2.text || "").replace(/\s+/g, " ").trim();
          if (ex) return ex.length > maxLen ? ex.substring(0, maxLen).trim() + "\u2026" : ex;
          return "[Linked excerpt]";
        }
        if (b2.type === "journal-card") return "[Linked journal entry]";
        if (b2.type === "notebook-card") {
          var rnb = resolveNotebookCard(b2.notebookId);
          return rnb ? "[Notebook: " + rnb.title + "]" : "[Notebook]";
        }
        if (b2.type === "divider") continue;
      }
      return "";
    }
    function attachmentSummary(entry) {
      var counts = { image: 0, audio: 0, letter: 0, chapter: 0, verse: 0, bookmark: 0, note: 0, journal: 0 };
      var blocks = entry && entry.blocks || [];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.type === "image") counts.image++;
        else if (b.type === "audio") counts.audio++;
        else if (b.type === "letter-card") counts.letter++;
        else if (b.type === "chapter-card") counts.chapter++;
        else if (b.type === "verse-block") counts.verse++;
        else if (b.type === "bookmark-card") counts.bookmark++;
        else if (b.type === "note-card") counts.note++;
        else if (b.type === "journal-card") counts.journal++;
      }
      var out = [];
      if (counts.letter) out.push({ kind: "letter", label: counts.letter + (counts.letter === 1 ? " letter" : " letters") });
      if (counts.chapter) out.push({ kind: "chapter", label: counts.chapter + (counts.chapter === 1 ? " chapter" : " chapters") });
      if (counts.verse) out.push({ kind: "verse", label: counts.verse + (counts.verse === 1 ? " scripture" : " scriptures") });
      if (counts.bookmark) out.push({ kind: "bookmark", label: counts.bookmark + (counts.bookmark === 1 ? " bookmark" : " bookmarks") });
      if (counts.note) out.push({ kind: "note", label: counts.note + (counts.note === 1 ? " note" : " notes") });
      if (counts.image) out.push({ kind: "image", label: counts.image + (counts.image === 1 ? " image" : " images") });
      if (counts.audio) out.push({ kind: "audio", label: "Voice \xB7 " + (counts.audio > 1 ? counts.audio + " clips" : blocks.find(function(b2) {
        return b2.type === "audio";
      })?.duration ? formatDuration(blocks.find(function(b2) {
        return b2.type === "audio";
      }).duration) : "memo") });
      if (counts.journal) out.push({ kind: "journal", label: counts.journal + (counts.journal === 1 ? " link" : " links") });
      return out;
    }
    function formatDuration(seconds) {
      if (!seconds && seconds !== 0) return "";
      seconds = Math.round(seconds);
      var m = Math.floor(seconds / 60);
      var s = String(seconds % 60).padStart(2, "0");
      return m + ":" + s;
    }
    function resolveLetterCard(volKey, letterId, excerpt) {
      if (typeof COL_BY_KEY === "undefined" || typeof findEntryContext !== "function") return null;
      var col = COL_BY_KEY.get(volKey);
      if (!col) return null;
      var ctx = findEntryContext(letterId, col.kind === "letter" ? "letter" : col.kind);
      if (!ctx || !ctx.entry) return null;
      var e = ctx.entry;
      var body;
      if (excerpt && typeof excerpt === "string" && excerpt.trim().length) {
        return {
          title: e.title || ctx.title || letterId,
          eyebrow: col.label,
          body: excerpt,
          date: e.date || "",
          isExcerpt: true
        };
      }
      body = "";
      if (e.blocks && e.blocks.length) {
        for (var i = 0; i < e.blocks.length; i++) {
          var b = e.blocks[i];
          if (b.type === "para" && b.segments) {
            body = b.segments.map(function(s) {
              return s.v || "";
            }).join(" ").trim();
            if (body) break;
          }
        }
      }
      if (!body && e.paragraphs && e.paragraphs.length) {
        body = (e.paragraphs[0].text || "").replace(/\{\{[^}]+\}\}/g, "").replace(/[_*]/g, "").trim();
      }
      return {
        title: e.title || ctx.title || letterId,
        eyebrow: col.label,
        body: body.length > 180 ? body.substring(0, 180) + "\u2026" : body,
        date: e.date || ""
      };
    }
    function resolveChapterCard(bookId, chapter) {
      if (typeof _bookTitle !== "function") return null;
      return { title: _bookTitle(bookId) + " " + chapter, eyebrow: "Bible Chapter" };
    }
    function resolveBookmarkCard(bookmarkId) {
      if (typeof BookmarkStore === "undefined") return null;
      var b = BookmarkStore.get(bookmarkId);
      if (!b) return null;
      var label = b.label || "Bookmark";
      return {
        title: label,
        eyebrow: "Bookmark",
        body: b.thought || ""
      };
    }
    function resolveNoteCard(noteGroupId) {
      if (typeof NoteStore === "undefined") return null;
      var n = NoteStore.get(noteGroupId);
      if (!n) return null;
      var anchor = (n.fullText || "").substring(0, 100);
      return {
        title: "Note",
        eyebrow: "My Note",
        body: n.body || anchor
      };
    }
    function resolveNotebookCard(notebookId) {
      if (notebookId === "uncategorized") {
        return { title: "Uncategorized", eyebrow: "Notebook", deleted: false };
      }
      if (typeof NotebookStore === "undefined") return null;
      var nb = NotebookStore.get(notebookId);
      if (!nb) return { title: "(Deleted notebook)", eyebrow: "Notebook", deleted: true };
      return { title: nb.name || "Notebook", eyebrow: "Notebook", deleted: false };
    }
    function getBlockFromEntry(entryId, blockId2) {
      if (typeof JournalStore === "undefined") return null;
      var e = JournalStore.get(entryId);
      if (!e) return null;
      var blocks = e.blocks || [];
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].id === blockId2) return blocks[i];
      }
      return null;
    }
    function describeBlock(block) {
      if (!block) return "";
      switch (block.type) {
        case "image":
          return "[Image]" + (block.caption ? " \u2014 " + block.caption : "");
        case "audio":
          return "[Voice memo" + (block.duration ? " \xB7 " + formatDuration(block.duration) : "") + "]" + (block.caption ? " \u2014 " + block.caption : "");
        case "p":
        case "h2": {
          var t = (block.text || "").replace(/\{\{ref:([^}]+)\}\}/g, "$1").replace(/\[\[(letter|bookmark|journal):[^\]]+\]\]/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/_(.+?)_/g, "$1").replace(/\s+/g, " ").trim();
          return t.length > 90 ? t.substring(0, 90) + "\u2026" : t;
        }
        case "quote": {
          var q = (block.text || "").replace(/\s+/g, " ").trim();
          return "\u201C" + (q.length > 80 ? q.substring(0, 80) + "\u2026" : q) + "\u201D";
        }
        case "divider":
          return "\u2014 Divider \u2014";
        case "letter-card":
          return "[Letter card]";
        case "chapter-card":
          return "[Chapter card]";
        case "verse-block":
          return "[" + (block.ref || "Scripture") + "]";
        case "bookmark-card":
          return "[Bookmark]";
        case "note-card":
          return "[Note]";
        case "journal-card":
          return "[Linked journal entry]";
        case "notebook-card": {
          var rb = resolveNotebookCard(block.notebookId);
          return "[Notebook: " + (rb ? rb.title : "Notebook") + "]";
        }
        case "journal-excerpt": {
          var qe = (block.text || "").replace(/\s+/g, " ").trim();
          return qe.length > 80 ? qe.substring(0, 80) + "\u2026" : qe;
        }
      }
      return block.type;
    }
    function isEmbeddableBlock(block) {
      if (!block) return false;
      return ["p", "h2", "quote", "image", "audio"].indexOf(block.type) >= 0;
    }
    function embedBlockFromJournal(source, block) {
      if (!source || !block) return null;
      var meta = {
        sourceJournalId: source.id,
        sourceBlockId: block.id,
        sourceJournalTitle: entryDisplayTitle(source) || "Untitled"
      };
      if (block.type === "image") {
        return newBlock("image", Object.assign({}, meta, {
          mediaId: block.mediaId,
          caption: block.caption || ""
        }));
      }
      if (block.type === "audio") {
        return newBlock("audio", Object.assign({}, meta, {
          mediaId: block.mediaId,
          duration: block.duration,
          caption: block.caption || "",
          samples: block.samples || null
        }));
      }
      if (block.type === "p" || block.type === "h2" || block.type === "quote") {
        return newBlock("journal-excerpt", Object.assign({}, meta, {
          text: block.text || "",
          originType: block.type,
          cite: block.cite || ""
        }));
      }
      return null;
    }
    function resolveVerseBlock(ref, overrideText) {
      if (overrideText && typeof overrideText === "string" && overrideText.trim().length) {
        return { cite: ref, text: overrideText, isExcerpt: true };
      }
      var text = "";
      if (typeof window.resolveVerseText === "function") {
        try {
          text = window.resolveVerseText(ref) || "";
        } catch (e) {
        }
      }
      return { cite: ref, text };
    }
    function refKeyToEndpoint(refKey) {
      if (!refKey) return null;
      var sep = refKey.indexOf(":");
      if (sep < 0) return null;
      var kind = refKey.substring(0, sep);
      var rest = refKey.substring(sep + 1);
      if (kind === "letter") {
        var slash = rest.indexOf("/");
        if (slash < 0) return null;
        var volKey = rest.substring(0, slash);
        var letterId = rest.substring(slash + 1);
        var col = typeof COL_BY_KEY !== "undefined" ? COL_BY_KEY.get(volKey) : null;
        return col ? { type: col.kind === "letter" ? "letter" : col.kind, key: refKey, letterId, entryId: letterId, screen: col.letterScreen } : null;
      }
      if (kind === "chapter") {
        var parts = rest.split(":");
        return { type: "bible", key: refKey, bookId: parts[0], chapter: parseInt(parts[1] || "0", 10) };
      }
      if (kind === "bookmark") {
        var b = typeof BookmarkStore !== "undefined" ? BookmarkStore.get(rest) : null;
        if (!b || typeof _bookmarkSourceEndpoint !== "function") return null;
        return _bookmarkSourceEndpoint(b.hlKey);
      }
      if (kind === "note") {
        var n = typeof NoteStore !== "undefined" ? NoteStore.get(rest) : null;
        if (!n || typeof noteSourceNav !== "function") return null;
        return noteSourceNav(n);
      }
      if (kind === "scripture") {
        return null;
      }
      return null;
    }
    function entryDisplayTitle(entry, dateFn) {
      if (entry.title && entry.title.trim()) return entry.title;
      var preview = previewText(entry, 50);
      if (preview && preview.length > 5) return preview;
      return "";
    }
    function shortDate(ts) {
      if (!ts) return "";
      var d = new Date(ts);
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[d.getMonth()] + " " + d.getDate();
    }
    function longDate(ts) {
      if (!ts) return "";
      var d = new Date(ts);
      var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }
    function shortTime(ts) {
      if (!ts) return "";
      var d = new Date(ts);
      var h = d.getHours();
      var m = d.getMinutes();
      var ap = h < 12 ? "a" : "p";
      var h12 = h % 12;
      if (h12 === 0) h12 = 12;
      return h12 + ":" + (m < 10 ? "0" + m : m) + ap;
    }
    return {
      blockId,
      newBlock,
      defaultBlocks,
      collectRefs,
      previewText,
      attachmentSummary,
      formatDuration,
      resolveLetterCard,
      resolveChapterCard,
      resolveBookmarkCard,
      resolveNoteCard,
      resolveNotebookCard,
      resolveVerseBlock,
      refKeyToEndpoint,
      entryDisplayTitle,
      shortDate,
      shortTime,
      longDate,
      // Journal-to-journal block embed helpers
      getBlockFromEntry,
      describeBlock,
      isEmbeddableBlock,
      embedBlockFromJournal
    };
  })();

  // app/src/main/assets/src/data/scripture-resolution.js
  var COLLECTIONS2 = [
    { volKey: "one", cardId: "volume-one", readKey: "volume-one", globalName: "LETTERS_V1", prefaceGlobal: "LETTERS_V1_PREFACE", letterScreen: "vot-one-letter", indexScreen: "vot-one-index", label: "Volume One", registryLabel: "Volume One", searchVolId: "v1", kind: "letter", surpriseType: "vot-one" },
    { volKey: "two", cardId: "volume-two", readKey: "volume-two", globalName: "LETTERS", prefaceGlobal: null, letterScreen: "vot-letter", indexScreen: "vot-index", label: "Volume Two", registryLabel: "Volume Two", searchVolId: "v2", kind: "letter", surpriseType: "vot" },
    { volKey: "three", cardId: "volume-three", readKey: "volume-three", globalName: "LETTERS_V3", prefaceGlobal: "LETTERS_V3_PREFACE", letterScreen: "vot-three-letter", indexScreen: "vot-three-index", label: "Volume Three", registryLabel: "Volume Three", searchVolId: "v3", kind: "letter", surpriseType: "vot-three" },
    { volKey: "four", cardId: "volume-four", readKey: "volume-four", globalName: "LETTERS_V4", prefaceGlobal: "LETTERS_V4_PREFACE", letterScreen: "vot-four-letter", indexScreen: "vot-four-index", label: "Volume Four", registryLabel: "Volume Four", searchVolId: "v4", kind: "letter", surpriseType: "vot-four" },
    { volKey: "five", cardId: "volume-five", readKey: "volume-five", globalName: "LETTERS_V5", prefaceGlobal: "LETTERS_V5_PREFACE", letterScreen: "vot-five-letter", indexScreen: "vot-five-index", label: "Volume Five", registryLabel: "Volume Five", searchVolId: "v5", kind: "letter", surpriseType: "vot-five" },
    { volKey: "six", cardId: "volume-six", readKey: "volume-six", globalName: "LETTERS_V6", prefaceGlobal: "LETTERS_V6_PREFACE", letterScreen: "vot-six-letter", indexScreen: "vot-six-index", label: "Volume Six", registryLabel: "Volume Six", searchVolId: "v6", kind: "letter", surpriseType: "vot-six" },
    { volKey: "seven", cardId: "volume-seven", readKey: "volume-seven", globalName: "LETTERS_V7", prefaceGlobal: "LETTERS_V7_PREFACE", letterScreen: "vot-seven-letter", indexScreen: "vot-seven-index", label: "Volume Seven", registryLabel: "Volume Seven", searchVolId: "v7", kind: "letter", surpriseType: "vot-seven" },
    { volKey: "timothy", cardId: "letters-timothy", readKey: "letters-timothy", globalName: "LETTERS_TIMOTHY", prefaceGlobal: "LETTERS_TIMOTHY_PREFACE", letterScreen: "vot-timothy-letter", indexScreen: "vot-timothy-index", label: "Letters from Timothy", registryLabel: "Letters from Timothy", searchVolId: "timothy", kind: "letter", surpriseType: "vot-timothy" },
    { volKey: "flock", cardId: "little-flock", readKey: "little-flock", globalName: "LETTERS_FLOCK", prefaceGlobal: "LETTERS_FLOCK_PREFACE", letterScreen: "vot-flock-letter", indexScreen: "vot-flock-index", label: "Letters to The Lord's Little Flock", registryLabel: "Letters to The Lord's Little Flock", searchVolId: "flock", kind: "letter", surpriseType: "vot-flock" },
    { volKey: "rebuke", cardId: "lords-rebuke", readKey: "lords-rebuke", globalName: "LETTERS_REBUKE", prefaceGlobal: "LETTERS_REBUKE_PREFACE", letterScreen: "vot-rebuke-letter", indexScreen: "vot-rebuke-index", label: "The Lord's Rebuke", registryLabel: "A Testament Against The World: The Lord's Rebuke", searchVolId: "rebuke", kind: "letter", surpriseType: "vot-rebuke" },
    { volKey: "wtlb1", cardId: "words-to-live-by-1", readKey: "wtlb-one", globalName: "WTLB_ONE", prefaceGlobal: null, letterScreen: "wtlb-one-entry", indexScreen: "wtlb-one-index", label: "Words To Live By: Part One", registryLabel: "Words To Live By: Part One", searchVolId: "wtlb1", kind: "wtlb", surpriseType: "wtlb1" },
    { volKey: "wtlb2", cardId: "words-to-live-by-2", readKey: "wtlb-two", globalName: "WTLB_TWO", prefaceGlobal: null, letterScreen: "wtlb-two-entry", indexScreen: "wtlb-two-index", label: "Words To Live By: Part Two", registryLabel: "Words To Live By: Part Two", searchVolId: "wtlb2", kind: "wtlb", surpriseType: "wtlb2" },
    { volKey: "blessed", cardId: "the-blessed", readKey: "the-blessed", globalName: "THE_BLESSED", prefaceGlobal: null, letterScreen: "blessed-entry", indexScreen: "blessed-index", label: "The Blessed", registryLabel: "The Blessed", searchVolId: "blessed", kind: "blessed", surpriseType: "blessed" },
    { volKey: "holydays", cardId: "holy-days", readKey: "holy-days", globalName: "HOLY_DAYS", prefaceGlobal: null, letterScreen: "holy-days-entry", indexScreen: "holy-days-index", label: "Regarding The Holy Days", registryLabel: "Regarding The Holy Days", searchVolId: "holydays", kind: "holy-days", surpriseType: "holydays" },
    { volKey: "hm", cardId: null, readKey: "hidden-manna", globalName: "HIDDEN_MANNA", prefaceGlobal: null, letterScreen: "hm-letter", indexScreen: null, label: "Hidden Manna", registryLabel: "Hidden Manna", searchVolId: "hidden-manna", kind: "letter", surpriseType: null }
  ];
  var COL_BY_KEY2 = new Map(COLLECTIONS2.map((c) => [c.volKey, c]));
  var COL_BY_CARD = new Map(COLLECTIONS2.filter((c) => c.cardId).map((c) => [c.cardId, c]));
  var COL_BY_LETTER_SC2 = new Map(COLLECTIONS2.map((c) => [c.letterScreen, c]));
  var COL_BY_INDEX_SC2 = new Map(COLLECTIONS2.filter((c) => c.indexScreen).map((c) => [c.indexScreen, c]));
  var COL_BY_SEARCH_ID2 = new Map(COLLECTIONS2.filter((c) => c.searchVolId).map((c) => [c.searchVolId, c]));
  var COL_BY_READ_KEY = new Map(COLLECTIONS2.filter((c) => c.readKey).map((c) => [c.readKey, c]));
  var _NAV_ICONS = { one: "V1", two: "V2", three: "V3", four: "V4", five: "V5", six: "V6", seven: "V7", timothy: "LT", flock: "LF", rebuke: "LR", wtlb1: "W1", wtlb2: "W2", blessed: "TB", holydays: "HD", hm: "HM" };
  var COL_NAV_ICON = new Map(COLLECTIONS2.map((c) => [c.label, _NAV_ICONS[c.volKey] || "?"]));
  var _BOUNDARY_SHORT = { flock: "Little Flock", holydays: "Holy Days", wtlb1: "Part One", wtlb2: "Part Two" };
  var _BOUNDARY_SHORT_OUTSIDE = { wtlb1: "Words To Live By", wtlb2: "Words To Live By" };
  COLLECTIONS2.forEach((c) => {
    c.short = _BOUNDARY_SHORT[c.volKey] || c.label;
    c.shortFromOutside = _BOUNDARY_SHORT_OUTSIDE[c.volKey] || null;
  });
  var READING_CHAIN2 = ["one", "two", "three", "four", "five", "six", "seven", "rebuke", "wtlb1", "wtlb2", "blessed", "flock", "timothy", "holydays"];
  function _isWtlbFamily(col) {
    return !!col && (col.kind === "wtlb" || col.kind === "blessed");
  }
  function _boundaryShort2(sourceCol, targetCol) {
    if (targetCol.shortFromOutside && _isWtlbFamily(sourceCol) !== _isWtlbFamily(targetCol)) return targetCol.shortFromOutside;
    return targetCol.short;
  }
  function colLetters(col) {
    return col && typeof window[col.globalName] !== "undefined" ? window[col.globalName] : null;
  }
  function colPreface2(col) {
    return col && col.prefaceGlobal && typeof window[col.prefaceGlobal] !== "undefined" ? window[col.prefaceGlobal] : null;
  }
  function colLetterArr2(col) {
    if (!col) return [];
    const arr = colLetters(col);
    return Array.isArray(arr) ? arr : [];
  }
  var LETTER_SCREEN_SET2 = new Set(COLLECTIONS2.map((c) => c.letterScreen).concat(["bible-study-chapter"]));
  function _allBooks2() {
    return window.__ALL_BOOKS || (typeof BOOKS !== "undefined" ? BOOKS : {});
  }
  function _matthew2() {
    return typeof window !== "undefined" && window.MATTHEW || (typeof MATTHEW !== "undefined" ? MATTHEW : null);
  }
  function _studies2() {
    return typeof BIBLE_STUDIES !== "undefined" ? BIBLE_STUDIES : [];
  }
  function parseRefStr(str) {
    if (!str) return null;
    const s = str.trim();
    const tagM = s.match(/\s*\(([A-Za-z]+)\)\s*$/);
    const clean = tagM ? s.slice(0, tagM.index).trim() : s;
    const m = clean.match(/^(\d?\s*[A-Za-z][A-Za-z\s]+?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/);
    if (!m) return null;
    return {
      rawBook: m[1].trim(),
      chapter: parseInt(m[2], 10),
      verse: m[3] ? parseInt(m[3], 10) : null,
      verseEnd: m[4] ? parseInt(m[4], 10) : null,
      tag: tagM ? tagM[1] : null
    };
  }
  function findBook(rawName) {
    if (rawName == null) return null;
    const books = _allBooks2();
    const q = String(rawName).toLowerCase().replace(/\s+/g, "");
    if (!q) return null;
    for (const k of Object.keys(books)) {
      const b = books[k];
      if (!b || !b.title) continue;
      const t = b.title.toLowerCase().replace(/\s+/g, "");
      if (t === q || t.startsWith(q) || b.id === q || t === q + "s" || t.replace(/s$/, "") === q.replace(/s$/, ""))
        return k;
    }
    return null;
  }
  function parseScriptureRef(str) {
    const p = parseRefStr(str);
    if (!p || p.verse == null) return null;
    const bookKey = findBook(p.rawBook);
    if (!bookKey) return null;
    const books = _allBooks2();
    const book = books[bookKey];
    const ch = book.chapters && book.chapters.find((c) => c.num === p.chapter);
    if (!ch) return null;
    const v = ch.sections && ch.sections.flatMap((s) => s.verses).find((v2) => v2.n === p.verse);
    const label = book.title + " " + p.chapter + ":" + p.verse + (p.verseEnd ? "-" + p.verseEnd : "");
    return { bookId: bookKey, bookTitle: book.title, chapter: p.chapter, verse: p.verse, verseEnd: p.verseEnd, label, text: v ? v.text : "" };
  }
  function resolveVerseText(endpoint) {
    if (endpoint.type === "bible") {
      const book = _allBooks2()[endpoint.bookId];
      if (!book) return endpoint.preview || "";
      const ch = book.chapters && book.chapters.find((c) => c.num === endpoint.chapter);
      if (!ch) return endpoint.preview || "";
      const v = ch.sections && ch.sections.flatMap((s) => s.verses).find((v2) => v2.n === endpoint.verse);
      return v ? v.text : endpoint.preview || "";
    }
    if (endpoint.type === "study") {
      const M = _matthew2();
      if (!M) return endpoint.preview || "";
      const ch = M.chapters && M.chapters.find((c) => c.num === endpoint.chapter);
      if (!ch) return endpoint.preview || "";
      if (endpoint.verse) {
        const v = ch.verses && ch.verses.find((v2) => v2.n === endpoint.verse);
        return v ? v.text : endpoint.preview || "";
      }
      return ch.title || endpoint.preview || "";
    }
    return endpoint.text || endpoint.preview || "";
  }
  function findEntryContext2(id, kindHint) {
    if (!id) return null;
    const cols = kindHint ? COLLECTIONS2.filter((c) => c.kind === kindHint) : COLLECTIONS2;
    for (const col of cols) {
      const pref = colPreface2(col);
      if (pref && pref.id === id) return { kind: col.kind, screen: col.letterScreen, collection: col.label, title: pref.title || id, entry: pref };
      const arr = colLetters(col);
      if (!Array.isArray(arr)) continue;
      const f = arr.find((e) => e && e.id === id);
      if (f) return { kind: col.kind, screen: col.letterScreen, collection: col.label, title: f.title || id, entry: f };
    }
    if (kindHint === "letter") {
      const hdCol = COL_BY_KEY2 && COL_BY_KEY2.get ? COL_BY_KEY2.get("holydays") : null;
      if (hdCol) {
        const arr = colLetters(hdCol);
        if (Array.isArray(arr)) {
          const f = arr.find((e) => e && e.id === id);
          if (f) return { kind: "holy-days", screen: hdCol.letterScreen, collection: hdCol.label, title: f.title || id, entry: f };
        }
      }
    }
    if (kindHint && kindHint !== "letter") return null;
    var _bs = _studies2();
    if (_bs.length > 0) {
      for (const study of _bs) {
        if (!study || !Array.isArray(study.chapters)) continue;
        const f = study.chapters.find((c) => c && c.id === id);
        if (f) return { kind: "study-letter", screen: "bible-study-chapter", collection: study.title || "Bible Study", title: f.title || id, entry: f, studyId: study.slug || study.id, studyChapterId: f.id };
      }
    }
    return null;
  }
  function lookupVersesFromBooks(ref) {
    const p = parseRefStr(ref);
    if (!p || p.verse == null) return null;
    const bookKey = findBook(p.rawBook);
    if (!bookKey) return null;
    const vEnd = p.verseEnd || p.verse;
    if (p.tag) {
      const code = String(p.tag).toLowerCase();
      if (code !== "nkjv") {
        const data = typeof window !== "undefined" ? window["BIBLE_" + code.toUpperCase()] : null;
        if (data && data[bookKey] && data[bookKey][p.chapter]) {
          const altList = data[bookKey][p.chapter].filter((v) => v.n >= p.verse && v.n <= vEnd);
          if (altList.length) {
            return altList.length === 1 ? altList[0].text : altList.map((v) => `${v.n}. ${v.text}`).join(" ");
          }
        } else if (typeof loadTranslation === "function") {
          try {
            loadTranslation(code);
          } catch (e) {
          }
        }
      }
    }
    const books = _allBooks2();
    const book = books[bookKey];
    const chapter = (book && book.chapters || []).find((c) => c.num === p.chapter);
    if (!chapter) return null;
    const allVerses = chapter.sections ? chapter.sections.flatMap((s) => s.verses || []) : chapter.verses || [];
    const verses = allVerses.filter((v) => v.n >= p.verse && v.n <= vEnd);
    if (!verses.length) return null;
    return verses.length === 1 ? verses[0].text : verses.map((v) => `${v.n}. ${v.text}`).join(" ");
  }

  // app/src/main/assets/src/data/letter-linking.js
  function linkWtlbEntries(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i].prevEntry = i > 0 ? { id: arr[i - 1].id, title: arr[i - 1].title } : null;
      arr[i].nextEntry = i < arr.length - 1 ? { id: arr[i + 1].id, title: arr[i + 1].title } : null;
    }
  }
  function linkPreface(preface, letters) {
    if (!preface || !letters || letters.length === 0) return;
    preface.num = 0;
    preface.isPreface = true;
    preface.nextLetter = { id: letters[0].id, title: letters[0].title };
    letters[0].prevLetter = { id: preface.id, title: preface.title };
  }
  function resolveVotLetter2(vol, letter) {
    if (!letter) return null;
    const key = (vol || "null") + "::" + letter;
    return VOT_LETTER_REGISTRY.get(key) || null;
  }
  function isHiddenManna(n) {
    return !!n && HIDDEN_MANNA_TITLES.has((n.letter || "").trim());
  }

  // app/src/main/assets/src/ui/sheets/JournalRecordingSheet.jsx
  function JournalRecordingSheet2({ onSave, onClose }) {
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var useRef = React.useRef;
    var _stage = useState2("requesting");
    var stage = _stage[0];
    var setStage = _stage[1];
    var _err = useState2(null);
    var error = _err[0];
    var setError = _err[1];
    var _seconds = useState2(0);
    var seconds = _seconds[0];
    var setSeconds = _seconds[1];
    var _waveLive = useState2([]);
    var waveLive = _waveLive[0];
    var setWaveLive = _waveLive[1];
    var _waveFinal = useState2([]);
    var waveFinal = _waveFinal[0];
    var setWaveFinal = _waveFinal[1];
    var _progress = useState2(0);
    var progress = _progress[0];
    var setProgress = _progress[1];
    var _previewPlaying = useState2(false);
    var previewPlaying = _previewPlaying[0];
    var setPreviewPlaying = _previewPlaying[1];
    var tickRef = useRef(0);
    var ampRef = useRef(0);
    var samplesAccumRef = useRef([]);
    var startTimeRef = useRef(0);
    var accumulatedMsRef = useRef(0);
    var previewBlobRef = useRef(null);
    var previewDurationRef = useRef(0);
    var previewUrlRef = useRef(null);
    var previewAudioRef = useRef(null);
    var pendingSaveRef = useRef(false);
    function cleanup() {
      PlatformBridge.endAudioSession();
      PlatformBridge.nativeRecordCancel();
      try {
        if (ampRef.current) clearInterval(ampRef.current);
      } catch (_e) {
      }
      try {
        if (tickRef.current) clearInterval(tickRef.current);
      } catch (_e) {
      }
      ampRef.current = 0;
      tickRef.current = 0;
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch (_e) {
        }
        previewUrlRef.current = null;
      }
    }
    useEffect2(function() {
      var cancelled = false;
      var permDecided = false;
      var permTimer = 0;
      window.__onNativeRecordingComplete = function(b64, durMs, mime) {
        if (cancelled) return;
        try {
          if (ampRef.current) clearInterval(ampRef.current);
        } catch (_e) {
        }
        try {
          if (tickRef.current) clearInterval(tickRef.current);
        } catch (_e) {
        }
        ampRef.current = 0;
        tickRef.current = 0;
        if (!b64) {
          setError("Nothing was recorded. Try again and speak after the timer starts.");
          setStage("error");
          return;
        }
        try {
          var bin = atob(b64);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          var blob = new Blob([arr], { type: mime || "audio/webm" });
          previewBlobRef.current = blob;
          try {
            previewUrlRef.current = URL.createObjectURL(blob);
          } catch (_e) {
          }
          var d = Math.max(1, Math.round((durMs || 0) / 1e3));
          previewDurationRef.current = d;
          setWaveFinal(samplesAccumRef.current.slice());
          setSeconds(d);
          if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            persistRecording();
          } else {
            setStage("preview");
          }
        } catch (e) {
          console.warn("recording decode failed", e);
          setError("Could not process the recording. Please try again.");
          setStage("error");
        }
      };
      function startCapture() {
        if (cancelled) return;
        var res;
        try {
          res = PlatformBridge.nativeRecordStart();
        } catch (_e) {
          res = "error:exception";
        }
        if (res !== "ok") {
          setError(
            res === "error:unsupported-codec" ? "Recording is not supported in this browser." : res === "error:no-stream" ? "Microphone access was not granted." : res === "error:permission" ? "Microphone permission denied. Enable mic access for this app, then try again." : "Could not start the recorder. Please try again."
          );
          setStage("error");
          return;
        }
        PlatformBridge.startAudioSession();
        samplesAccumRef.current = [];
        startTimeRef.current = Date.now();
        accumulatedMsRef.current = 0;
        setStage("recording");
        tickRef.current = setInterval(function() {
          var sinceResume = Date.now() - startTimeRef.current;
          var totalMs = accumulatedMsRef.current + sinceResume;
          var s = Math.floor(totalMs / 1e3);
          setSeconds(s);
          if (s >= 300) {
            previewDurationRef.current = s;
            stopRecording();
          }
        }, 200);
        ampRef.current = setInterval(function() {
          var amp = 0;
          try {
            amp = PlatformBridge.nativeRecordAmplitude() || 0;
          } catch (_e) {
          }
          var lvl = Math.min(1, Math.sqrt(amp / 32767) * 1.8);
          samplesAccumRef.current.push(lvl);
          setWaveLive(samplesAccumRef.current.slice(-48));
        }, 80);
      }
      window.__onMicPermissionResult = function(granted) {
        if (permDecided || cancelled) return;
        permDecided = true;
        if (permTimer) {
          clearTimeout(permTimer);
          permTimer = 0;
        }
        try {
          delete window.__onMicPermissionResult;
        } catch (_e) {
          window.__onMicPermissionResult = void 0;
        }
        if (granted) {
          startCapture();
        } else {
          setError("Microphone permission denied. Enable mic access for this app, then try again.");
          setStage("error");
        }
      };
      permTimer = setTimeout(function() {
        if (permDecided || cancelled) return;
        permDecided = true;
        try {
          delete window.__onMicPermissionResult;
        } catch (_e) {
          window.__onMicPermissionResult = void 0;
        }
        setError("Microphone request timed out. If a permission prompt appeared, please try again.");
        setStage("error");
      }, 2e4);
      try {
        PlatformBridge.requestMicPermission();
      } catch (_e) {
        permDecided = true;
        if (permTimer) {
          clearTimeout(permTimer);
          permTimer = 0;
        }
        setError("Could not request microphone access.");
        setStage("error");
      }
      return function() {
        cancelled = true;
        if (permTimer) {
          clearTimeout(permTimer);
          permTimer = 0;
        }
        try {
          delete window.__onMicPermissionResult;
        } catch (_e) {
          window.__onMicPermissionResult = void 0;
        }
        try {
          delete window.__onNativeRecordingComplete;
        } catch (_e) {
          window.__onNativeRecordingComplete = void 0;
        }
        cleanup();
      };
    }, []);
    function pauseRecording() {
      if (stage !== "recording") return;
      var res = PlatformBridge.nativeRecordPause();
      if (res !== "ok") return;
      accumulatedMsRef.current += Date.now() - startTimeRef.current;
      setStage("paused");
    }
    function resumeRecording() {
      if (stage !== "paused") return;
      var res = PlatformBridge.nativeRecordResume();
      if (res !== "ok") return;
      startTimeRef.current = Date.now();
      setStage("recording");
    }
    function stopRecording() {
      var totalMs = accumulatedMsRef.current;
      if (stage === "recording") totalMs += Date.now() - startTimeRef.current;
      previewDurationRef.current = Math.max(1, Math.floor(totalMs / 1e3));
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = 0;
      }
      if (ampRef.current) {
        clearInterval(ampRef.current);
        ampRef.current = 0;
      }
      PlatformBridge.nativeRecordStop();
      setStage("preview");
    }
    function discard() {
      pendingSaveRef.current = false;
      cleanup();
      onClose && onClose();
    }
    function persistRecording() {
      var blob = previewBlobRef.current;
      if (!blob || !blob.size) {
        setError("Nothing was recorded. Try again and speak after the timer starts.");
        setStage("error");
        return;
      }
      var samplesOut = samplesAccumRef.current && samplesAccumRef.current.length ? samplesAccumRef.current.slice() : waveFinal && waveFinal.length ? waveFinal.slice() : null;
      JournalMediaStore.put({
        type: "audio",
        blob,
        mime: blob.type || "audio/webm",
        duration: previewDurationRef.current || seconds
      }).then(function(id) {
        onSave && onSave({
          mediaId: id,
          duration: previewDurationRef.current || seconds,
          samples: samplesOut
        });
        cleanup();
      }).catch(function(err) {
        console.warn("Save failed", err);
        setError("Failed to save recording.");
        setStage("error");
      });
    }
    function save() {
      if (!previewBlobRef.current) {
        if (stage === "recording" || stage === "paused") {
          pendingSaveRef.current = true;
          stopRecording();
          return;
        }
        pendingSaveRef.current = true;
        return;
      }
      persistRecording();
    }
    function togglePreviewPlay() {
      var a = previewAudioRef.current;
      if (!a) return;
      if (a.paused) a.play();
      else a.pause();
    }
    function onPreviewTimeUpdate() {
      var a = previewAudioRef.current;
      if (!a) return;
      var dur = previewDurationRef.current || a.duration || 0;
      setProgress(dur > 0 ? Math.min(1, (a.currentTime || 0) / dur) : 0);
    }
    function seekPreviewFromEvent(e) {
      var a = previewAudioRef.current;
      if (!a) return;
      var rect = e.currentTarget.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var ratio = Math.max(0, Math.min(1, x / rect.width));
      var dur = previewDurationRef.current || a.duration || 0;
      if (dur > 0) {
        a.currentTime = ratio * dur;
        setProgress(ratio);
      }
    }
    var fmtTime = function(s) {
      var m = Math.floor(s / 60);
      return m + ":" + String(s % 60).padStart(2, "0");
    };
    function renderRecordingWave(samples) {
      var bars = [];
      var count = 48;
      var src = samples && samples.length ? samples : [];
      for (var i = 0; i < count; i++) {
        var v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : 0.05;
        var h = Math.max(4, Math.min(56, Math.round(v * 56)));
        bars.push(/* @__PURE__ */ React.createElement("div", { key: i, className: "bar", style: { height: h + "px" } }));
      }
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-waveform" }, bars);
    }
    function renderScrubWave(samples, prog) {
      var bars = [];
      var count = 48;
      var src = samples && samples.length ? samples : [];
      for (var i = 0; i < count; i++) {
        var v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : 0.3;
        var h = Math.max(4, Math.min(56, Math.round(v * 56)));
        bars.push(
          /* @__PURE__ */ React.createElement(
            "div",
            {
              key: i,
              className: "bar" + (i / count <= prog ? " is-played" : ""),
              style: { height: h + "px" }
            }
          )
        );
      }
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "jrn-rec-waveform is-scrubbable",
          onClick: seekPreviewFromEvent,
          role: "slider",
          "aria-label": "Scrub recording"
        },
        bars
      );
    }
    function renderContent() {
      if (stage === "error") {
        return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-error" }, error || "Recording failed."), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-cancel", onClick: discard }, "Close")));
      }
      if (stage === "requesting") {
        return /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-content" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-requesting" }, "Requesting microphone access\u2026"), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-cancel", onClick: discard }, "Cancel")));
      }
      if (stage === "recording" || stage === "paused") {
        var isPaused = stage === "paused";
        return /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-content" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-status" + (isPaused ? " is-paused" : "") }, isPaused ? "Paused" : "Recording"), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-time" }, fmtTime(seconds)), renderRecordingWave(waveLive), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-cancel", onClick: discard, "aria-label": "Cancel" }, "Cancel"), isPaused ? /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-pause-btn", onClick: resumeRecording, "aria-label": "Resume", title: "Resume" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ React.createElement("path", { d: "M6 3v18l16-9z" }))) : /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-pause-btn", onClick: pauseRecording, "aria-label": "Pause", title: "Pause" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ React.createElement("path", { d: "M6 4h4v16H6zM14 4h4v16h-4z" }))), /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-stop-btn", onClick: stopRecording, "aria-label": "Finish", title: "Finish" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ React.createElement("rect", { x: 6, y: 6, width: 12, height: 12, rx: 2 })))));
      }
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-content jrn-rec-preview" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-status" }, "Review"), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-time" }, fmtTime(Math.floor((progress || 0) * (previewDurationRef.current || seconds))), /* @__PURE__ */ React.createElement("span", { className: "jrn-rec-time-total" }, " / " + fmtTime(previewDurationRef.current || seconds))), renderScrubWave(waveFinal, progress), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-preview-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-pp", onClick: togglePreviewPlay, "aria-label": previewPlaying ? "Pause" : "Play", title: previewPlaying ? "Pause" : "Play" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, previewPlaying ? /* @__PURE__ */ React.createElement("path", { d: "M6 4h4v16H6zM14 4h4v16h-4z" }) : /* @__PURE__ */ React.createElement("path", { d: "M6 3v18l16-9z" })))), /* @__PURE__ */ React.createElement("div", { className: "jrn-rec-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-discard-btn", onClick: discard, "aria-label": "Discard", title: "Discard" }, "\xD7"), /* @__PURE__ */ React.createElement("button", { className: "jrn-rec-confirm-btn", onClick: save, "aria-label": "Save", title: "Save" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" })))), previewUrlRef.current && /* @__PURE__ */ React.createElement(
        "audio",
        {
          ref: previewAudioRef,
          src: previewUrlRef.current,
          style: { display: "none" },
          onPlay: function() {
            setPreviewPlaying(true);
          },
          onPause: function() {
            setPreviewPlaying(false);
          },
          onEnded: function() {
            setPreviewPlaying(false);
            setProgress(0);
          },
          onTimeUpdate: onPreviewTimeUpdate
        }
      ));
    }
    return /* @__PURE__ */ React.createElement("div", { className: "note-sheet-overlay", onClick: function(e) {
      if (e.target === e.currentTarget) discard();
    } }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet jrn-rec-sheet", onClick: function(e) {
      e.stopPropagation();
    } }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-header" }, /* @__PURE__ */ React.createElement("span", { className: "note-sheet-title", style: { flex: 1 } }, stage === "preview" ? "Review Recording" : "Voice Recording"), stage !== "preview" && /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-btn", onClick: discard, "aria-label": "Close", style: { fontSize: "18px" } }, "\xD7")), renderContent()));
  }

  // app/src/main/assets/src/ui/sheets/JournalInsertSheet.jsx
  function JournalInsertSheet2(props) {
    var useState2 = React.useState;
    var onClose = props.onClose;
    var onInsertBlock = props.onInsertBlock;
    var onInsertImage = props.onInsertImage;
    var onRecordAudio = props.onRecordAudio;
    var excludeJournalId = props.excludeJournalId;
    var _mode = useState2("menu");
    var mode = _mode[0];
    var setMode = _mode[1];
    var _q = useState2("");
    var query = _q[0];
    var setQuery = _q[1];
    var _drilled = useState2(null);
    var drilledEntry = _drilled[0];
    var setDrilledEntry = _drilled[1];
    function close() {
      try {
        onClose && onClose();
      } catch (_e) {
      }
    }
    function emitBlock(block) {
      if (!block) {
        close();
        return;
      }
      try {
        onInsertBlock && onInsertBlock(block);
      } catch (e) {
        console.warn("JournalInsertSheet emitBlock failed", e);
      }
      close();
    }
    function insertDivider() {
      emitBlock(JournalHelpers.newBlock("divider"));
    }
    function insertBodyText() {
      emitBlock(JournalHelpers.newBlock("p", { text: "" }));
    }
    function openCardPicker() {
      if (typeof window.__openLinkPickerForTarget !== "function") {
        console.warn("LinkPicker bridge unavailable");
        return;
      }
      close();
      window.__openLinkPickerForTarget("card", function(target, item) {
        try {
          var block = targetToJournalBlock(target, item, false);
          if (block && onInsertBlock) onInsertBlock(block);
        } catch (e) {
          console.warn("Insert card failed", e);
        }
      });
    }
    function openExcerptPicker() {
      if (typeof window.__openLinkPickerForTarget !== "function") {
        console.warn("LinkPicker bridge unavailable");
        return;
      }
      close();
      window.__openLinkPickerForTarget("excerpt", function(target, item) {
        try {
          var block = targetToJournalBlock(target, item, true);
          if (block && onInsertBlock) onInsertBlock(block);
        } catch (e) {
          console.warn("Insert excerpt failed", e);
        }
      });
    }
    function targetToJournalBlock(target, item, asExcerpt) {
      if (!target) return null;
      var t = target.type;
      if (t === "bible" || t === "study") {
        var hasText = !!(target.text && target.text.length);
        var hasVerse = target.verse != null;
        if (asExcerpt && hasText) {
          var ref = target.label || (target.bookId || "") + " " + (target.chapter || "") + (hasVerse ? ":" + target.verse + (target.verseEnd ? "-" + target.verseEnd : "") : "");
          return JournalHelpers.newBlock("verse-block", {
            ref,
            text: target.text,
            partial: !!target.partial,
            bookId: target.bookId,
            chapter: target.chapter,
            verse: target.verse || null,
            verseEnd: target.verseEnd || null,
            isStudy: t === "study"
          });
        }
        if (target.bookId != null && target.chapter != null) {
          return JournalHelpers.newBlock("chapter-card", {
            bookId: target.bookId,
            chapter: target.chapter,
            isStudy: t === "study"
          });
        }
        return null;
      }
      if (t === "letter" || t === "wtlb" || t === "blessed" || t === "holy-days" || t === "study-letter") {
        var letterId = target.letterId || target.entryId || target.studyChapterId;
        var volKey = target.volKey;
        if (!volKey && target.collection && typeof COLLECTIONS !== "undefined") {
          for (var i = 0; i < COLLECTIONS.length; i++) {
            if (COLLECTIONS[i].label === target.collection) {
              volKey = COLLECTIONS[i].volKey;
              break;
            }
          }
        }
        if (!volKey && item && item.collection && typeof COLLECTIONS !== "undefined") {
          for (var j = 0; j < COLLECTIONS.length; j++) {
            if (COLLECTIONS[j].label === item.collection) {
              volKey = COLLECTIONS[j].volKey;
              break;
            }
          }
        }
        var extra = { volKey, letterId };
        if (t === "study-letter") {
          extra.studyId = target.studyId;
          extra.studyChapterId = target.studyChapterId || letterId;
        }
        if (asExcerpt && target.text) {
          extra.excerpt = target.text;
          extra.blockKey = target.blockKey || null;
          extra.start = target.start != null ? target.start : null;
          extra.end = target.end != null ? target.end : null;
        }
        if (!volKey || !letterId) return null;
        return JournalHelpers.newBlock("letter-card", extra);
      }
      return null;
    }
    function pickBookmark() {
      setQuery("");
      setMode("pick-bookmark");
    }
    function pickNote() {
      setQuery("");
      setMode("pick-note");
    }
    function pickJournal() {
      setQuery("");
      setMode("pick-journal");
    }
    function pickNotebook() {
      setQuery("");
      setMode("pick-notebook");
    }
    function chooseNotebook(nbId) {
      if (!nbId) {
        close();
        return;
      }
      emitBlock(JournalHelpers.newBlock("notebook-card", { notebookId: nbId }));
    }
    function pickImage() {
      close();
      try {
        onInsertImage && onInsertImage();
      } catch (e) {
        console.warn("pickImage failed", e);
      }
    }
    function pickAudio() {
      close();
      try {
        onRecordAudio && onRecordAudio();
      } catch (e) {
        console.warn("pickAudio failed", e);
      }
    }
    function chooseBookmark(b) {
      if (!b || !b.id) {
        close();
        return;
      }
      emitBlock(JournalHelpers.newBlock("bookmark-card", { bookmarkId: b.id }));
    }
    function chooseNote(n) {
      if (!n || !n.groupId) {
        close();
        return;
      }
      emitBlock(JournalHelpers.newBlock("note-card", { noteGroupId: n.groupId }));
    }
    function chooseJournal(e) {
      if (!e || !e.id) {
        close();
        return;
      }
      setQuery("");
      setDrilledEntry(e);
      setMode("pick-journal-block");
    }
    function chooseWholeEntry(e) {
      if (!e || !e.id) {
        close();
        return;
      }
      emitBlock(JournalHelpers.newBlock("journal-card", { entryId: e.id }));
    }
    function chooseEntryBlock(sourceEntry, block) {
      if (!sourceEntry || !block) {
        close();
        return;
      }
      var embedded = JournalHelpers.embedBlockFromJournal(sourceEntry, block);
      if (embedded) emitBlock(embedded);
      else close();
    }
    var ICONS = {
      card: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }), /* @__PURE__ */ React.createElement("line", { x1: "7", y1: "10", x2: "17", y2: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "7", y1: "14", x2: "13", y2: "14" })),
      excerpt: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M6 9h.01M6 15h.01" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "8", x2: "20", y2: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "12", x2: "20", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "16", x2: "16", y2: "16" }), /* @__PURE__ */ React.createElement("path", { d: "M3 4v16" })),
      bookmark: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M6 3a1 1 0 0 0-1 1v17l7-4 7 4V4a1 1 0 0 0-1-1H6z" })),
      note: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "13", x2: "16", y2: "13" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "17", x2: "14", y2: "17" })),
      journal: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "9", x2: "16", y2: "9" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "13", x2: "16", y2: "13" })),
      notebook: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 4 15 9 20 9" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "14", x2: "15", y2: "14" })),
      image: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "9", r: "1.6" }), /* @__PURE__ */ React.createElement("path", { d: "M21 15l-5-5L5 21" })),
      audio: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("rect", { x: "9", y: "3", width: "6", height: "12", rx: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M5 11a7 7 0 0 0 14 0" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "18", x2: "12", y2: "21" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "21", x2: "15", y2: "21" })),
      divider: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "1.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "12", r: "1.5" })),
      body: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("line", { x1: "4", y1: "7", x2: "20", y2: "7" }), /* @__PURE__ */ React.createElement("line", { x1: "4", y1: "12", x2: "20", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "4", y1: "17", x2: "14", y2: "17" }))
    };
    function insertItem(icon, label, desc, onClick) {
      return /* @__PURE__ */ React.createElement("button", { type: "button", className: "jrn-insert-item", onClick }, /* @__PURE__ */ React.createElement("span", { className: "jrn-insert-icon" }, icon), /* @__PURE__ */ React.createElement("span", { className: "jrn-insert-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-insert-label" }, label), /* @__PURE__ */ React.createElement("span", { className: "jrn-insert-desc" }, desc)));
    }
    function renderMenu() {
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-section" }, /* @__PURE__ */ React.createElement("h4", null, "From the Library"), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-list" }, insertItem(ICONS.card, "Card", "Embed a chapter or letter title", openCardPicker), insertItem(ICONS.excerpt, "Excerpt", "Embed a portion \u2014 pick word-precise text", openExcerptPicker))), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-section" }, /* @__PURE__ */ React.createElement("h4", null, "From Your Annotations"), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-list" }, insertItem(ICONS.bookmark, "Bookmark", "Pull in a saved passage", pickBookmark), insertItem(ICONS.note, "Note", "Reference one of your annotations", pickNote), insertItem(ICONS.journal, "Journal Entry", "Link to another journal entry", pickJournal), insertItem(ICONS.notebook, "Notebook", "Link to a notebook of notes", pickNotebook))), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-section" }, /* @__PURE__ */ React.createElement("h4", null, "Capture"), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-list" }, insertItem(ICONS.image, "Image", "From device gallery", pickImage), insertItem(ICONS.audio, "Voice Recording", "Record a memo or prayer", pickAudio))), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-section", style: { paddingBottom: "20px" } }, /* @__PURE__ */ React.createElement("h4", null, "Text"), /* @__PURE__ */ React.createElement("div", { className: "jrn-insert-list" }, insertItem(ICONS.body, "Body Text", "A new line to write freely", insertBodyText), insertItem(ICONS.divider, "Divider", "3-diamond ornament", insertDivider))));
    }
    function searchPill() {
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-search-row" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "jrn-picker-search",
          type: "text",
          autoFocus: true,
          placeholder: mode === "pick-journal" ? "Search journal entries\u2026" : mode === "pick-bookmark" ? "Search bookmarks\u2026" : "Search notes\u2026",
          value: query,
          onChange: function(e) {
            setQuery(e.target.value);
          }
        }
      ));
    }
    function filterByText(items, getText) {
      var q = query.trim().toLowerCase();
      if (!q) return items;
      return items.filter(function(item) {
        var hay = getText(item) || "";
        return hay.toLowerCase().indexOf(q) >= 0;
      });
    }
    function renderBookmarkPicker() {
      var bms = typeof BookmarkStore !== "undefined" ? BookmarkStore.all() : [];
      bms.sort(function(a, b) {
        return (b.updated || b.created || 0) - (a.updated || a.created || 0);
      });
      var sourceLabel = typeof _bookmarkSourceLabel === "function" ? _bookmarkSourceLabel : function() {
        return "";
      };
      var filtered = filterByText(bms, function(b) {
        return (b.label || "") + " " + (b.thought || "") + " " + (sourceLabel(b.hlKey) || "");
      });
      return /* @__PURE__ */ React.createElement(React.Fragment, null, searchPill(), /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-results" }, filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-empty" }, bms.length === 0 ? "No bookmarks yet." : "No matches.") : filtered.map(function(b) {
        return /* @__PURE__ */ React.createElement("button", { key: b.id, type: "button", className: "jrn-picker-item", onClick: function() {
          chooseBookmark(b);
        } }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-spine" }, "BK"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-label" }, b.label || "Bookmark"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-cat" }, sourceLabel(b.hlKey))));
      })));
    }
    function renderNotePicker() {
      var notes = [];
      try {
        if (typeof NoteStore !== "undefined") {
          notes = typeof NoteStore.list === "function" ? NoteStore.list() : Object.values(NoteStore.all() || {});
        }
      } catch (e) {
        console.warn("NoteStore read failed", e);
        notes = [];
      }
      if (!Array.isArray(notes)) notes = [];
      notes.sort(function(a, b) {
        return (b.updated || b.created || 0) - (a.updated || a.created || 0);
      });
      var noteLabel = typeof noteSourceLabel === "function" ? noteSourceLabel : function() {
        return "";
      };
      var filtered = filterByText(notes, function(n) {
        var src = "";
        try {
          src = noteLabel(n) || "";
        } catch (_e) {
        }
        return (n.body || "") + " " + (n.fullText || "") + " " + src;
      });
      return /* @__PURE__ */ React.createElement(React.Fragment, null, searchPill(), /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-results" }, filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-empty" }, notes.length === 0 ? "No notes yet." : "No matches.") : filtered.slice(0, 200).map(function(n) {
        var anchor = (n.fullText || "").substring(0, 80);
        var label = (n.body || "").substring(0, 60) || anchor || "Note";
        var src = "";
        try {
          src = noteLabel(n);
        } catch (_e) {
        }
        return /* @__PURE__ */ React.createElement("button", { key: n.groupId, type: "button", className: "jrn-picker-item", onClick: function() {
          chooseNote(n);
        } }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-spine" }, "NT"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-label", style: { fontStyle: "italic", textTransform: "none", fontFamily: "EB Garamond, serif" } }, label), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-cat" }, src)));
      })));
    }
    function renderJournalPicker() {
      var entries = [];
      try {
        entries = typeof JournalStore !== "undefined" ? JournalStore.all() : [];
      } catch (e) {
        console.warn("JournalStore.all failed", e);
        entries = [];
      }
      entries = entries.filter(function(e) {
        return e.id !== excludeJournalId;
      });
      var filtered = filterByText(entries, function(e) {
        var title = "";
        var preview = "";
        try {
          title = JournalHelpers.entryDisplayTitle(e) || "";
        } catch (_err) {
        }
        try {
          preview = JournalHelpers.previewText(e, 400) || "";
        } catch (_err) {
        }
        var tags = (e.tags || []).join(" ");
        return title + " " + preview + " " + tags;
      });
      return /* @__PURE__ */ React.createElement(React.Fragment, null, searchPill(), /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-results" }, filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-empty" }, entries.length === 0 ? "No other journal entries yet." : "No matches.") : filtered.map(function(e) {
        var title = "";
        var preview = "";
        try {
          title = JournalHelpers.entryDisplayTitle(e) || "Untitled";
        } catch (_err) {
          title = "Untitled";
        }
        try {
          preview = JournalHelpers.previewText(e, 80) || "";
        } catch (_err) {
        }
        var dateStr = "";
        try {
          dateStr = JournalHelpers.shortDate(e.created);
        } catch (_err) {
        }
        return /* @__PURE__ */ React.createElement("button", { key: e.id, type: "button", className: "jrn-picker-item", onClick: function() {
          chooseJournal(e);
        } }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-spine" }, "JR"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-label" }, title), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-cat" }, dateStr + (preview ? " \xB7 " + preview : ""))));
      })));
    }
    function renderJournalBlockPicker() {
      var e = drilledEntry;
      if (!e) return null;
      var fresh = typeof JournalStore !== "undefined" ? JournalStore.get(e.id) || e : e;
      var blocks = (fresh.blocks || []).filter(JournalHelpers.isEmbeddableBlock);
      var dateStr = "";
      try {
        dateStr = JournalHelpers.shortDate(fresh.created);
      } catch (_err) {
      }
      var title = JournalHelpers.entryDisplayTitle(fresh) || "Untitled";
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "jrn-blockpick-header" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-blockpick-title" }, title), /* @__PURE__ */ React.createElement("div", { className: "jrn-blockpick-date" }, dateStr)), /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-results", style: { paddingBottom: 0 } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "jrn-picker-item jrn-blockpick-whole",
          onClick: function() {
            chooseWholeEntry(fresh);
          }
        },
        /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-spine" }, "JR"),
        /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-label" }, "Link the Whole Entry"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-cat" }, "Inserts a card that opens this entry"))
      )), /* @__PURE__ */ React.createElement("div", { className: "jrn-blockpick-divider" }, "or pick a specific block"), /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-results" }, blocks.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-empty" }, "This entry has no embeddable blocks yet.") : blocks.map(function(b) {
        var spine = b.type === "image" ? "IMG" : b.type === "audio" ? "REC" : b.type === "quote" ? "\u201C \u201D" : b.type === "h2" ? "H" : "TXT";
        var desc = JournalHelpers.describeBlock(b);
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: b.id,
            type: "button",
            className: "jrn-picker-item",
            onClick: function() {
              chooseEntryBlock(fresh, b);
            }
          },
          /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-spine" }, spine),
          /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-label" }, b.type === "image" ? "Image" : b.type === "audio" ? "Voice Recording" : "Text Excerpt"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-cat" }, desc))
        );
      })));
    }
    function renderNotebookPicker() {
      var nbs = typeof NotebookStore !== "undefined" ? NotebookStore.list() : [];
      var noteCount = function(nbId) {
        try {
          var all = typeof NoteStore !== "undefined" ? NoteStore.list() : [];
          if (nbId === "uncategorized") return all.filter(function(n) {
            return !n.notebookIds || n.notebookIds.length === 0;
          }).length;
          return all.filter(function(n) {
            return (n.notebookIds || []).indexOf(nbId) >= 0;
          }).length;
        } catch (_e) {
          return 0;
        }
      };
      var rows = [{ id: "uncategorized", name: "Uncategorized" }].concat(nbs);
      var q = query.trim().toLowerCase();
      if (q) rows = rows.filter(function(nb) {
        return (nb.name || "").toLowerCase().indexOf(q) >= 0;
      });
      return /* @__PURE__ */ React.createElement(React.Fragment, null, searchPill(), /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-results" }, rows.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "jrn-picker-empty" }, nbs.length === 0 ? "No notebooks yet \u2014 Uncategorized is always available." : "No matches.") : rows.map(function(nb) {
        var cnt = noteCount(nb.id);
        return /* @__PURE__ */ React.createElement("button", { key: nb.id, type: "button", className: "jrn-picker-item", onClick: function() {
          chooseNotebook(nb.id);
        } }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-spine" }, "NB"), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-text" }, /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-label" }, nb.name), /* @__PURE__ */ React.createElement("span", { className: "jrn-picker-cat" }, cnt + (cnt === 1 ? " note" : " notes"))));
      })));
    }
    function titleStr() {
      if (mode === "pick-bookmark") return "Pick Bookmark";
      if (mode === "pick-note") return "Pick Note";
      if (mode === "pick-journal") return "Link a Journal Entry";
      if (mode === "pick-journal-block") return "Pick from Entry";
      if (mode === "pick-notebook") return "Link a Notebook";
      return "Insert";
    }
    function body() {
      if (mode === "pick-bookmark") return renderBookmarkPicker();
      if (mode === "pick-note") return renderNotePicker();
      if (mode === "pick-journal") return renderJournalPicker();
      if (mode === "pick-journal-block") return renderJournalBlockPicker();
      if (mode === "pick-notebook") return renderNotebookPicker();
      return renderMenu();
    }
    function back() {
      setQuery("");
      if (mode === "pick-journal-block") {
        setDrilledEntry(null);
        setMode("pick-journal");
      } else setMode("menu");
    }
    return /* @__PURE__ */ React.createElement("div", { className: "note-sheet-overlay", onClick: function(e) {
      if (e.target === e.currentTarget) close();
    } }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet jrn-insert-sheet", onClick: function(e) {
      e.stopPropagation();
    }, style: { maxWidth: "480px" } }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-header" }, mode !== "menu" && /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-btn", onClick: back, "aria-label": "Back", style: { fontSize: "18px" } }, "\u2039"), /* @__PURE__ */ React.createElement("span", { className: "note-sheet-title", style: { flex: 1 } }, titleStr()), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-btn", onClick: close, "aria-label": "Close", style: { fontSize: "18px" } }, "\xD7")), body()));
  }

  // app/src/main/assets/src/ui/sheets/JournalInboundSheet.jsx
  function JournalInboundSheet({ refKey, resourceLabel, onClose, onOpenEntry }) {
    var ids = typeof JournalIndexStore !== "undefined" ? JournalIndexStore.entriesReferencing(refKey) : [];
    var entries = ids.map(function(id) {
      return JournalStore.get(id);
    }).filter(function(e) {
      return !!e;
    }).sort(function(a, b) {
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
    var headerText = entries.length === 1 ? "1 journal entry" : entries.length + " journal entries";
    return /* @__PURE__ */ React.createElement("div", { className: "note-sheet-overlay", onClick: (e) => {
      if (e.target === e.currentTarget) onClose && onClose();
    } }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet", onClick: (e) => {
      e.stopPropagation();
    }, style: { maxWidth: "480px" } }, /* @__PURE__ */ React.createElement("div", { className: "note-sheet-header" }, /* @__PURE__ */ React.createElement("span", { className: "note-sheet-title", style: { flex: 1 } }, headerText, resourceLabel ? " \xB7 " + resourceLabel : ""), /* @__PURE__ */ React.createElement("button", { className: "note-sheet-menu-btn", onClick: onClose, "aria-label": "Close", style: { fontSize: "18px" } }, "\xD7")), entries.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: "40px 20px", textAlign: "center", fontStyle: "italic", color: "var(--cream-dim)", fontFamily: "EB Garamond, serif" } }, "No journal entries reference this yet.") : /* @__PURE__ */ React.createElement("div", { className: "jrn-inbound-list" }, entries.map(function(e) {
      var title = JournalHelpers.entryDisplayTitle(e) || "Untitled";
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: e.id,
          className: "jrn-inbound-item",
          role: "button",
          onClick: () => {
            onOpenEntry && onOpenEntry(e);
          }
        },
        /* @__PURE__ */ React.createElement("div", { className: "jrn-inbound-title" }, title),
        /* @__PURE__ */ React.createElement("div", { className: "jrn-inbound-date" }, JournalHelpers.longDate(e.updated || e.created)),
        /* @__PURE__ */ React.createElement("div", { className: "jrn-inbound-preview" }, JournalHelpers.previewText(e, 100))
      );
    }))));
  }

  // app/src/main/assets/src/ui/screens/JournalHubScreen.jsx
  var JournalHubScreen_exports = {};
  __export(JournalHubScreen_exports, {
    JournalCardMenu: () => JournalCardMenu,
    JournalHubScreen: () => JournalHubScreen
  });
  function JournalCardMenu(props) {
    var useState2 = React.useState;
    var entry = props.entry;
    var _step = useState2(0);
    var step = _step[0];
    var setStep = _step[1];
    var _typed = useState2("");
    var typed = _typed[0];
    var setTyped = _typed[1];
    if (!entry) return null;
    function close() {
      props.onClose && props.onClose();
    }
    return /* @__PURE__ */ React.createElement("div", { className: "link-action-overlay", onClick: close }, /* @__PURE__ */ React.createElement("div", { className: "link-action-sheet", onClick: function(e) {
      e.stopPropagation();
    } }, /* @__PURE__ */ React.createElement("div", { className: "link-action-handle" }), step === 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      close();
      props.onOpen();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" })), /* @__PURE__ */ React.createElement("span", null, "Open Entry")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      close();
      props.onEdit();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" })), /* @__PURE__ */ React.createElement("span", null, "Edit Entry")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn", onClick: function() {
      props.onTogglePin();
      close();
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: entry.pinned ? "currentColor" : "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" }), /* @__PURE__ */ React.createElement("path", { d: "M8 12 L3 19" })), /* @__PURE__ */ React.createElement("span", null, entry.pinned ? "Unpin Entry" : "Pin Entry")), /* @__PURE__ */ React.createElement("button", { className: "link-action-btn link-action-btn-danger", onClick: function() {
      setStep(1);
      setTyped("");
    } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v6M14 11v6" })), /* @__PURE__ */ React.createElement("span", null, "Delete Entry"))), step > 0 && /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel", style: { margin: "6px 4px 4px" } }, /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-step-label" }, "Step " + step + " of 3"), /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-question" }, step === 1 ? "Delete this entry?" : step === 2 ? "Are you sure? This cannot be undone." : "Type DELETE to permanently remove this entry."), (function() {
      var summary = typeof JournalStore !== "undefined" && JournalStore.associatedDataSummary ? JournalStore.associatedDataSummary(entry.id) : null;
      return summary && /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-cascade" }, "This will also permanently delete " + summary + " you placed inside this entry.");
    })(), step === 3 && /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: "jrn-tripledel-input",
        placeholder: "Type DELETE",
        value: typed,
        autoFocus: true,
        onChange: function(e) {
          setTyped(e.target.value);
        }
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-tripledel-cancel", onClick: function() {
      setStep(0);
      setTyped("");
    } }, "Cancel"), step < 3 && /* @__PURE__ */ React.createElement("button", { className: "jrn-tripledel-next", onClick: function() {
      setStep(step + 1);
    } }, step === 1 ? "Continue" : "I am sure"), step === 3 && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "jrn-tripledel-final",
        disabled: typed.trim().toUpperCase() !== "DELETE",
        onClick: function() {
          props.onDelete();
          close();
        }
      },
      "Delete forever"
    )))));
  }
  function JournalHubScreen(props) {
    var useState2 = React.useState;
    var onBack = props.onBack;
    var onOpenEntry = props.onOpenEntry;
    var onEditEntry = props.onEditEntry;
    var onCreateEntry = props.onCreateEntry;
    var setHlTick = props.setHlTick;
    React.useSyncExternalStore(
      React.useCallback(function(cb) {
        return JournalStore.subscribe(cb);
      }, []),
      function() {
        return JournalStore.getVersion();
      }
    );
    var _tab = useState2("all");
    var tab = _tab[0];
    var setTab = _tab[1];
    var _q = useState2("");
    var query = _q[0];
    var setQuery = _q[1];
    var _sortNewest = useState2(true);
    var sortNewest = _sortNewest[0];
    var setSortNewest = _sortNewest[1];
    var _menuEntry = useState2(null);
    var menuEntry = _menuEntry[0];
    var setMenuEntry = _menuEntry[1];
    var allEntries = JournalStore.all();
    function bump() {
      if (setHlTick) setHlTick(function(t) {
        return t + 1;
      });
    }
    function deleteEntry(id) {
      JournalStore.remove(id);
      bump();
    }
    function togglePin(id) {
      JournalStore.togglePin(id);
      bump();
    }
    function renderCard(entry) {
      var title = JournalHelpers.entryDisplayTitle(entry);
      var preview = JournalHelpers.previewText(entry, 160);
      var attachments = JournalHelpers.attachmentSummary(entry);
      var moodClass = entry.mood ? entry.mood : "";
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: entry.id,
          className: "jrn-card" + (entry.pinned ? " pinned" : ""),
          role: "button",
          tabIndex: 0,
          onClick: function(e) {
            if (e.target.closest && e.target.closest(".jrn-card-menu-btn")) return;
            onOpenEntry && onOpenEntry(entry.id);
          },
          onKeyDown: function(e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenEntry(entry.id);
            }
          }
        },
        /* @__PURE__ */ React.createElement("span", { className: "jrn-card-mood " + moodClass }),
        entry.pinned && /* @__PURE__ */ React.createElement("div", { className: "jrn-card-pin-marker", title: "Pinned" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" }), /* @__PURE__ */ React.createElement("path", { d: "M8 12 L3 19" }))),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "jrn-card-menu-btn",
            onClick: function(e) {
              e.stopPropagation();
              setMenuEntry(entry);
            },
            "aria-label": "Entry options",
            title: "Options"
          },
          /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "5", r: "1.6" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1.6" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "19", r: "1.6" }))
        ),
        /* @__PURE__ */ React.createElement("div", { className: "jrn-card-row" }, /* @__PURE__ */ React.createElement("h3", { className: "jrn-card-title" + (title ? "" : " untitled") }, title || "Untitled"), /* @__PURE__ */ React.createElement("span", { className: "jrn-card-date" }, JournalHelpers.shortDate(entry.updated || entry.created), /* @__PURE__ */ React.createElement("span", { className: "jrn-card-time" }, " \xB7 " + JournalHelpers.shortTime(entry.updated || entry.created)))),
        preview && /* @__PURE__ */ React.createElement("p", { className: "jrn-card-preview" }, preview),
        attachments.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "jrn-card-attachments" }, attachments.map(function(a, i) {
          return /* @__PURE__ */ React.createElement("span", { key: i, className: "jrn-attach" }, a.label);
        })),
        entry.tags && entry.tags.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "jrn-card-meta" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-tags" }, entry.tags.slice(0, 4).map(function(t, i) {
          return /* @__PURE__ */ React.createElement("span", { key: i, className: "jrn-tag" }, "#" + t);
        })))
      );
    }
    function renderEntries(list, isPinnedTab) {
      var q = query.trim().toLowerCase();
      var filtered = q ? list.filter(function(e) {
        if ((e.title || "").toLowerCase().indexOf(q) >= 0) return true;
        var preview = JournalHelpers.previewText(e, 400).toLowerCase();
        if (preview.indexOf(q) >= 0) return true;
        if (e.tags && e.tags.join(" ").toLowerCase().indexOf(q) >= 0) return true;
        return false;
      }) : list;
      filtered = filtered.slice().sort(function(a, b) {
        var ad = a.updated || a.created || 0;
        var bd = b.updated || b.created || 0;
        if (ad !== bd) return sortNewest ? bd - ad : ad - bd;
        if (a.id === b.id) return 0;
        var cmp = a.id < b.id ? -1 : 1;
        return sortNewest ? cmp : -cmp;
      });
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "jrn-controls" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "jrn-search",
          type: "text",
          placeholder: "Search entries\u2026",
          value: query,
          onChange: function(e) {
            setQuery(e.target.value);
          }
        }
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "notes-index-sort-btn",
          onClick: function() {
            setSortNewest(function(v) {
              return !v;
            });
          },
          title: "Toggle sort order"
        },
        sortNewest ? "Sort: Newest \u2193" : "Sort: Oldest \u2191"
      )), filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "jrn-empty" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-empty-title" }, isPinnedTab ? list.length === 0 ? "No Pinned Entries" : "No Matches" : list.length === 0 ? "No Entries Yet" : "No Matches"), /* @__PURE__ */ React.createElement("div", { className: "jrn-empty-hint" }, isPinnedTab && list.length === 0 ? "Pin your favorite or most-used journal entries here to access them easily." : list.length === 0 ? 'Tap "New Entry" below to write your first reflection. You can embed letters, bookmarks, images, and voice recordings.' : "Try a different search term.")) : /* @__PURE__ */ React.createElement("div", { className: "jrn-list" }, filtered.map(renderCard)));
    }
    var navChildren = LibraryNav({
      onBack,
      onSearch: props.onSearch,
      onHistory: props.onHistory,
      onSettings: props.onSettings,
      theme: props.theme,
      onThemeChange: props.onThemeChange
    });
    var pinnedEntries = allEntries.filter(function(e) {
      return e.pinned;
    });
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren }, /* @__PURE__ */ React.createElement("div", { className: "jrn-hub" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-hub-header" }, /* @__PURE__ */ React.createElement("h1", { className: "jrn-hub-title" }, "My Journal"), /* @__PURE__ */ React.createElement("span", { className: "jrn-hub-count" }, allEntries.length + (allEntries.length === 1 ? " entry" : " entries"))), /* @__PURE__ */ React.createElement("div", { className: "jrn-tabs" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-tab" + (tab === "all" ? " active" : ""), onClick: function() {
      setTab("all");
    } }, "All Entries"), /* @__PURE__ */ React.createElement("button", { className: "jrn-tab" + (tab === "pinned" ? " active" : ""), onClick: function() {
      setTab("pinned");
    } }, "Pinned")), tab === "all" && renderEntries(allEntries, false), tab === "pinned" && renderEntries(pinnedEntries, true), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "jrn-fab jrn-fab-newentry",
        onClick: function() {
          onCreateEntry && onCreateEntry();
        },
        title: "New Entry",
        "aria-label": "New Entry"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" })),
      /* @__PURE__ */ React.createElement("span", { className: "jrn-fab-newentry-label" }, "New Entry")
    ), menuEntry && /* @__PURE__ */ React.createElement(
      JournalCardMenu,
      {
        entry: menuEntry,
        onClose: function() {
          setMenuEntry(null);
        },
        onOpen: function() {
          onOpenEntry && onOpenEntry(menuEntry.id);
        },
        onEdit: function() {
          onEditEntry ? onEditEntry(menuEntry.id) : onOpenEntry && onOpenEntry(menuEntry.id);
        },
        onTogglePin: function() {
          togglePin(menuEntry.id);
        },
        onDelete: function() {
          deleteEntry(menuEntry.id);
        }
      }
    )));
  }

  // app/src/main/assets/src/ui/screens/JournalViewerScreen.jsx
  var JournalViewerScreen_exports = {};
  __export(JournalViewerScreen_exports, {
    JournalAudioBlock: () => JournalAudioBlock2,
    JournalBlockView: () => JournalBlockView2,
    JournalImageBlock: () => JournalImageBlock2,
    JournalViewerScreen: () => JournalViewerScreen,
    jrnPinIcon: () => jrnPinIcon,
    jrnRenderInline: () => jrnRenderInline
  });
  function jrnRenderInline(text, callbacks) {
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
        nodes.push(/* @__PURE__ */ React.createElement("strong", { key: "i" + keyCounter++ }, m[1]));
      } else if (m[2] != null) {
        nodes.push(/* @__PURE__ */ React.createElement("em", { key: "i" + keyCounter++ }, m[2]));
      } else if (m[3] != null) {
        var ref = m[3].trim();
        nodes.push(
          /* @__PURE__ */ React.createElement(
            "span",
            {
              key: "i" + keyCounter++,
              className: "jrn-inline-ref",
              onClick: /* @__PURE__ */ (function(rr) {
                return function() {
                  callbacks.onScriptureRef && callbacks.onScriptureRef(rr);
                };
              })(ref)
            },
            ref
          )
        );
      } else if (m[4] != null) {
        var kind = m[4];
        var data = m[5].trim();
        var label = data;
        if (kind === "letter") {
          var parts = data.split("/");
          var ctx = typeof findEntryContext === "function" ? findEntryContext(parts[1], "letter") : null;
          if (ctx && ctx.title) label = ctx.title;
        } else if (kind === "bookmark") {
          var b = typeof BookmarkStore !== "undefined" ? BookmarkStore.get(data) : null;
          if (b) label = b.label || "Bookmark";
        } else if (kind === "journal") {
          var je = typeof JournalStore !== "undefined" ? JournalStore.get(data) : null;
          if (je) label = JournalHelpers.entryDisplayTitle(je) || "Journal Entry";
        }
        nodes.push(
          /* @__PURE__ */ React.createElement(
            "span",
            {
              key: "i" + keyCounter++,
              className: "jrn-inline-" + kind,
              onClick: /* @__PURE__ */ (function(k, d) {
                return function() {
                  callbacks.onInlineLink && callbacks.onInlineLink(k, d);
                };
              })(kind, data)
            },
            label
          )
        );
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push(text.substring(last));
    return nodes;
  }
  function JournalBlockView2({ block, callbacks, entryId, blockIndex }) {
    if (!block) return null;
    callbacks = callbacks || {};
    var b = block;
    var hlKey = entryId != null && blockIndex != null ? "journal:" + entryId + ":" + blockIndex : null;
    var hlProps = hlKey ? { "data-hl-key": hlKey, "data-hl-dom": true } : {};
    if (b.type === "p") {
      return /* @__PURE__ */ React.createElement("p", { className: "jrn-p", ...hlProps }, jrnRenderInline(b.text || "", callbacks));
    }
    if (b.type === "h2") {
      return /* @__PURE__ */ React.createElement("h2", { className: "jrn-h2", ...hlProps }, jrnRenderInline(b.text || "", callbacks));
    }
    if (b.type === "quote") {
      var qText = b.text || "";
      var qLong = qText.length > 240;
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-block-quote" }, qLong ? /* @__PURE__ */ React.createElement(JrnExpandable, { text: qText, threshold: 240, className: "jrn-block-quote-body" }) : /* @__PURE__ */ React.createElement("div", { className: "jrn-block-quote-body", ...hlProps }, jrnRenderInline(qText, callbacks)), b.cite && /* @__PURE__ */ React.createElement("div", { className: "jrn-block-quote-cite" }, b.cite));
    }
    if (b.type === "divider") {
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-divider" }, "\u2756  \u2756  \u2756");
    }
    if (b.type === "letter-card") {
      var lc = JournalHelpers.resolveLetterCard(b.volKey, b.letterId, b.excerpt);
      if (!lc) return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-letter", onClick: function() {
        callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId);
      } }, /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, "Letter"), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, b.letterId));
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-letter" + (lc.isExcerpt ? " is-excerpt" : ""), onClick: function() {
        callbacks.onLetterCard && callbacks.onLetterCard(b.volKey, b.letterId);
      }, role: "button" }, lc.date && /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-date" }, lc.date), /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, lc.isExcerpt ? lc.eyebrow + " \xB7 Excerpt" : lc.eyebrow), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, lc.title), lc.body && /* @__PURE__ */ React.createElement(JrnExpandable, { text: lc.body, threshold: lc.isExcerpt ? 240 : 180, className: "jrn-emb-body" + (lc.isExcerpt ? " jrn-emb-excerpt" : "") }));
    }
    if (b.type === "chapter-card") {
      var cc = JournalHelpers.resolveChapterCard(b.bookId, b.chapter);
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-chapter", onClick: function() {
        callbacks.onChapterCard && callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy);
      }, role: "button" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, cc ? cc.eyebrow : "Bible"), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, cc ? cc.title : b.bookId + " " + b.chapter));
    }
    if (b.type === "verse-block") {
      var vb = JournalHelpers.resolveVerseBlock(b.ref, b.text);
      var isExcerpt = !!b.partial || !!vb.isExcerpt;
      var verseText = vb.text || "";
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "jrn-embed-verse" + (isExcerpt ? " is-excerpt" : ""),
          onClick: function() {
            if (!callbacks.onChapterCard || b.bookId == null || b.chapter == null) return;
            callbacks.onChapterCard(b.bookId, b.chapter, b.isStudy, b.verse, b.verseEnd);
          },
          role: callbacks.onChapterCard && b.bookId != null ? "button" : null,
          style: callbacks.onChapterCard && b.bookId != null ? { cursor: "pointer" } : null
        },
        /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-cite" }, isExcerpt ? vb.cite + " \xB7 Excerpt" : vb.cite),
        verseText ? /* @__PURE__ */ React.createElement(JrnExpandable, { text: verseText, threshold: 240, className: "jrn-emb-text" + (isExcerpt ? " jrn-emb-excerpt" : "") }) : /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-text" }, /* @__PURE__ */ React.createElement("em", { style: { color: "var(--gold-dim)" } }, "Verse text not available offline."))
      );
    }
    if (b.type === "bookmark-card") {
      var bc = JournalHelpers.resolveBookmarkCard(b.bookmarkId);
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-bookmark", onClick: function() {
        callbacks.onBookmarkCard && callbacks.onBookmarkCard(b.bookmarkId);
      }, role: "button" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, bc ? bc.eyebrow : "Bookmark"), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, bc ? bc.title : "Bookmark"), bc && bc.body && /* @__PURE__ */ React.createElement(JrnExpandable, { text: bc.body, threshold: 200, className: "jrn-emb-body" }));
    }
    if (b.type === "note-card") {
      var nc = JournalHelpers.resolveNoteCard(b.noteGroupId);
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-note", onClick: function() {
        callbacks.onNoteCard && callbacks.onNoteCard(b.noteGroupId);
      }, role: "button" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, nc ? nc.eyebrow : "Note"), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, nc ? nc.title : "Note"), nc && nc.body && /* @__PURE__ */ React.createElement(JrnExpandable, { text: nc.body, threshold: 200, className: "jrn-emb-body", tapToToggle: true }));
    }
    if (b.type === "journal-card") {
      var je = typeof JournalStore !== "undefined" ? JournalStore.get(b.entryId) : null;
      var jcPreview = je ? JournalHelpers.previewText(je, 320) : "";
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-journal", onClick: function() {
        callbacks.onJournalCard && callbacks.onJournalCard(b.entryId);
      }, role: "button" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, "Linked Entry"), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, je ? JournalHelpers.entryDisplayTitle(je) || "Untitled" : "(Deleted)"), jcPreview && /* @__PURE__ */ React.createElement(JrnExpandable, { text: jcPreview, threshold: 180, className: "jrn-emb-body" }));
    }
    if (b.type === "notebook-card") {
      var nbc = JournalHelpers.resolveNotebookCard(b.notebookId);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "jrn-embed-notebook",
          role: "button",
          onClick: function() {
            callbacks.onNotebookCard && callbacks.onNotebookCard(b.notebookId);
          }
        },
        /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-notebook-icon" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 4 15 9 20 9" }), /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "14", x2: "15", y2: "14" }))),
        /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-notebook-text" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow" }, nbc ? nbc.eyebrow : "Notebook"), /* @__PURE__ */ React.createElement("h4", { className: "jrn-emb-title" }, nbc ? nbc.title : "Notebook")),
        /* @__PURE__ */ React.createElement("span", { className: "jrn-emb-notebook-arrow" }, "\u203A")
      );
    }
    if (b.type === "journal-excerpt") {
      var srcTitle = b.sourceJournalTitle || "";
      if (!srcTitle && b.sourceJournalId && typeof JournalStore !== "undefined") {
        var src = JournalStore.get(b.sourceJournalId);
        if (src) srcTitle = JournalHelpers.entryDisplayTitle(src) || "Untitled";
      }
      var openSource = function(e) {
        if (e) e.stopPropagation();
        if (b.sourceJournalId && callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId);
      };
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-journal-excerpt" + (b.originType === "h2" ? " is-heading" : "") }, srcTitle && /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-eyebrow jrn-excerpt-source", onClick: openSource, role: "button" }, "From: " + srcTitle), /* @__PURE__ */ React.createElement(
        JrnExpandable,
        {
          text: b.text || "",
          threshold: 240,
          className: "jrn-emb-excerpt-body" + (b.originType === "quote" ? " is-quote" : "")
        }
      ), b.cite && /* @__PURE__ */ React.createElement("div", { className: "jrn-emb-cite" }, b.cite));
    }
    if (b.type === "image") {
      var srcImg = b.sourceJournalTitle || "";
      if (!srcImg && b.sourceJournalId && typeof JournalStore !== "undefined") {
        var srcEnt = JournalStore.get(b.sourceJournalId);
        if (srcEnt) srcImg = JournalHelpers.entryDisplayTitle(srcEnt) || "Untitled";
      }
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-linked-wrap" + (b.sourceJournalId ? " is-linked" : "") }, b.sourceJournalId && srcImg && /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "jrn-emb-eyebrow jrn-excerpt-source",
          onClick: function() {
            if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId);
          },
          role: "button"
        },
        "From: " + srcImg
      ), /* @__PURE__ */ React.createElement(JournalImageBlock2, { mediaId: b.mediaId, caption: b.caption }));
    }
    if (b.type === "audio") {
      var srcAud = b.sourceJournalTitle || "";
      if (!srcAud && b.sourceJournalId && typeof JournalStore !== "undefined") {
        var srcEnt2 = JournalStore.get(b.sourceJournalId);
        if (srcEnt2) srcAud = JournalHelpers.entryDisplayTitle(srcEnt2) || "Untitled";
      }
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-linked-wrap" + (b.sourceJournalId ? " is-linked" : "") }, b.sourceJournalId && srcAud && /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "jrn-emb-eyebrow jrn-excerpt-source",
          onClick: function() {
            if (callbacks.onJournalCard) callbacks.onJournalCard(b.sourceJournalId);
          },
          role: "button"
        },
        "From: " + srcAud
      ), /* @__PURE__ */ React.createElement(JournalAudioBlock2, { mediaId: b.mediaId, duration: b.duration, caption: b.caption, samples: b.samples }));
    }
    return null;
  }
  function JournalImageBlock2({ mediaId, caption }) {
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var _src = useState2(null);
    var src = _src[0];
    var setSrc = _src[1];
    useEffect2(function() {
      var cancelled = false;
      if (mediaId && typeof JournalMediaStore !== "undefined") {
        JournalMediaStore.objectUrl(mediaId).then(function(url) {
          if (!cancelled) setSrc(url || null);
        });
      }
      return function() {
        cancelled = true;
      };
    }, [mediaId]);
    return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-image" }, src ? /* @__PURE__ */ React.createElement("img", { src, alt: caption || "" }) : /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "180px", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gold-dim)", fontStyle: "italic", fontFamily: "EB Garamond, serif" } }, "Image unavailable"), caption && /* @__PURE__ */ React.createElement("div", { className: "jrn-img-caption", style: { padding: "8px 14px" } }, caption));
  }
  function JournalAudioBlock2(props) {
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var useRef = React.useRef;
    var mediaId = props.mediaId;
    var duration = props.duration;
    var caption = props.caption;
    var samples = props.samples;
    var editable = !!props.editable;
    var confirming = !!props.confirming;
    var _src = useState2(null);
    var src = _src[0];
    var setSrc = _src[1];
    var audioRef = useRef(null);
    var _playing = useState2(false);
    var playing = _playing[0];
    var setPlaying = _playing[1];
    var _progress = useState2(0);
    var progress = _progress[0];
    var setProgress = _progress[1];
    var _curTime = useState2(0);
    var curTime = _curTime[0];
    var setCurTime = _curTime[1];
    useEffect2(function() {
      var cancelled = false;
      if (mediaId && typeof JournalMediaStore !== "undefined") {
        JournalMediaStore.objectUrl(mediaId).then(function(url) {
          if (!cancelled) setSrc(url || null);
        });
      }
      return function() {
        cancelled = true;
      };
    }, [mediaId]);
    function toggle(e) {
      if (e) {
        e.stopPropagation();
      }
      if (!audioRef.current) return;
      if (playing) audioRef.current.pause();
      else audioRef.current.play();
    }
    function onTimeUpdate() {
      var a = audioRef.current;
      if (!a) return;
      var dur2 = duration || a.duration || 0;
      setCurTime(a.currentTime || 0);
      setProgress(dur2 > 0 ? Math.min(1, (a.currentTime || 0) / dur2) : 0);
    }
    function seekFromEvent(e) {
      if (!audioRef.current) return;
      var rect = e.currentTarget.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var ratio = Math.max(0, Math.min(1, x / rect.width));
      var dur2 = duration || audioRef.current.duration || 0;
      if (dur2 > 0) {
        audioRef.current.currentTime = ratio * dur2;
        setProgress(ratio);
        setCurTime(ratio * dur2);
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
        /* @__PURE__ */ React.createElement(
          "div",
          {
            key: i,
            className: "bar" + (progress > 0 && i / barCount <= progress ? " is-played" : ""),
            style: { height: h + "px" }
          }
        )
      );
    }
    var deleteUI = editable && !confirming ? /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "jrn-aud-delete",
        title: "Delete",
        "aria-label": "Delete",
        onClick: function(e) {
          e.stopPropagation();
          props.onRequestDelete && props.onRequestDelete();
        }
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v6M14 11v6" }))
    ) : null;
    var dur = duration || 0;
    var timeStr = JournalHelpers.formatDuration(curTime || 0) + " / " + JournalHelpers.formatDuration(dur);
    return /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-audio" + (editable ? " is-editable" : "") }, editable && confirming ? /* @__PURE__ */ React.createElement(
      ConfirmStrip,
      {
        className: "jrn-aud-confirm",
        question: "Remove this voice memo?",
        yesLabel: "Yes, remove",
        onCancel: props.onCancelDelete,
        onConfirm: props.onConfirmDelete
      }
    ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "jrn-aud-play", onClick: toggle, "aria-label": playing ? "Pause" : "Play" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" }, playing ? /* @__PURE__ */ React.createElement("path", { d: "M6 4h4v16H6zM14 4h4v16h-4z" }) : /* @__PURE__ */ React.createElement("path", { d: "M6 3v18l16-9z" }))), /* @__PURE__ */ React.createElement("div", { className: "jrn-aud-body" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "jrn-aud-waveform",
        onClick: seekFromEvent,
        role: "slider",
        "aria-label": "Seek",
        style: { cursor: "pointer" }
      },
      bars
    ), /* @__PURE__ */ React.createElement("div", { className: "jrn-aud-meta" }, /* @__PURE__ */ React.createElement("span", null, caption || "Voice memo"), /* @__PURE__ */ React.createElement("span", null, timeStr))), deleteUI), src && /* @__PURE__ */ React.createElement(
      "audio",
      {
        ref: audioRef,
        src,
        style: { display: "none" },
        onPlay: function() {
          setPlaying(true);
        },
        onPause: function() {
          setPlaying(false);
        },
        onEnded: function() {
          setPlaying(false);
          setProgress(0);
          setCurTime(0);
        },
        onTimeUpdate
      }
    ));
  }
  function jrnPinIcon(filled) {
    return /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" }), /* @__PURE__ */ React.createElement("path", { d: "M8 12 L3 19", stroke: "currentColor", fill: "none" }));
  }
  function JournalViewerScreen(props) {
    var useState2 = React.useState;
    var entryId = props.entryId;
    var onBack = props.onBack;
    var onEdit = props.onEdit;
    var onNavigateToLink = props.onNavigateToLink;
    var onOpenJournalEntry = props.onOpenJournalEntry;
    var onOpenNotebook = props.onOpenNotebook;
    var setHlTick = props.setHlTick;
    React.useSyncExternalStore(
      React.useCallback(function(cb) {
        return JournalStore.subscribe(cb);
      }, []),
      function() {
        return JournalStore.getVersion();
      }
    );
    var entry = entryId ? JournalStore.get(entryId) : null;
    var _confirmStep = useState2(0);
    var confirmStep = _confirmStep[0];
    var setConfirmStep = _confirmStep[1];
    var _typedDelete = useState2("");
    var typedDelete = _typedDelete[0];
    var setTypedDelete = _typedDelete[1];
    function bump() {
      if (setHlTick) setHlTick(function(t) {
        return t + 1;
      });
    }
    function startDelete() {
      setConfirmStep(1);
      setTypedDelete("");
    }
    function nextDeleteStep() {
      if (confirmStep < 3) setConfirmStep(confirmStep + 1);
    }
    function cancelDelete() {
      setConfirmStep(0);
      setTypedDelete("");
    }
    if (typeof window !== "undefined" && !window.__journalBackStack) window.__journalBackStack = [];
    var _jstack = typeof window !== "undefined" && window.__journalBackStack || [];
    var jrnBack = _jstack.length && entry && _jstack[_jstack.length - 1].destId === entry.id ? _jstack[_jstack.length - 1] : null;
    function jrnGoBack() {
      if (jrnBack && _jstack.length) {
        _jstack.pop();
        if (onOpenJournalEntry) {
          onOpenJournalEntry(jrnBack.fromId);
          return;
        }
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
        rightExtras: extras && extras.right || null
      });
    }
    if (!entry) {
      return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: buildNavChildren() }, /* @__PURE__ */ React.createElement("div", { className: "jrn-empty" }, /* @__PURE__ */ React.createElement("div", { className: "jrn-empty-title" }, "Entry Not Found"), /* @__PURE__ */ React.createElement("div", { className: "jrn-empty-hint" }, "This journal entry may have been deleted.")));
    }
    var sourceMeta = { sourceLetterTitle: "My Journal \xB7 " + (JournalHelpers.entryDisplayTitle(entry) || "Entry") };
    var callbacks = {
      onLetterCard: function(volKey, letterId) {
        var ep = JournalHelpers.refKeyToEndpoint("letter:" + volKey + "/" + letterId);
        if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
      },
      onChapterCard: function(bookId, chapter, isStudy, verse, verseEnd) {
        var endpoint = { type: isStudy ? "study" : "bible", bookId, chapter };
        if (verse != null) endpoint.verse = verse;
        if (verseEnd != null) endpoint.verseEnd = verseEnd;
        onNavigateToLink && onNavigateToLink(endpoint, sourceMeta);
      },
      onBookmarkCard: function(bid) {
        var ep = JournalHelpers.refKeyToEndpoint("bookmark:" + bid);
        if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
      },
      onNoteCard: function(gid) {
        var ep = JournalHelpers.refKeyToEndpoint("note:" + gid);
        if (ep && onNavigateToLink) onNavigateToLink(ep, sourceMeta);
      },
      onJournalCard: function(eid) {
        if (eid && entry && eid !== entry.id && typeof window !== "undefined") {
          if (!window.__journalBackStack) window.__journalBackStack = [];
          if (window.__journalBackStack.length > 20) window.__journalBackStack.shift();
          window.__journalBackStack.push({
            destId: eid,
            fromId: entry.id,
            fromTitle: JournalHelpers.entryDisplayTitle(entry) || "Untitled"
          });
        }
        onOpenJournalEntry && onOpenJournalEntry(eid);
      },
      onNotebookCard: function(nbId) {
        if (onOpenNotebook) onOpenNotebook(nbId);
      },
      onScriptureRef: function(ref) {
        if (typeof window.__openScriptureSheet === "function") {
          window.__openScriptureSheet(ref);
        }
      },
      onInlineLink: function(kind, data) {
        if (kind === "letter") {
          var parts = data.split("/");
          callbacks.onLetterCard(parts[0], parts[1]);
        } else if (kind === "bookmark") {
          callbacks.onBookmarkCard(data);
        } else if (kind === "journal") {
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
    var navExtras = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nav-search-btn jrn-pin-btn" + (entry.pinned ? " is-pinned" : ""),
        onClick: togglePin,
        title: entry.pinned ? "Unpin entry" : "Pin entry",
        "aria-label": entry.pinned ? "Unpin entry" : "Pin entry",
        "aria-pressed": !!entry.pinned
      },
      jrnPinIcon(!!entry.pinned)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nav-search-btn jrn-del-btn",
        onClick: startDelete,
        title: "Delete entry",
        "aria-label": "Delete entry"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v6M14 11v6" }))
    ));
    function renderDeleteBanner() {
      if (confirmStep === 0) return null;
      var stepLabel = confirmStep === 1 ? "Step 1 of 3" : confirmStep === 2 ? "Step 2 of 3" : "Step 3 of 3";
      var question = confirmStep === 1 ? "Delete this entry?" : confirmStep === 2 ? "Are you sure? This cannot be undone." : "Type DELETE to permanently remove this entry.";
      return /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel jrn-tripledel-step" + confirmStep }, /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-step-label" }, stepLabel), /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-question" }, question), (function() {
        var summary = typeof JournalStore !== "undefined" && JournalStore.associatedDataSummary ? JournalStore.associatedDataSummary(entryId) : null;
        return summary && /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-cascade" }, "This will also permanently delete " + summary + " you placed inside this entry.");
      })(), confirmStep === 3 && /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "jrn-tripledel-input",
          placeholder: "Type DELETE",
          value: typedDelete,
          autoFocus: true,
          onChange: function(e) {
            setTypedDelete(e.target.value);
          }
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "jrn-tripledel-actions" }, /* @__PURE__ */ React.createElement("button", { className: "jrn-tripledel-cancel", onClick: cancelDelete }, "Cancel"), confirmStep < 3 && /* @__PURE__ */ React.createElement("button", { className: "jrn-tripledel-next", onClick: nextDeleteStep }, confirmStep === 1 ? "Continue" : "I am sure"), confirmStep === 3 && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "jrn-tripledel-final",
          onClick: doDelete,
          disabled: typedDelete.trim().toUpperCase() !== "DELETE"
        },
        "Delete forever"
      )));
    }
    var displayTitle = JournalHelpers.entryDisplayTitle(entry);
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren: buildNavChildren({ right: navExtras }) }, /* @__PURE__ */ React.createElement("div", { className: "jrn-viewer" }, jrnBack && /* @__PURE__ */ React.createElement("div", { className: "back-hint-row" }, /* @__PURE__ */ React.createElement("button", { className: "back-hint-pill", onClick: jrnGoBack, "aria-label": "Back to " + jrnBack.fromTitle }, /* @__PURE__ */ React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to", " ", /* @__PURE__ */ React.createElement("span", { className: "back-hint-title" }, jrnBack.fromTitle))), /* @__PURE__ */ React.createElement("div", { className: "jrn-viewer-meta" }, /* @__PURE__ */ React.createElement("h1", { className: "jrn-viewer-title" + (displayTitle ? "" : " untitled") }, displayTitle || "Untitled"), /* @__PURE__ */ React.createElement("div", { className: "jrn-viewer-date" }, JournalHelpers.longDate(entry.created), /* @__PURE__ */ React.createElement("span", { className: "jrn-card-time" }, " \xB7 " + JournalHelpers.shortTime(entry.created)), entry.pinned && " \xB7 Pinned")), renderDeleteBanner(), /* @__PURE__ */ React.createElement("div", { className: "jrn-viewer-blocks" }, (entry.blocks || []).map(function(b, i) {
      return /* @__PURE__ */ React.createElement(
        JournalBlockView2,
        {
          key: b.id,
          block: b,
          callbacks,
          entryId: entry.id,
          blockIndex: i
        }
      );
    }))), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "jrn-fab jrn-fab-action is-edit",
        onClick: onEdit,
        title: "Edit entry",
        "aria-label": "Edit entry"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" }))
    ));
  }

  // app/src/main/assets/src/ui/screens/JournalEditorScreen.jsx
  var JournalEditorScreen_exports = {};
  __export(JournalEditorScreen_exports, {
    JournalEditorScreen: () => JournalEditorScreen
  });
  function JournalEditorScreen(props) {
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var useRef = React.useRef;
    var useMemo = React.useMemo;
    var entryId = props.entryId;
    var onBack = props.onBack;
    var setHlTick = props.setHlTick;
    var initial = useMemo(function() {
      return entryId ? JournalStore.get(entryId) : null;
    }, [entryId]);
    var _title = useState2(initial && initial.title || "");
    var title = _title[0];
    var setTitle = _title[1];
    var _blocks = useState2(initial && initial.blocks || JournalHelpers.defaultBlocks());
    var blocks = _blocks[0];
    var setBlocks = _blocks[1];
    var _mood = useState2(initial && initial.mood || null);
    var mood = _mood[0];
    var _setMood = _mood[1];
    var _saved = useState2("Saved");
    var savedLabel = _saved[0];
    var setSavedLabel = _saved[1];
    var _showInsert = useState2(false);
    var showInsert = _showInsert[0];
    var setShowInsert = _showInsert[1];
    var _showRec = useState2(false);
    var showRec = _showRec[0];
    var setShowRec = _showRec[1];
    useModalRegistry({
      id: "journal-insert-sheet",
      dismiss: function() {
        setShowInsert(false);
      },
      active: showInsert
    });
    useModalRegistry({
      id: "journal-recording-sheet",
      dismiss: function() {
        setShowRec(false);
      },
      active: showRec
    });
    var _confirmAudioDelete = useState2(null);
    var confirmAudioDelete = _confirmAudioDelete[0];
    var setConfirmAudioDelete = _confirmAudioDelete[1];
    var _confirmDel = useState2(null);
    var confirmDelIdx = _confirmDel[0];
    var setConfirmDelIdx = _confirmDel[1];
    useEffect2(function() {
      if (confirmDelIdx === null) return;
      function onDocDown(e) {
        var t = e.target;
        if (t && t.closest && t.closest(".jrn-block-confirm")) return;
        setConfirmDelIdx(null);
      }
      document.addEventListener("pointerdown", onDocDown, true);
      return function() {
        document.removeEventListener("pointerdown", onDocDown, true);
      };
    }, [confirmDelIdx]);
    var fileInputRef = useRef(null);
    var activeTextareaRef = useRef(null);
    var blocksContainerRef = useRef(null);
    var pendingFocusIdRef = useRef(null);
    var firstRunRef = useRef(true);
    var titleRef = useRef(title);
    titleRef.current = title;
    var blocksRef = useRef(blocks);
    blocksRef.current = blocks;
    var moodRef = useRef(mood);
    moodRef.current = mood;
    var entryIdRef = useRef(entryId);
    entryIdRef.current = entryId;
    useEffect2(function() {
      if (!entryId) return;
      if (firstRunRef.current) {
        firstRunRef.current = false;
        return;
      }
      setSavedLabel("Saving\u2026");
      var t = setTimeout(function() {
        JournalStore.update(entryId, { title, blocks, mood });
        setSavedLabel("Saved");
        if (setHlTick) setHlTick(function(tx) {
          return tx + 1;
        });
      }, 1200);
      return function() {
        clearTimeout(t);
      };
    }, [entryId, title, blocks, mood]);
    useEffect2(function() {
      return function() {
        var eid = entryIdRef.current;
        if (eid) {
          JournalStore.update(eid, { title: titleRef.current, blocks: blocksRef.current, mood: moodRef.current });
        }
      };
    }, []);
    function commitSave() {
      if (!entryId) return;
      JournalStore.update(entryId, { title: titleRef.current, blocks: blocksRef.current, mood: moodRef.current });
      setSavedLabel("Saved");
      if (setHlTick) setHlTick(function(t) {
        return t + 1;
      });
    }
    function scheduleSave() {
      setSavedLabel("Saving\u2026");
    }
    function patchBlock(idx, patch) {
      setBlocks(function(arr) {
        var next = arr.slice();
        next[idx] = Object.assign({}, next[idx], patch);
        return next;
      });
      scheduleSave();
    }
    function deleteBlock(idx) {
      setBlocks(function(arr) {
        var next = arr.slice();
        var removed = next.splice(idx, 1)[0];
        if (removed && (removed.type === "image" || removed.type === "audio") && removed.mediaId) {
          var isLinkedEmbed = !!removed.sourceJournalId;
          var reusedHere = next.some(function(bb) {
            return (bb.type === "image" || bb.type === "audio") && bb.mediaId === removed.mediaId;
          });
          var referencedElsewhere = false;
          try {
            referencedElsewhere = typeof JournalStore !== "undefined" && JournalStore.isMediaReferencedElsewhere ? JournalStore.isMediaReferencedElsewhere(removed.mediaId, entryIdRef.current) : false;
          } catch (_e) {
          }
          if (!isLinkedEmbed && !reusedHere && !referencedElsewhere) {
            try {
              JournalMediaStore.delete(removed.mediaId);
            } catch (_e) {
            }
          }
        }
        return next.length === 0 ? JournalHelpers.defaultBlocks() : next;
      });
      setConfirmDelIdx(null);
      setConfirmAudioDelete(null);
      scheduleSave();
    }
    function insertBlockAt(idx, block) {
      setBlocks(function(arr) {
        var next = arr.slice();
        next.splice(idx + 1, 0, block);
        return next;
      });
      scheduleSave();
    }
    function insertAtCursor(block) {
      var info = activeTextareaRef.current;
      var idx = info && info.idx != null ? info.idx : -1;
      var cur = idx >= 0 ? blocks[idx] : null;
      var supportsSplit = cur && (cur.type === "p" || cur.type === "h2" || cur.type === "quote");
      if (!supportsSplit) {
        var tailIdNoSplit = JournalHelpers.blockId();
        setBlocks(function(arr) {
          var next = arr.slice();
          var last = next[next.length - 1];
          if (last && last.type === "p" && !(last.text || "").trim()) {
            next.splice(next.length - 1, 0, block);
          } else {
            next.push(block);
            next.push({ id: tailIdNoSplit, type: "p", text: "" });
          }
          return next;
        });
        pendingFocusIdRef.current = tailIdNoSplit;
        scheduleSave();
        return;
      }
      var caret = info.caret != null ? info.caret : info.el ? info.el.selectionStart : (cur.text || "").length;
      var text = cur.text || "";
      var head = text.slice(0, caret);
      var tail = text.slice(caret);
      var tailId = JournalHelpers.blockId();
      var tailBlock = { id: tailId, type: cur.type === "h2" ? "p" : cur.type, text: tail };
      if (cur.type === "quote") tailBlock.cite = "";
      setBlocks(function(arr) {
        var next = arr.slice();
        next[idx] = Object.assign({}, next[idx], { text: head });
        next.splice(idx + 1, 0, block);
        next.splice(idx + 2, 0, tailBlock);
        return next;
      });
      pendingFocusIdRef.current = tailId;
      scheduleSave();
    }
    useEffect2(function() {
      var pid = pendingFocusIdRef.current;
      if (!pid) return;
      pendingFocusIdRef.current = null;
      var el = blocksContainerRef.current && blocksContainerRef.current.querySelector('[data-block-id="' + pid + '"] textarea');
      if (el) {
        try {
          el.focus();
          el.setSelectionRange(0, 0);
        } catch (_e) {
        }
      }
    });
    function openInsertSheet() {
      setShowInsert(true);
    }
    function handleBlockInsert(block) {
      insertAtCursor(block);
    }
    function handleInsertImage() {
      if (fileInputRef.current) fileInputRef.current.click();
    }
    function handleInsertAudio() {
      setShowRec(true);
    }
    function handleInsertInline(token) {
      var info = activeTextareaRef.current;
      if (info && info.idx != null) {
        var idx = info.idx;
        var cur = blocks[idx];
        if (cur && (cur.type === "p" || cur.type === "h2" || cur.type === "quote")) {
          var caret = info.caret != null ? info.caret : info.el ? info.el.selectionStart : (cur.text || "").length;
          var text = cur.text || "";
          var pad = caret > 0 && !/\s$/.test(text.slice(0, caret)) ? " " : "";
          var newText = text.slice(0, caret) + pad + token + text.slice(caret);
          patchBlock(idx, { text: newText });
          return;
        }
      }
      insertBlockAt(blocks.length - 1, JournalHelpers.newBlock("p", { text: token }));
    }
    function onFileChosen(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      e.target.value = "";
      JournalMediaStore.compressImage(file, { maxDim: 1600, quality: 0.8 }).then(function(out) {
        return JournalMediaStore.put({
          type: "image",
          blob: out.blob,
          mime: "image/jpeg",
          width: out.width,
          height: out.height
        });
      }).then(function(mid) {
        insertAtCursor(JournalHelpers.newBlock("image", { mediaId: mid, caption: "" }));
      }).catch(function(err) {
        console.warn("Image insert failed", err);
        alert("Could not load that image.");
      });
    }
    function onRecordingSaved(info) {
      setShowRec(false);
      if (!info || !info.mediaId) return;
      insertAtCursor(JournalHelpers.newBlock("audio", { mediaId: info.mediaId, duration: info.duration, caption: "", samples: info.samples || null }));
    }
    function trackCaret(idx, el) {
      if (!el) return;
      activeTextareaRef.current = { idx, el, caret: el.selectionStart };
    }
    function focusTextarea(idx, el) {
      activeTextareaRef.current = { idx, el, caret: el ? el.selectionStart : 0 };
    }
    function blockDeleteUI(idx) {
      if (confirmDelIdx === idx) {
        return /* @__PURE__ */ React.createElement(
          ConfirmStrip,
          {
            className: "jrn-block-confirm",
            question: "Delete this block?",
            onCancel: () => setConfirmDelIdx(null),
            onConfirm: () => deleteBlock(idx)
          }
        );
      }
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "jrn-block-del-btn",
          onClick: function(e) {
            e.stopPropagation();
            setConfirmDelIdx(idx);
          },
          title: "Delete block",
          "aria-label": "Delete block"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), /* @__PURE__ */ React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }))
      );
    }
    function renderEditableBlock(b, idx) {
      var common = {
        key: b.id,
        className: "jrn-block jrn-block-edit",
        "data-block-id": b.id
      };
      if (b.type === "p" || b.type === "h2") {
        return /* @__PURE__ */ React.createElement("div", { ...common }, /* @__PURE__ */ React.createElement(
          "textarea",
          {
            className: "jrn-block-textarea" + (b.type === "h2" ? " h2" : ""),
            rows: 1,
            value: b.text || "",
            placeholder: idx === 0 ? "Start writing\u2026" : "",
            onChange: function(e) {
              patchBlock(idx, { text: e.target.value });
              trackCaret(idx, e.target);
            },
            onFocus: function(e) {
              focusTextarea(idx, e.target);
            },
            onSelect: function(e) {
              trackCaret(idx, e.target);
            },
            onKeyUp: function(e) {
              trackCaret(idx, e.target);
            },
            onClick: function(e) {
              trackCaret(idx, e.target);
            },
            onBlur: function(e) {
              trackCaret(idx, e.target);
              commitSave();
            },
            ref: function(el) {
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }
          }
        ), blockDeleteUI(idx));
      }
      if (b.type === "quote") {
        return /* @__PURE__ */ React.createElement("div", { ...common }, /* @__PURE__ */ React.createElement("div", { className: "jrn-block-quote" }, /* @__PURE__ */ React.createElement(
          "textarea",
          {
            rows: 1,
            value: b.text || "",
            placeholder: "Quoted text\u2026",
            onChange: function(e) {
              patchBlock(idx, { text: e.target.value });
              trackCaret(idx, e.target);
            },
            onFocus: function(e) {
              focusTextarea(idx, e.target);
            },
            onSelect: function(e) {
              trackCaret(idx, e.target);
            },
            onKeyUp: function(e) {
              trackCaret(idx, e.target);
            },
            onClick: function(e) {
              trackCaret(idx, e.target);
            },
            onBlur: function(e) {
              trackCaret(idx, e.target);
              commitSave();
            },
            ref: function(el) {
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }
          }
        ), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            className: "jrn-block-quote-cite",
            value: b.cite || "",
            placeholder: "Citation (optional)",
            onChange: function(e) {
              patchBlock(idx, { cite: e.target.value });
            },
            onBlur: function() {
              commitSave();
            }
          }
        )), blockDeleteUI(idx));
      }
      if (b.type === "divider") {
        return /* @__PURE__ */ React.createElement("div", { ...common }, /* @__PURE__ */ React.createElement("div", { className: "jrn-divider" }, "\u2756  \u2756  \u2756"), blockDeleteUI(idx));
      }
      if (b.type === "image") {
        return /* @__PURE__ */ React.createElement("div", { ...common }, /* @__PURE__ */ React.createElement("div", { className: "jrn-embed-image" }, b.sourceJournalId && b.sourceJournalTitle && /* @__PURE__ */ React.createElement("div", { className: "jrn-linked-badge" }, "From: " + b.sourceJournalTitle), /* @__PURE__ */ React.createElement(JournalImageBlock, { mediaId: b.mediaId }), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            className: "jrn-img-caption",
            placeholder: "Caption (optional)",
            value: b.caption || "",
            onChange: function(e) {
              patchBlock(idx, { caption: e.target.value });
            },
            onBlur: function() {
              commitSave();
            }
          }
        )), blockDeleteUI(idx));
      }
      if (b.type === "audio") {
        var confirming = confirmAudioDelete === idx;
        return /* @__PURE__ */ React.createElement("div", { ...common }, b.sourceJournalId && b.sourceJournalTitle && /* @__PURE__ */ React.createElement("div", { className: "jrn-linked-badge" }, "From: " + b.sourceJournalTitle), /* @__PURE__ */ React.createElement(
          JournalAudioBlock,
          {
            mediaId: b.mediaId,
            duration: b.duration,
            caption: b.caption,
            samples: b.samples,
            editable: true,
            onRequestDelete: function() {
              setConfirmAudioDelete(idx);
            },
            onCancelDelete: function() {
              setConfirmAudioDelete(null);
            },
            onConfirmDelete: function() {
              setConfirmAudioDelete(null);
              deleteBlock(idx);
            },
            confirming
          }
        ));
      }
      return /* @__PURE__ */ React.createElement("div", { ...common }, /* @__PURE__ */ React.createElement(JournalBlockView, { block: b, callbacks: {} }), blockDeleteUI(idx));
    }
    function focusLastTextBlock(e) {
      if (e.target !== e.currentTarget) return;
      var container = blocksContainerRef.current;
      if (!container) return;
      var tas = container.querySelectorAll(".jrn-block-textarea");
      if (tas.length > 0) {
        var last = tas[tas.length - 1];
        try {
          last.focus();
          last.setSelectionRange(last.value.length, last.value.length);
        } catch (_e) {
        }
        return;
      }
      var newId = JournalHelpers.blockId();
      pendingFocusIdRef.current = newId;
      setBlocks(function(arr) {
        return arr.concat([{ id: newId, type: "p", text: "" }]);
      });
      scheduleSave();
    }
    var navChildren = LibraryNav({
      onBack: function() {
        commitSave();
        onBack && onBack();
      },
      backTitle: "Done",
      leftExtras: /* @__PURE__ */ React.createElement("span", { className: "jrn-saved-ind" }, savedLabel),
      onSearch: props.onSearch ? function() {
        commitSave();
        props.onSearch();
      } : void 0,
      onHistory: props.onHistory ? function() {
        commitSave();
        props.onHistory();
      } : void 0,
      onSettings: props.onSettings ? function() {
        commitSave();
        props.onSettings();
      } : void 0,
      theme: props.theme,
      onThemeChange: props.onThemeChange
    });
    return /* @__PURE__ */ React.createElement(ScreenLayout, { navChildren }, /* @__PURE__ */ React.createElement("div", { className: "jrn-editor" }, /* @__PURE__ */ React.createElement("input", { ref: fileInputRef, type: "file", accept: "image/*", style: { display: "none" }, onChange: onFileChosen }), /* @__PURE__ */ React.createElement("div", { className: "jrn-editor-meta" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "jrn-editor-title",
        type: "text",
        value: title,
        placeholder: "Title",
        onChange: function(e) {
          setTitle(e.target.value);
          scheduleSave();
        },
        onBlur: function() {
          commitSave();
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { ref: blocksContainerRef, className: "jrn-blocks jrn-body-surface", onClick: focusLastTextBlock }, blocks.map(function(b, idx) {
      return renderEditableBlock(b, idx);
    }))), !showRec && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "jrn-fab jrn-fab-plus",
        onClick: openInsertSheet,
        title: "Insert",
        "aria-label": "Insert"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14" }))
    ), showInsert && /* @__PURE__ */ React.createElement(
      JournalInsertSheet,
      {
        excludeJournalId: entryId,
        onClose: function() {
          setShowInsert(false);
        },
        onInsertBlock: function(b) {
          handleBlockInsert(b);
          setShowInsert(false);
        },
        onInsertImage: handleInsertImage,
        onRecordAudio: handleInsertAudio,
        onInsertInline: handleInsertInline
      }
    ), showRec && /* @__PURE__ */ React.createElement(
      JournalRecordingSheet,
      {
        onSave: onRecordingSaved,
        onClose: function() {
          setShowRec(false);
        }
      }
    ));
  }

  // app/src/main/assets/src/renderer/dom-journal-chip.jsx
  function JournalChip({ refKey, onClick, label }) {
    React.useSyncExternalStore(
      React.useCallback(function(cb) {
        return typeof JournalIndexStore !== "undefined" ? JournalIndexStore.subscribe(cb) : function() {
        };
      }, []),
      function() {
        return typeof JournalIndexStore !== "undefined" ? JournalIndexStore.getVersion() : 0;
      }
    );
    var ids = !refKey || typeof JournalIndexStore === "undefined" ? [] : JournalIndexStore.entriesReferencing(refKey);
    if (!refKey || !ids || ids.length === 0) return null;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "nav-search-btn jrn-inbound-chip",
        onClick: function() {
          onClick && onClick(refKey, label);
        },
        title: ids.length + " journal " + (ids.length === 1 ? "entry" : "entries"),
        "aria-label": "Journal entries"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--gold)" } }, /* @__PURE__ */ React.createElement("path", { d: "M7 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z" }), /* @__PURE__ */ React.createElement("path", { d: "M9 9h6M9 13h4" })),
      /* @__PURE__ */ React.createElement("span", { className: "jrn-inbound-chip-badge" }, ids.length)
    );
  }
  function jrnRefKeyForLetter(volKey, letterId) {
    return volKey && letterId ? "letter:" + volKey + "/" + letterId : null;
  }
  function jrnRefKeyForChapter(bookId, chapter) {
    return bookId && chapter != null ? "chapter:" + bookId + ":" + chapter : null;
  }
  function jrnRefKeyForBookmark(bookmarkId) {
    return bookmarkId ? "bookmark:" + bookmarkId : null;
  }
  function jrnRefKeyForLetterByLabel(volumeLabel, letterId) {
    if (!volumeLabel || !letterId || typeof COLLECTIONS === "undefined") return null;
    for (var i = 0; i < COLLECTIONS.length; i++) {
      if (COLLECTIONS[i].label === volumeLabel) {
        return "letter:" + COLLECTIONS[i].volKey + "/" + letterId;
      }
    }
    return null;
  }

  // app/src/main/assets/src/stores/_entry-b.js
  Object.assign(window, {
    // Platform bridge (W1.1)
    PlatformBridge,
    // Stores
    CachedStore,
    hydrateAllStores,
    hasAnyPendingStores,
    clearLegacyLs,
    LS_SKIP_LIST,
    showToast,
    hideToast,
    IDBAdapter,
    WelcomedFlagStore,
    AboutSeenFlagStore: AboutSeenFlagStore2,
    GardenWarningFlagStore,
    ProphecyCardsStore,
    StateStore,
    HistoryStore,
    HomeOrderStore,
    DEFAULT_HOME_ORDER,
    migrateAnnotations,
    AnnotationStore: AnnotationStore2,
    HighlightStore,
    NoteStore: NoteStore2,
    NotebookStore: NotebookStore2,
    RecentNavStore,
    hlId,
    lnkId,
    LinkStore: LinkStore2,
    persistLink,
    bkmId,
    BookmarkStore: BookmarkStore2,
    JournalMediaStore: JournalMediaStore2,
    _jrnDateStr,
    _jrnDaysBetween,
    MILESTONE_DEFS,
    JournalStatsStore: JournalStatsStore2,
    jrnShowMilestoneToast: jrnShowMilestoneToast2,
    JournalIndexStore: JournalIndexStore2,
    jrnId,
    JournalStore: JournalStore2,
    JournalNotebookStore,
    // Components
    ExpandableText,
    JrnExpandable: JrnExpandable2,
    ErrorBoundary,
    HydrationGate,
    // Hooks
    useMarkAsRead,
    useReadProgress,
    _validateTabState,
    useSavedState,
    useRefMirror,
    useHistory,
    useThumbnails,
    useScrollMemory,
    useReadingDwell,
    useSettings,
    useSheetOrchestration,
    useFromLetterStack,
    useNavigateToLink,
    useTabs,
    useTabActions,
    usePersistedState,
    useAndroidBack,
    modalRegistry: modalRegistry2,
    useModalRegistry: useModalRegistry2,
    useHistorySync,
    suppressNextHistoryPush: suppressNextHistoryPush2,
    clearSuppressNextHistoryPush: clearSuppressNextHistoryPush2,
    useNavHistoryTracking,
    useNav,
    useSearch,
    useBibleStudies,
    useJournalMutations,
    useTapThrough,
    useReadingPositionNav,
    useReadingChainNav,
    useSurprise,
    useAppShellEffects,
    useStorageInfo,
    formatBytes,
    // Data
    JournalHelpers: JournalHelpers2,
    COLLECTIONS: COLLECTIONS2,
    COL_BY_KEY: COL_BY_KEY2,
    COL_BY_CARD,
    COL_BY_LETTER_SC: COL_BY_LETTER_SC2,
    COL_BY_INDEX_SC: COL_BY_INDEX_SC2,
    COL_BY_SEARCH_ID: COL_BY_SEARCH_ID2,
    COL_BY_READ_KEY,
    _NAV_ICONS,
    COL_NAV_ICON,
    _BOUNDARY_SHORT,
    _BOUNDARY_SHORT_OUTSIDE,
    READING_CHAIN: READING_CHAIN2,
    _isWtlbFamily,
    _boundaryShort: _boundaryShort2,
    colLetters,
    colPreface: colPreface2,
    colLetterArr: colLetterArr2,
    LETTER_SCREEN_SET: LETTER_SCREEN_SET2,
    _allBooks: _allBooks2,
    _matthew: _matthew2,
    _studies: _studies2,
    parseRefStr,
    findBook,
    parseScriptureRef,
    resolveVerseText,
    findEntryContext: findEntryContext2,
    lookupVersesFromBooks,
    linkWtlbEntries,
    linkPreface,
    resolveVotLetter: resolveVotLetter2,
    isHiddenManna,
    // Journal UI (sheets)
    JournalRecordingSheet: JournalRecordingSheet2,
    JournalInsertSheet: JournalInsertSheet2,
    JournalInboundSheet,
    // Renderer
    JournalChip,
    jrnRefKeyForLetter,
    jrnRefKeyForChapter,
    jrnRefKeyForBookmark,
    jrnRefKeyForLetterByLabel
  });
  Object.assign(window, JournalHubScreen_exports, JournalViewerScreen_exports, JournalEditorScreen_exports);
})();
