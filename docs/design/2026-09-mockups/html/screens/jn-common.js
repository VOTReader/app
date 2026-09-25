// jn- (journal in depth): shared builders. Load in <head> after kit.js; call JN.writeSprite() first thing in
// <body>, then build markup in an inline script at the end of <body> (it runs before kit.js swaps the icons).
(function () {
  const JN = {};

  // Icons the kit sprite lacks. The ins-* set is JournalInsertSheet.jsx's own drawings.
  const S = (id, body, extra = '') => `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</symbol>`;
  JN.sprite = `<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
    <symbol id="jn-grip" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></symbol>
    <symbol id="jn-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></symbol>
    ${S('jn-pin', '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>')}
    ${S('jn-image-off', '<line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><line x1="13.5" x2="6" y1="13.5" y2="21"/><line x1="18" x2="21" y1="12" y2="15"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/>')}
    ${S('jn-mic-off', '<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>')}
    ${S('jn-phone', '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>')}
    ${S('jn-drive', '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>')}
    ${S('jn-flat', '<path d="M2 12h20"/><path d="M6 10.5v3"/><path d="M10 11.25v1.5"/><path d="M14 11.25v1.5"/><path d="M18 10.5v3"/>')}
    ${S('jn-ins-card', '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="7" y1="14" x2="13" y2="14"/>')}
    ${S('jn-ins-excerpt', '<path d="M6 9h.01M6 15h.01"/><line x1="10" y1="8" x2="20" y2="8"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="16" x2="16" y2="16"/><path d="M3 4v16"/>')}
    ${S('jn-ins-bookmark', '<path d="M6 3a1 1 0 0 0-1 1v17l7-4 7 4V4a1 1 0 0 0-1-1H6z"/>')}
    ${S('jn-ins-note', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/>')}
    ${S('jn-ins-journal', '<path d="M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z"/><line x1="9" y1="9" x2="16" y2="9"/><line x1="9" y1="13" x2="16" y2="13"/>')}
    ${S('jn-ins-notebook', '<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4z"/><polyline points="15 4 15 9 20 9"/><line x1="8" y1="14" x2="15" y2="14"/>')}
    ${S('jn-ins-image', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/>')}
    ${S('jn-ins-audio', '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/>')}
    ${S('jn-ins-divider', '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>')}
    ${S('jn-ins-body', '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>')}
  </svg>`;
  JN.writeSprite = () => document.write(JN.sprite);
  JN.ic = (id, cls = '') => `<svg class="i ${cls}"><use href="#${id}"/></svg>`;

  // Deterministic bar heights (no Math.random, so both themes match).
  JN.bars = (n, lo, hi, seed, shape) => {
    let s = seed; const out = [];
    for (let i = 0; i < n; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280;
      const env = shape === 'flat' ? 1 : 0.5 + 0.5 * Math.abs(Math.sin(i / n * Math.PI * 2.3 + seed));
      out.push(Math.max(lo, Math.round(lo + (hi - lo) * (0.25 + 0.75 * r) * env)));
    }
    return out;
  };
  JN.spans = (hs, cls = () => '') => hs.map((h, i) => `<span class="${cls(i)}" style="height:${h}px"></span>`).join('');

  JN.TITLE = 'Morning reading';
  JN.DATE = 'September 24, 2026 · 7:12 AM';

  // ---- editor pieces ----
  JN.grip = () => `<svg class="i grip"><use href="#jn-grip"/></svg>`;
  JN.del = () => `<span class="del"><i data-i="x"></i></span>`;
  // a block with its controls. kind: text | card-blk | media | memo-blk | orn-blk
  JN.blk = (kind, inner, o = {}) => `<div class="blk ${kind} ${o.focus ? 'focus' : ''} ${o.lift ? 'lift' : ''}" ${o.style ? `style="${o.style}"` : ''}>${o.noGrip ? '' : JN.grip()}${inner}${o.noDel ? '' : JN.del()}</div>`;
  JN.para = (ws, caret) => `<div class="para">${ws.map((w, i) => (caret && i === ws.length - 1)
    ? `<div class="lastline"><div class="ph" style="width:${w}%"></div><span class="caret"></span></div>`
    : `<div class="ph" style="width:${w}%"></div>`).join('')}</div>`;
  JN.memo = (len = '0:42', seed = 11) => `<div class="memo"><span class="pb"><i data-i="play" class="xs fill"></i></span><span class="wave">${JN.spans(JN.bars(28, 4, 22, seed))}</span><span class="len">${len}</span><span class="trash"><i data-i="trash-2" class="sm"></i></span></div>`;
  JN.photo = (v = '', x = true) => `<div class="photo ${v}">${x ? '<span class="delx"><i data-i="x" class="xs"></i></span>' : ''}</div>`;

  // an editor screen (journal.html chrome + the app's floating +)
  JN.editor = (o = {}) => {
    const saved = o.saved === 'saving' ? '<span class="spin"></span>Saving…'
      : o.saved === 'none' ? '' : '<i data-i="circle-check" class="xs"></i>Saved on this device';
    const title = o.title === '' ? '<div class="h1 hint">Title</div>' : `<div class="h1">${o.title || JN.TITLE}</div>`;
    return `<div class="screen">
      <div class="status"></div>
      <div class="topbar"><span class="iconbtn"><i data-i="chevron-left"></i></span><span class="title">Journal</span><span class="btn text">Done</span></div>
      <div class="scroll">
        <div class="ed-head">${title}<div class="meta date">${o.date || JN.DATE}</div></div>
        <div class="blocks">${o.body || ''}</div>
      </div>
      ${saved ? `<div class="meta saved">${saved}</div>` : ''}
      ${o.fab === false ? '' : `<span class="fab">${JN.ic('jn-plus')}</span>`}
      ${o.extra || ''}${o.over || ''}
    </div>`;
  };
  JN.phone = (size, screen) => `<div class="phone-${size}">${screen}</div>`;
  JN.sheet = (inner, cls = '', style = '') => `<div class="scrim"></div><div class="sheet ${cls}" ${style ? `style="${style}"` : ''}><div class="grabber"></div>${inner}</div>`;
  JN.shead = (title, o = {}) => `<div class="shead">${o.back ? '<span class="iconbtn l"><i data-i="chevron-left"></i></span>' : ''}<span class="h2">${title}</span>${o.close === false ? '' : '<span class="iconbtn"><i data-i="x"></i></span>'}</div>`;

  // ---- the hub, as jp-journal-hub-states draws it ----
  const PIN = `<svg class="i xs pin"><use href="#jn-pin"/></svg>`;
  JN.hubCard = (t, when, bars, atts, pinned, pvText) => `<div class="card entry">
      <div class="top"><div class="ttl">${t}</div><span class="iconbtn more"><i data-i="ellipsis-vertical" class="sm"></i></span></div>
      <div class="meta when">${pinned ? PIN : ''}${when}</div>
      ${pvText ? `<div class="pvt">${pvText}</div>` : `<div class="pv"><div class="ph" style="width:${bars[0]}%"></div><div class="ph" style="width:${bars[1]}%"></div></div>`}
      <div class="atts">${atts.map(a => `<span class="att"><i data-i="${a[0]}" class="xs"></i>${a[1]}</span>`).join('')}</div>
    </div>`;
  JN.HUB_CARDS = [
    JN.hubCard('Morning reading', 'Sep 24 · 7:12 AM', [100, 74], [['book-open', '1 scripture'], ['image', '1 image'], ['mic', 'Voice · 0:42']], true),
    JN.hubCard('Evening prayer', 'Sep 22 · 9:05 PM', [96, 52], [['mic', 'Voice · 1:36']]),
    JN.hubCard('Notes on Letter 15', 'Sep 19 · 6:48 AM', [98, 81], [['scroll-text', '1 letter'], ['book-open', '2 scriptures']]),
  ];
  JN.hub = (o = {}) => `<div class="screen">
      <div class="status"></div>
      <div class="topbar"><span class="iconbtn"><i data-i="chevron-left"></i></span><span class="title">Library</span></div>
      <div class="scroll">
        <div class="head"><div class="tt"><span class="h1">My Journal</span><span class="meta cnt">${o.count || '9 entries'}</span></div>
          <span class="sort"><i data-i="arrow-up-down" class="xs"></i>Newest</span></div>
        <div class="seg"><span class="on">All entries</span><span>Pinned</span></div>
        <div class="search"><i data-i="search" class="sm"></i>Search entries…</div>
        ${o.body || `<div class="entries">${JN.HUB_CARDS.join('')}</div>`}
      </div>
      ${o.fab === false ? '' : '<span class="btn primary hfab"><i data-i="square-pen" class="sm"></i>New entry</span>'}
      ${o.over || ''}
    </div>`;

  JN.fill = (id, cells) => {
    document.getElementById(id).innerHTML = cells.map(c => `<div class="cell ${c[3] || ''}"><div class="cap">${c[0]}<small>${c[1] || '&nbsp;'}</small></div>${c[2]}</div>`).join('');
  };
  window.JN = JN;
})();
