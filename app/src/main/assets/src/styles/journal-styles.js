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

  // Nav layout — push everything except the back arrow to the right.
  // ScreenLayout's nav is a flex row; this spacer eats the gap between
  // the back chevron and the icon cluster.
  R('.jrn-nav-spacer { flex: 1; min-width: 0; }');

  // Tab strip
  R('.jrn-tabs { display: flex; border-bottom: 1px solid var(--gold-border); padding: 0 18px; margin-top: 6px; }');
  R('.jrn-tab { background: none; border: none; padding: 12px 14px 14px; font-family: var(--font-cinzel); text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--gold-dim); cursor: pointer; position: relative; transition: color 0.2s; }');
  R('.jrn-tab.active { color: var(--gold); }');
  R('.jrn-tab.active::after { content: ""; position: absolute; bottom: -1px; left: 14px; right: 14px; height: 2px; background: var(--gold); border-radius: 2px 2px 0 0; }');
  R('.jrn-tab:hover { color: var(--gold); }');

  // Controls row
  R('.jrn-controls { display: flex; gap: 10px; padding: 12px 18px; align-items: center; flex-wrap: wrap; }');
  // "Done" pill — exits edit mode on the hub. Gold-outlined to match other
  // small chips in the app (settings rows, notebook actions).
  R('.jrn-done-btn { background: var(--gold-faint); border: 1px solid var(--gold); color: var(--gold); font-family: var(--font-cinzel); font-size: 11px; padding: 6px 14px; border-radius: 999px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }');
  R('.jrn-done-btn:hover { background: var(--gold); color: var(--bg); }');
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
  // Pin marker (bookmark-ribbon icon, top-right). Lives outside any tap
  // target so it is purely decorative — the user pins/unpins from the viewer.
  // Pin marker sits just LEFT of the ⋯ menu button so they never overlap.
  R('.jrn-card-pin-marker { position: absolute; top: 12px; right: 44px; width: 13px; height: 16px; color: var(--gold); pointer-events: none; }');
  R('.jrn-card-pin-marker svg { width: 100%; height: 100%; filter: drop-shadow(0 0 4px var(--gold-glow)); }');
  // Per-card ⋯ (3-dot) options button — top-right corner.
  R('.jrn-card { padding-right: 42px; }');
  R('.jrn-card-menu-btn { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 50%; background: transparent; border: none; color: var(--gold-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; transition: background 0.12s, color 0.12s; z-index: 2; }');
  R('.jrn-card-menu-btn:hover { background: var(--gold-faint); color: var(--gold); }');
  R('.jrn-card-menu-btn:active { transform: scale(0.92); }');
  R('.jrn-card-menu-btn svg { width: 18px; height: 18px; }');

  // Edit-mode controls on each card: small X in the upper right; when tapped,
  // an inline confirm strip takes its place. Both stop propagation so the
  // card body click (which opens the entry) is unaffected.
  R('.jrn-card.edit-mode { padding-right: 44px; }');
  R('.jrn-card-del-x { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; background: rgba(199, 92, 74, 0.12); border: 1px solid rgba(199, 92, 74, 0.45); color: #c75c4a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; transition: background 0.12s, color 0.12s, transform 0.1s; z-index: 2; }');
  R('.jrn-card-del-x:hover { background: #c75c4a; color: white; }');
  R('.jrn-card-del-x:active { transform: scale(0.92); }');
  R('.jrn-card-del-x svg { width: 14px; height: 14px; }');
  R('.jrn-card-confirm { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: rgba(199, 92, 74, 0.16); border: 1px solid rgba(199, 92, 74, 0.5); border-radius: 999px; z-index: 3; }');
  R('.jrn-card-confirm-q { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #c75c4a; padding: 0 2px; }');
  R('.jrn-card-confirm-cancel { background: none; border: none; color: var(--cream-dim); width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; }');
  R('.jrn-card-confirm-cancel:hover { background: var(--bg3); color: var(--cream); }');
  R('.jrn-card-confirm-yes { background: #c75c4a; border: none; color: white; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }');
  R('.jrn-card-confirm-yes svg { width: 13px; height: 13px; }');
  R('.jrn-card-confirm-yes:hover { background: #b04d3d; }');
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
  R('.jrn-card-time { opacity: 0.62; font-size: 0.85em; letter-spacing: 0.04em; }');
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

  // Editor screen — single body surface, title-only header, no inline + icons
  R('.jrn-editor { display: flex; flex-direction: column; flex: 1; padding-bottom: calc(96px + env(safe-area-inset-bottom)); }');
  R('.jrn-editor-meta { padding: 18px 22px 4px; }');
  R('.jrn-editor-title { width: 100%; background: none; border: none; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; outline: none; padding: 0; }');
  R('body.light .jrn-editor-title { color: #8b6f30; }');
  R('.jrn-editor-title::placeholder { color: var(--gold-dim); opacity: 0.6; font-style: italic; text-transform: none; letter-spacing: 0.02em; font-weight: 400; }');
  R('.jrn-saved-ind { font-style: italic; color: var(--gold-dim); font-family: var(--font-garamond); font-size: 12px; text-transform: none; letter-spacing: 0; padding: 0 8px; }');
  R('.jrn-blocks { padding: 6px 18px 24px; display: flex; flex-direction: column; gap: 0; }');
  R('.jrn-body-surface { min-height: 65vh; cursor: text; }');
  R('.jrn-block { position: relative; padding: 0; }');
  R('.jrn-block-textarea { width: 100%; background: none; border: none; color: var(--cream-dim); font-family: var(--font-garamond); font-size: 17px; line-height: 1.65; resize: none; outline: none; padding: 4px 4px; border-radius: 4px; transition: background 0.15s; min-height: 28px; }');
  R('body.light .jrn-block-textarea { color: #3a3528; }');
  R('.jrn-block-textarea:focus { background: rgba(212, 183, 114, 0.04); }');
  R('.jrn-block-textarea.h2 { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }');
  R('.jrn-block-quote { border-left: 3px solid var(--gold); padding: 10px 0 10px 18px; margin: 4px 0; }');
  R('.jrn-block-quote textarea { width: 100%; background: none; border: none; color: var(--cream); font-family: var(--font-garamond); font-style: italic; font-size: 17px; line-height: 1.6; resize: none; outline: none; padding: 2px 0; }');
  R('body.light .jrn-block-quote textarea { color: #2a2520; }');
  R('.jrn-block-quote-cite { width: 100%; background: none; border: none; outline: none; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); margin-top: 8px; }');
  R('.jrn-divider { text-align: center; padding: 16px 0; color: var(--gold); letter-spacing: 1em; font-size: 14px; user-select: none; }');
  // Media blocks get visual breathing room so they read as inline interrupts
  R('.jrn-block:has(.jrn-embed-image), .jrn-block:has(.jrn-embed-audio), .jrn-block:has(.jrn-embed-letter), .jrn-block:has(.jrn-embed-chapter), .jrn-block:has(.jrn-embed-bookmark), .jrn-block:has(.jrn-embed-note), .jrn-block:has(.jrn-embed-journal), .jrn-block:has(.jrn-embed-verse) { margin: 8px 0; }');

  // Embed cards
  R('.jrn-embed-letter, .jrn-embed-chapter, .jrn-embed-bookmark, .jrn-embed-note, .jrn-embed-journal { background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 8px; padding: 14px 16px; cursor: pointer; position: relative; transition: background 0.15s, border-color 0.15s; }');
  R('body.light .jrn-embed-letter, body.light .jrn-embed-chapter, body.light .jrn-embed-bookmark, body.light .jrn-embed-note, body.light .jrn-embed-journal { background: #f3ecdc; }');
  R('.jrn-embed-letter:hover, .jrn-embed-chapter:hover, .jrn-embed-bookmark:hover, .jrn-embed-note:hover, .jrn-embed-journal:hover { border-color: var(--gold); }');
  // Notebook embed — compact row: icon, name, chevron. Tapping opens the
  // notebook's screen in the Notes hub.
  R('.jrn-embed-notebook { display: flex; align-items: center; gap: 12px; background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 8px; padding: 12px 14px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }');
  R('body.light .jrn-embed-notebook { background: #f3ecdc; }');
  R('.jrn-embed-notebook:hover { border-color: var(--gold); background: var(--bg2); }');
  R('.jrn-emb-notebook-icon { width: 34px; height: 34px; border-radius: 8px; background: var(--gold-faint); display: flex; align-items: center; justify-content: center; color: var(--gold); flex-shrink: 0; }');
  R('.jrn-emb-notebook-icon svg { width: 18px; height: 18px; }');
  R('.jrn-emb-notebook-text { flex: 1; min-width: 0; }');
  R('.jrn-emb-notebook-text .jrn-emb-eyebrow { margin-bottom: 2px; }');
  R('.jrn-emb-notebook-text .jrn-emb-title { margin: 0; }');
  R('.jrn-emb-notebook-arrow { color: var(--gold-dim); font-size: 20px; flex-shrink: 0; }');
  R('.jrn-emb-eyebrow { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); margin-bottom: 4px; }');
  R('.jrn-emb-title { font-family: var(--font-cinzel); color: var(--cream); font-size: 16px; font-weight: 500; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }');
  R('body.light .jrn-emb-title { color: #2a2520; }');
  R('.jrn-emb-body { font-family: var(--font-garamond); color: var(--cream-dim); font-size: 14px; line-height: 1.5; font-style: italic; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }');
  // When .jrn-emb-body is a JrnExpandable container (it adds is-collapsed/
  // is-expanded), JS owns truncation (head + … + Show more). The 2-line
  // clamp + overflow:hidden above would otherwise clip the text AND the
  // "Show more" button — so reset wrapping for the expandable case.
  R('.jrn-emb-body.is-collapsed, .jrn-emb-body.is-expanded { display: block; -webkit-line-clamp: unset; overflow: visible; }');
  R('.jrn-emb-date { position: absolute; top: 12px; right: 14px; font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }');
  R('.jrn-emb-delete { position: absolute; bottom: 6px; right: 6px; background: none; border: none; color: var(--gold-dim); width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: none; align-items: center; justify-content: center; }');
  R('.jrn-block:hover .jrn-emb-delete { display: flex; }');
  R('.jrn-emb-delete:hover { background: rgba(199, 92, 74, 0.15); color: #c75c4a; }');
  R('.jrn-embed-verse { background: var(--bg3); border-left: 3px solid var(--gold); border-radius: 6px; padding: 14px 16px; position: relative; transition: border-color 0.15s; }');
  R('body.light .jrn-embed-verse { background: #f3ecdc; }');
  R('.jrn-embed-verse[role="button"]:hover { border-left-color: var(--gold-bright); }');
  R('.jrn-embed-verse .jrn-emb-cite { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold); margin-bottom: 6px; }');
  R('.jrn-embed-verse .jrn-emb-text { font-family: var(--font-garamond); color: var(--cream); font-size: 16px; line-height: 1.6; }');
  R('body.light .jrn-embed-verse .jrn-emb-text { color: #2a2520; }');
  R('.jrn-embed-verse .vsup { color: var(--gold); font-size: 0.65em; font-family: var(--font-cinzel); vertical-align: super; margin-right: 3px; }');
  // Excerpt-styled body — italicized + opening-quote ornament so picked
  // text reads visually distinct from the title/eyebrow.
  R('.jrn-emb-excerpt { font-style: italic; color: var(--cream); position: relative; padding-left: 12px; }');
  R('body.light .jrn-emb-excerpt { color: #2a2520; }');
  R('.jrn-emb-excerpt::before { content: "\\201C"; position: absolute; left: 0; top: -2px; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; line-height: 1; }');
  R('.jrn-embed-letter.is-excerpt, .jrn-embed-verse.is-excerpt { border-left-style: solid; }');

  // Quote body in the viewer — italic + matching size, used both for short
  // quotes and the JrnExpandable wrapper of long ones.
  R('.jrn-block-quote-body { font-style: italic; color: var(--cream); font-family: var(--font-garamond); font-size: 17px; line-height: 1.6; }');
  R('body.light .jrn-block-quote-body { color: #2a2520; }');

  // Collapse/expand toggle — appears at the end of long quote bodies +
  // card excerpts. Tap toggles between truncated and full text. Stops
  // propagation so it doesn't trigger the parent card's nav click.
  R('.jrn-expand-toggle { background: none; border: none; padding: 0 0 0 6px; color: var(--gold); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; -webkit-tap-highlight-color: transparent; white-space: nowrap; }');
  R('.jrn-expand-toggle:hover { color: var(--gold-bright); }');
  R('.jrn-expand-toggle:active { color: var(--gold-dim); }');
  // When expanded, give the body a little breathing room from the toggle
  R('.is-expanded .jrn-expand-toggle { margin-top: 4px; }');

  // Image embed
  R('.jrn-embed-image { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); position: relative; }');
  R('.jrn-embed-image img { width: 100%; display: block; max-height: 420px; object-fit: cover; }');
  R('.jrn-embed-image .jrn-img-caption { padding: 8px 14px; background: var(--bg2); font-family: var(--font-garamond); font-style: italic; font-size: 13px; color: var(--cream-dim); border: none; width: 100%; outline: none; }');
  R('body.light .jrn-embed-image .jrn-img-caption { background: #f3ecdc; color: #5a4f3d; }');
  R('.jrn-img-delete { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.55); color: var(--cream); width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer; z-index: 2; display: flex; align-items: center; justify-content: center; }');
  R('.jrn-img-delete:hover { background: rgba(199, 92, 74, 0.7); }');

  // Audio embed — play left, scrub-waveform middle, optional delete right
  R('.jrn-embed-audio { background: var(--bg3); border: 1px solid var(--gold-border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; position: relative; }');
  R('body.light .jrn-embed-audio { background: #f3ecdc; }');
  R('.jrn-aud-play { width: 38px; height: 38px; border-radius: 50%; background: var(--gold); border: none; color: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }');
  R('.jrn-aud-play svg { width: 14px; height: 14px; fill: currentColor; }');
  R('.jrn-aud-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }');
  R('.jrn-aud-waveform { height: 28px; display: flex; align-items: center; gap: 2px; overflow: hidden; }');
  R('.jrn-aud-waveform .bar { width: 2px; background: var(--gold-dim); border-radius: 1px; flex-shrink: 0; transition: background 0.1s; }');
  R('.jrn-aud-waveform .bar.is-played { background: var(--gold); }');
  R('.jrn-aud-meta { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); display: flex; justify-content: space-between; gap: 8px; }');
  R('.jrn-aud-delete { background: none; border: none; color: var(--gold-dim); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.12s, color 0.12s; }');
  R('.jrn-aud-delete svg { width: 16px; height: 16px; }');
  R('.jrn-aud-delete:hover { background: rgba(199, 92, 74, 0.15); color: #c75c4a; }');
  // When the user taps × on an audio block, the standardized ConfirmStrip
  // (.ann-chip-confirm base) replaces the play+body+× row. The parent
  // .jrn-embed-audio already supplies padding + border + bg, so the
  // strip's own padding + min-width are zeroed here and the question
  // text takes the warm-red contextual tint matching .jrn-block-confirm.
  R('.jrn-aud-confirm { padding: 0; min-width: 0; flex: 1; }');
  R('.jrn-aud-confirm .ann-chip-confirm-q { color: #c75c4a; }');

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

  // Viewer nav buttons — pin icon flips from outlined to filled when pinned.
  R('.jrn-pin-btn { color: var(--gold-dim); transition: color 0.15s; }');
  R('.jrn-pin-btn:hover { color: var(--gold); }');
  R('.jrn-pin-btn.is-pinned { color: var(--gold); }');
  R('.jrn-pin-btn.is-pinned svg { filter: drop-shadow(0 0 4px var(--gold-glow)); }');
  R('.jrn-del-btn { color: var(--gold-dim); transition: color 0.15s; }');
  R('.jrn-del-btn:hover { color: #c75c4a; }');

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

  // Library / Note / Journal pickers (sheet shell + LinkPicker-style search)
  R('.jrn-picker-search-row { padding: 8px 14px 6px; }');
  R('.jrn-picker-search { width: 100%; background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 14px; outline: none; transition: border-color 0.15s; box-sizing: border-box; }');
  R('body.light .jrn-picker-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }');
  R('.jrn-picker-search:focus { border-color: var(--gold); }');
  R('.jrn-picker-search::placeholder { color: var(--gold-dim); font-style: italic; }');
  R('.jrn-picker-results { padding: 6px 14px 24px; display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }');
  R('.jrn-picker-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; background: none; border: none; width: 100%; text-align: left; transition: background 0.12s; }');
  R('.jrn-picker-item:hover { background: var(--bg3); }');
  R('body.light .jrn-picker-item:hover { background: #f3ecdc; }');
  R('.jrn-picker-spine { width: 32px; height: 42px; border-radius: 3px; background: var(--gold-faint); border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; font-family: var(--font-cinzel); font-size: 10px; font-weight: 600; color: var(--gold); text-transform: uppercase; flex-shrink: 0; }');
  R('.jrn-picker-text { flex: 1; min-width: 0; }');
  R('.jrn-picker-label { font-family: var(--font-cinzel); font-size: 14px; color: var(--gold); text-transform: uppercase; letter-spacing: 0.04em; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }');
  R('.jrn-picker-cat { font-family: var(--font-garamond); font-style: italic; font-size: 12px; color: var(--cream-dim); margin-top: 2px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }');
  R('.jrn-picker-empty { padding: 28px 16px; text-align: center; font-family: var(--font-garamond); font-style: italic; color: var(--gold-dim); font-size: 14px; }');

  // Insert sheet shell — tall enough that pickers do not overflow on phones.
  R('.jrn-insert-sheet { max-height: 80vh; display: flex; flex-direction: column; }');

  // Journal block-picker (drilled into a specific entry)
  R('.jrn-blockpick-header { padding: 8px 18px 4px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }');
  R('.jrn-blockpick-title { font-family: var(--font-cinzel); font-size: 14px; font-weight: 600; color: var(--gold); text-transform: uppercase; letter-spacing: 0.04em; flex: 1; }');
  R('.jrn-blockpick-date { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-dim); }');
  R('.jrn-blockpick-divider { padding: 14px 18px 6px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); border-top: 1px solid var(--gold-border); margin-top: 8px; font-style: italic; }');
  R('.jrn-blockpick-whole .jrn-picker-spine { background: var(--gold); color: var(--bg); border-color: var(--gold); }');

  // Linked-from-journal badge — shown on image/audio blocks that were
  // embedded from another entry, both in editor + viewer surface.
  R('.jrn-linked-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; background: var(--gold-faint); border: 1px solid var(--gold-border); border-radius: 999px; font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gold); white-space: nowrap; margin-bottom: 8px; }');
  R('.jrn-linked-wrap.is-linked { padding-top: 4px; }');
  R('.jrn-linked-wrap.is-linked > .jrn-excerpt-source { margin-bottom: 6px; padding: 4px 10px; background: var(--gold-faint); border: 1px solid var(--gold-border); border-radius: 999px; display: inline-block; cursor: pointer; font-size: 10px; }');
  R('.jrn-linked-wrap.is-linked > .jrn-excerpt-source:hover { background: var(--gold-border); }');

  // Journal-excerpt block — text from another entry, rendered as a card
  R('.jrn-embed-journal-excerpt { background: var(--bg3); border: 1px solid var(--gold-border); border-left: 3px solid var(--gold); border-radius: 6px; padding: 12px 16px; position: relative; }');
  R('body.light .jrn-embed-journal-excerpt { background: #f3ecdc; }');
  R('.jrn-embed-journal-excerpt .jrn-excerpt-source { display: inline-block; cursor: pointer; padding: 2px 0 4px; font-size: 10px; color: var(--gold); }');
  R('.jrn-embed-journal-excerpt .jrn-excerpt-source:hover { color: var(--gold-bright); text-decoration: underline; }');
  R('.jrn-emb-excerpt-body { font-family: var(--font-garamond); color: var(--cream); font-size: 16px; line-height: 1.6; font-style: italic; }');
  R('body.light .jrn-emb-excerpt-body { color: #2a2520; }');
  R('.jrn-emb-excerpt-body.is-quote::before { content: "\\201C"; color: var(--gold); font-family: var(--font-cinzel); font-size: 22px; line-height: 1; margin-right: 4px; vertical-align: -4px; }');
  R('.jrn-embed-journal-excerpt.is-heading .jrn-emb-excerpt-body { font-family: var(--font-cinzel); font-style: normal; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); font-size: 16px; }');

  // Unified block delete (×) + inline confirm in the editor
  R('.jrn-block-edit { position: relative; padding-right: 36px; display: flex; flex-direction: column; }');
  R('.jrn-block-del-btn { position: absolute; top: 8px; right: 4px; width: 26px; height: 26px; border-radius: 50%; background: transparent; border: 1px solid transparent; color: var(--gold-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0.55; transition: opacity 0.12s, color 0.12s, background 0.12s, border-color 0.12s; z-index: 2; }');
  R('.jrn-block-del-btn:hover { opacity: 1; color: #c75c4a; background: rgba(199, 92, 74, 0.12); border-color: rgba(199, 92, 74, 0.45); }');
  R('.jrn-block-del-btn:active { transform: scale(0.92); }');
  R('.jrn-block-del-btn svg { width: 14px; height: 14px; }');
  // The standardized ConfirmStrip (.ann-chip-confirm base) is rendered
  // with className="jrn-block-confirm" so it flips to the TOP of the
  // block (order:-1) as a warm-red banner and pushes the block's own
  // content down rather than overlaying it. .ann-chip-confirm already
  // supplies display/align/gap; this rule adds positioning + the
  // contextual red theme; the .ann-chip-confirm-q tint matches the
  // banner color so the question reads as "this will delete content."
  R('.jrn-block-confirm { order: -1; align-self: stretch; padding: 8px 12px; margin: 0 0 10px; background: rgba(199, 92, 74, 0.14); border: 1px solid rgba(199, 92, 74, 0.45); border-radius: 8px; }');
  R('.jrn-block-confirm .ann-chip-confirm-q { color: #c75c4a; }');

  // Triple-confirmation banner — entry deletion in the viewer
  R('.jrn-tripledel { margin: 0 18px 12px; padding: 14px 18px; background: rgba(199, 92, 74, 0.08); border: 1px solid rgba(199, 92, 74, 0.45); border-radius: 10px; }');
  R('.jrn-tripledel-step-label { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #c75c4a; margin-bottom: 6px; }');
  R('.jrn-tripledel-question { font-family: var(--font-garamond); font-size: 15px; line-height: 1.4; color: var(--cream); margin-bottom: 12px; }');
  R('body.light .jrn-tripledel-question { color: #2a2520; }');
  R('.jrn-tripledel-cascade { font-family: var(--font-garamond); font-size: 13.5px; line-height: 1.45; color: #d98a6a; background: rgba(199, 92, 74, 0.10); border-left: 2px solid rgba(199, 92, 74, 0.55); padding: 8px 12px; margin: -4px 0 12px; border-radius: 0 6px 6px 0; }');
  R('body.light .jrn-tripledel-cascade { color: #a8442f; }');
  R('.jrn-tripledel-input { width: 100%; box-sizing: border-box; background: var(--bg2); border: 1px solid rgba(199, 92, 74, 0.55); color: var(--cream); font-family: var(--font-cinzel); font-size: 14px; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; outline: none; text-transform: uppercase; letter-spacing: 0.06em; }');
  R('.jrn-tripledel-input:focus { border-color: #c75c4a; }');
  R('body.light .jrn-tripledel-input { background: #fff; color: #2a2520; }');
  R('.jrn-tripledel-actions { display: flex; gap: 10px; justify-content: flex-end; }');
  R('.jrn-tripledel-cancel { background: none; border: 1px solid var(--gold-border); color: var(--gold); padding: 6px 14px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }');
  R('.jrn-tripledel-cancel:hover { background: var(--gold-faint); }');
  R('.jrn-tripledel-next { background: rgba(199, 92, 74, 0.15); border: 1px solid #c75c4a; color: #c75c4a; padding: 6px 14px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }');
  R('.jrn-tripledel-next:hover { background: rgba(199, 92, 74, 0.25); }');
  R('.jrn-tripledel-final { background: #c75c4a; border: none; color: white; padding: 6px 16px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; font-weight: 600; }');
  R('.jrn-tripledel-final:disabled { background: rgba(199, 92, 74, 0.25); color: rgba(255,255,255,0.6); cursor: not-allowed; }');
  R('.jrn-tripledel-final:hover:not(:disabled) { background: #b04d3d; }');

  // Recording sheet
  R('.jrn-rec-content { padding: 24px 24px 30px; text-align: center; }');
  R('.jrn-rec-requesting { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 14px; padding: 20px 0; }');
  R('.jrn-rec-status { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #d05a4a; }');
  R('.jrn-rec-status::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #d05a4a; animation: jrnPulseRec 1s ease-in-out infinite; }');
  R('.jrn-rec-status.is-paused { color: var(--gold-dim); }');
  R('.jrn-rec-status.is-paused::before { background: var(--gold-dim); animation: none; }');
  R('@keyframes jrnPulseRec { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }');
  R('.jrn-rec-time { font-family: var(--font-cinzel); font-size: 42px; font-weight: 500; color: var(--cream); letter-spacing: 0.05em; margin: 16px 0; }');
  R('body.light .jrn-rec-time { color: #2a2520; }');
  R('.jrn-rec-time-total { color: var(--gold-dim); font-size: 22px; font-weight: 400; }');
  R('.jrn-rec-waveform { display: flex; align-items: center; justify-content: center; height: 56px; gap: 3px; margin: 12px 0; }');
  R('.jrn-rec-waveform .bar { width: 3px; background: var(--gold-dim); border-radius: 1px; transition: height 0.15s, background 0.1s; min-height: 4px; }');
  R('.jrn-rec-waveform .bar.is-played { background: var(--gold); }');
  R('.jrn-rec-waveform.is-scrubbable { cursor: pointer; padding: 0 6px; }');
  R('.jrn-rec-error { font-family: var(--font-garamond); font-style: italic; color: #d05a4a; font-size: 14px; padding: 14px 24px; }');
  R('.jrn-rec-actions { display: flex; justify-content: center; gap: 14px; margin-top: 24px; align-items: center; }');
  // Pill-style legacy buttons (cancel + close + error close)
  R('.jrn-rec-cancel { background: none; padding: 10px 24px; border-radius: 999px; font-family: var(--font-cinzel); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; border: 1px solid var(--gold-dim); color: var(--gold-dim); }');
  R('.jrn-rec-cancel:hover { color: var(--gold); border-color: var(--gold); }');
  // Pause / resume button (round, gold outline)
  R('.jrn-rec-pause-btn { width: 56px; height: 56px; border-radius: 50%; background: none; border: 2px solid var(--gold); color: var(--gold); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }');
  R('.jrn-rec-pause-btn svg { width: 22px; height: 22px; fill: currentColor; }');
  R('.jrn-rec-pause-btn:hover { background: var(--gold-faint); }');
  // Stop / finish button (round, red square)
  R('.jrn-rec-stop-btn { width: 56px; height: 56px; border-radius: 50%; background: #d05a4a; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 4px 14px rgba(208, 90, 74, 0.4); }');
  R('.jrn-rec-stop-btn svg { width: 22px; height: 22px; }');
  R('.jrn-rec-stop-btn:hover { background: #b84a3c; }');
  // Preview play / pause (round, gold-outlined)
  R('.jrn-rec-preview-actions { display: flex; justify-content: center; margin: 4px 0 6px; }');
  R('.jrn-rec-pp { width: 64px; height: 64px; border-radius: 50%; background: var(--gold); border: none; color: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 6px 18px rgba(212, 183, 114, 0.35); }');
  R('.jrn-rec-pp svg { width: 26px; height: 26px; fill: currentColor; }');
  R('.jrn-rec-pp:hover { transform: scale(1.04); }');
  // Discard (red ×) + Confirm (green ✓) in preview
  R('.jrn-rec-discard-btn { width: 52px; height: 52px; border-radius: 50%; background: none; border: 2px solid #c75c4a; color: #c75c4a; cursor: pointer; font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; }');
  R('.jrn-rec-discard-btn:hover { background: rgba(199, 92, 74, 0.12); }');
  R('.jrn-rec-confirm-btn { width: 52px; height: 52px; border-radius: 50%; background: #4caf50; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4); }');
  R('.jrn-rec-confirm-btn svg { width: 24px; height: 24px; }');
  R('.jrn-rec-confirm-btn:hover { background: #3e9a42; }');
  R('.jrn-rec-preview .jrn-rec-status { color: var(--gold); }');
  R('.jrn-rec-preview .jrn-rec-status::before { background: var(--gold); animation: none; }');

  // Floating Action Buttons
  //   .jrn-fab            — base FAB (gold filled, bottom-right by default)
  //   .jrn-fab-plus       — editor's + insert button (bottom-right)
  //   .jrn-fab-mic        — editor's mic record button (bottom-left, outlined)
  //   .jrn-fab-action     — hub/viewer action FAB
  //   .jrn-fab-action.is-edit   — pencil icon (default state)
  //   .jrn-fab-action.is-create — + icon (hub edit-mode + viewer N/A)
  R('.jrn-fab { position: fixed; bottom: calc(24px + env(safe-area-inset-bottom)); right: calc(22px + env(safe-area-inset-right)); width: 56px; height: 56px; border-radius: 50%; background: var(--gold); color: var(--bg); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 20px rgba(212, 183, 114, 0.4); z-index: 35; transition: transform 0.15s, background 0.15s, box-shadow 0.15s; padding: 0; }');
  R('.jrn-fab:hover { transform: scale(1.05); }');
  R('.jrn-fab:active { transform: scale(0.96); }');
  R('.jrn-fab svg { width: 24px; height: 24px; display: block; }');
  R('.jrn-fab-plus { right: calc(22px + env(safe-area-inset-right)); left: auto; }');
  R('.jrn-fab-mic { left: calc(22px + env(safe-area-inset-left)); right: auto; background: var(--bg3); color: var(--gold); border: 2px solid var(--gold); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }');
  R('.jrn-fab-mic:hover { background: var(--gold-faint); }');
  R('body.light .jrn-fab-mic { background: #fbf6e8; }');
  // Edit-state FAB — neutral background with gold outline so it reads as
  // "enter edit mode" rather than the primary "+ create" action.
  R('.jrn-fab-action.is-edit { background: var(--bg3); color: var(--gold); border: 2px solid var(--gold); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }');
  R('.jrn-fab-action.is-edit:hover { background: var(--gold-faint); }');
  R('body.light .jrn-fab-action.is-edit { background: #fbf6e8; }');
  // Create-state FAB (hub edit-mode active) — filled gold, signals primary
  // "add new entry" action with the box-shadow glow.
  R('.jrn-fab-action.is-create { background: var(--gold); color: var(--bg); box-shadow: 0 6px 20px rgba(212, 183, 114, 0.55); }');
  // "New Entry" pill — the hub's primary create action. Wider than a round
  // FAB so the label reads clearly; the "+" insert FAB lives only in the
  // editor now.
  R('.jrn-fab-newentry { width: auto; min-width: 56px; height: 52px; border-radius: 999px; padding: 0 22px 0 18px; gap: 9px; font-family: var(--font-cinzel); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }');
  R('.jrn-fab-newentry svg { width: 19px; height: 19px; }');
  R('.jrn-fab-newentry-label { white-space: nowrap; }');

  var styleEl = document.createElement('style');
  styleEl.id = 'jrn-styles';
  styleEl.textContent = rules.join('\n');
  document.head.appendChild(styleEl);
})();
