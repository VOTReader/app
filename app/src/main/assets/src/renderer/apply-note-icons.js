/* findNoteIconInsertionPoint — Find the nearest word-boundary insertion point AFTER a mark. */
function findNoteIconInsertionPoint(mark) {
  const container = mark.closest('[data-hl-key]');
  if (!container) return { kind: 'afterMark' };
  const boundaryRx = /[\s.,;:!?)\]}”’—\-]/;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  let pastMark = false;
  while (walker.nextNode()) {
    const tn = walker.currentNode;
    if (mark.contains(tn)) { pastMark = true; continue; }
    if (!pastMark) continue;
    const text = tn.nodeValue;
    if (text.length === 0) continue;
    if (boundaryRx.test(text[0])) return { kind: 'afterMark' };
    const m = text.match(boundaryRx);
    if (m) {
      const splitAt = m.index + 1;
      if (splitAt >= text.length) return { kind: 'afterMark' };
      const tail = tn.splitText(splitAt);
      return { kind: 'beforeNode', node: tail };
    }
  }
  return { kind: 'afterMark' };
}

/* _markCharEnd — Char offset from container start to position immediately AFTER a mark. */
function _markCharEnd(mark) {
  const container = mark.closest('[data-hl-key]');
  if (!container) return -1;
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEndAfter(mark);
    return range.toString().length;
  } catch (e) { return -1; }
}

/* applyNoteIcons — places one 📝 icon per note group at the nearest
   word boundary after the group's last segment. */
function applyNoteIcons() {
  document.querySelectorAll('.hl-note-icon').forEach(el => el.remove());
  const lastByGroup = new Map();
  document.querySelectorAll('mark.hl-note[data-group-id]').forEach(mark => {
    lastByGroup.set(mark.getAttribute('data-group-id'), mark);
  });
  const groupsByTarget = new Map();
  lastByGroup.forEach((mark, gid) => {
    const ip = findNoteIconInsertionPoint(mark);
    const container = mark.closest('[data-hl-key]');
    const hlKey = container ? container.getAttribute('data-hl-key') : '';
    const charEnd = _markCharEnd(mark);
    const key = hlKey + ':' + charEnd;
    if (!groupsByTarget.has(key)) groupsByTarget.set(key, []);
    groupsByTarget.get(key).push({ gid, mark, ip });
  });

  groupsByTarget.forEach(entries => {
    const primary = entries[0];
    const allGids = entries.map(e => e.gid);
    const container = primary.mark.closest('[data-hl-key]');
    const hlKey = container ? container.getAttribute('data-hl-key') : '';
    const colorClass = (primary.mark.className.match(/\bhl-(yellow|green|pink|red|orange|blue|purple|teal|brown|gray|cyan)\b/) || [])[0] || '';
    const icon = document.createElement('span');
    icon.className = 'hl-note-icon' + (colorClass ? ' ' + colorClass : '') + (entries.length > 1 ? ' hl-note-icon-badge' : '');
    icon.setAttribute('data-group-id', primary.gid);
    icon.setAttribute('data-group-ids', allGids.join(','));
    icon.setAttribute('data-hl-key', hlKey);
    if (entries.length > 1) icon.setAttribute('data-count', String(entries.length));
    icon.title = entries.length > 1 ? (entries.length + ' notes here') : 'Open note';
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';
    var _openIcon = function(x, y) {
      if (entries.length > 1 && window.__showMultiNote) {
        window.__showMultiNote(allGids, x, y);
      } else if (window.__openNote) {
        window.__openNote(primary.gid);
      }
    };
    icon.addEventListener('click', function(e) {
      e.stopPropagation();
      _openIcon(e.clientX, e.clientY);
    });
    icon.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var t = e.changedTouches && e.changedTouches[0];
      _openIcon(t ? t.clientX : 0, t ? t.clientY : 0);
    });
    const ip = primary.ip;
    if (ip.kind === 'beforeNode' && ip.node && ip.node.parentNode) {
      const prev = ip.node.previousSibling;
      if (prev && prev.nodeType === 3 && / $/.test(prev.nodeValue)) {
        prev.nodeValue = prev.nodeValue.replace(/ $/, '');
        ip.node.nodeValue = ' ' + ip.node.nodeValue;
      }
      ip.node.parentNode.insertBefore(icon, ip.node);
    } else if (primary.mark.nextSibling) {
      primary.mark.parentNode.insertBefore(icon, primary.mark.nextSibling);
    } else {
      primary.mark.parentNode.appendChild(icon);
    }
  });
}

function applyActiveNoteState() {
  document.querySelectorAll('.hl-note.is-active, .hl-note-icon.is-active')
    .forEach(el => el.classList.remove('is-active'));
  const gid = window.__activeNoteGroup;
  if (!gid) return;
  const safe = String(gid).replace(/"/g, '\\"');
  document.querySelectorAll('mark.hl-note[data-group-id="' + safe + '"], .hl-note-icon[data-group-id="' + safe + '"]')
    .forEach(el => el.classList.add('is-active'));
}
