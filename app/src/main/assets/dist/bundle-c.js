(() => {
  // app/src/main/assets/src/renderer/dom-links.js
  function applyDOMLinks() {
    document.querySelectorAll("[data-hl-key][data-hl-dom]").forEach(function(container) {
      var hlKey = container.getAttribute("data-hl-key");
      container.querySelectorAll(".inline-link-icon").forEach(function(el) {
        el.remove();
      });
      container.normalize();
      var links = LinkStore.getForKeyPrefix(hlKey);
      if (!links.length) return;
      var keyPrefix = hlKey + ":";
      var byEndPos = {};
      links.forEach(function(link) {
        var srcKey = link.source ? link.source.key : null;
        var isSourceHere = srcKey && (srcKey === hlKey || srcKey.indexOf(keyPrefix) === 0);
        [link.source, link.target].forEach(function(ep) {
          if (!ep || !ep.key) return;
          if (ep.key !== hlKey && ep.key.indexOf(keyPrefix) !== 0) return;
          var endPos = null;
          var m = ep.key.match(/:(\d+)-(\d+)$/);
          if (m) {
            endPos = parseInt(m[2], 10);
          } else if (typeof ep.end === "number") {
            endPos = ep.end;
          }
          if (endPos == null) return;
          var prev = byEndPos[endPos] || { count: 0, anySource: false };
          byEndPos[endPos] = {
            count: prev.count + 1,
            // Once any link marks this position as source, keep it source.
            anySource: prev.anySource || !!isSourceHere
          };
        });
      });
      if (Object.keys(byEndPos).length === 0) {
        var legacyAnySource = links.some(function(l) {
          return l.source && (l.source.key === hlKey || l.source.key.indexOf(keyPrefix) === 0);
        });
        container.appendChild(_buildLinkIcon(hlKey, links.length, legacyAnySource));
        return;
      }
      var positions = Object.keys(byEndPos).map(Number).sort(function(a, b) {
        return b - a;
      });
      positions.forEach(function(endPos) {
        _insertLinkIconAt(container, hlKey, endPos, byEndPos[endPos].count, byEndPos[endPos].anySource);
      });
    });
  }
  function _buildLinkIcon(hlKey, count, isSource) {
    var icon = document.createElement("span");
    icon.className = "inline-link-icon" + (isSource ? " inline-link-icon-source" : "");
    icon.title = count + " link" + (count > 1 ? "s" : "");
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    var openSidebar = function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (window.__openLinkSidebar) window.__openLinkSidebar(hlKey);
    };
    icon.addEventListener("click", openSidebar);
    icon.addEventListener("touchend", openSidebar);
    return icon;
  }
  function _insertLinkIconAt(container, hlKey, endPos, count, isSource) {
    var WORD = /[\w’'-]/;
    var CLOSE_PUNCT = /[.,;:!?)\]}"'…—]/;
    var SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon)\b/;
    function isSkip(el) {
      return el && el.nodeType === 1 && el.className && SKIP_RX.test(el.className);
    }
    function isPhraseChar(c) {
      return !!c && (WORD.test(c) || CLOSE_PUNCT.test(c));
    }
    function nextInsertionPoint(node) {
      var cur = node;
      while (cur && cur !== container) {
        var sib = cur.nextSibling;
        if (sib === null) {
          cur = cur.parentElement;
          continue;
        }
        if (isSkip(sib)) {
          cur = sib;
          continue;
        }
        return sib;
      }
      return null;
    }
    var textNodes = [];
    var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    while (w.nextNode()) textNodes.push(w.currentNode);
    var charPos = 0, nodeIdx = -1, localOffset = 0;
    for (var i = 0; i < textNodes.length; i++) {
      var nodeEnd = charPos + textNodes[i].length;
      if (endPos > charPos && endPos <= nodeEnd) {
        nodeIdx = i;
        localOffset = endPos - charPos;
        break;
      }
      charPos = nodeEnd;
    }
    if (nodeIdx < 0) {
      container.appendChild(_buildLinkIcon(hlKey, count, isSource));
      return;
    }
    var ancestor = textNodes[nodeIdx].parentElement;
    var skipAncestor = null;
    while (ancestor && ancestor !== container) {
      if (isSkip(ancestor)) skipAncestor = ancestor;
      ancestor = ancestor.parentElement;
    }
    if (skipAncestor) {
      var ref = nextInsertionPoint(skipAncestor);
      var icon = _buildLinkIcon(hlKey, count, isSource);
      if (ref) ref.parentNode.insertBefore(icon, ref);
      else container.appendChild(icon);
      return;
    }
    var BLOCK_TAGS = /^(BR|P|DIV|H[1-6]|LI|BLOCKQUOTE|HR|UL|OL|TR|TD|TH|TABLE|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|FIGURE|FIGCAPTION|PRE|ADDRESS)$/;
    function hasBlockBetween(prevTextNode, nextTextNode) {
      var bw = document.createTreeWalker(container, NodeFilter.SHOW_ALL, null, false);
      bw.currentNode = prevTextNode;
      var n;
      while (n = bw.nextNode()) {
        if (n === nextTextNode) return false;
        if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) return true;
      }
      return true;
    }
    while (true) {
      var text = textNodes[nodeIdx].nodeValue;
      while (localOffset < text.length && isPhraseChar(text[localOffset])) {
        localOffset++;
      }
      if (localOffset < text.length) break;
      var nextNodeIdx = nodeIdx + 1;
      while (nextNodeIdx < textNodes.length) {
        var na = textNodes[nextNodeIdx].parentElement;
        var inSkip = false;
        while (na && na !== container) {
          if (isSkip(na)) {
            inSkip = true;
            break;
          }
          na = na.parentElement;
        }
        if (!inSkip) break;
        nextNodeIdx++;
      }
      if (nextNodeIdx >= textNodes.length) break;
      if (hasBlockBetween(textNodes[nodeIdx], textNodes[nextNodeIdx])) break;
      nodeIdx = nextNodeIdx;
      localOffset = 0;
    }
    var finalNode = textNodes[nodeIdx];
    var finalText = finalNode.nodeValue;
    var insertBeforeNode = null;
    if (localOffset >= finalText.length) {
      insertBeforeNode = nextInsertionPoint(finalNode);
    } else if (localOffset === 0) {
      insertBeforeNode = finalNode;
    } else {
      insertBeforeNode = finalNode.splitText(localOffset);
    }
    var iconEl = _buildLinkIcon(hlKey, count, isSource);
    if (insertBeforeNode) {
      insertBeforeNode.parentNode.insertBefore(iconEl, insertBeforeNode);
    } else {
      container.appendChild(iconEl);
    }
  }

  // app/src/main/assets/src/renderer/dom-bookmarks.js
  var BOOKMARK_PULSE_WINDOW_MS = 3e3;
  function applyDOMBookmarks() {
    var nowMs = Date.now();
    document.querySelectorAll("[data-hl-key][data-hl-dom]").forEach(function(container) {
      var hlKey = container.getAttribute("data-hl-key");
      container.querySelectorAll(".inline-bookmark-icon").forEach(function(el) {
        el.remove();
      });
      container.normalize();
      var bookmarks = BookmarkStore.getForKeyPrefix(hlKey);
      if (!bookmarks.length) return;
      var bkmById = {};
      bookmarks.forEach(function(b) {
        bkmById[b.id] = b;
      });
      var keyPrefix = hlKey + ":";
      var byEndPos = {};
      bookmarks.forEach(function(bkm) {
        if (!bkm.hlKey) return;
        var k = bkm.hlKey;
        if (k !== hlKey && k.indexOf(keyPrefix) !== 0) return;
        var endPos = null;
        var m = k.match(/:(\d+)-(\d+)$/);
        if (m) {
          endPos = parseInt(m[2], 10);
        }
        if (endPos == null) {
          if (!byEndPos[-1]) byEndPos[-1] = [];
          byEndPos[-1].push(bkm.id);
          return;
        }
        if (!byEndPos[endPos]) byEndPos[endPos] = [];
        byEndPos[endPos].push(bkm.id);
      });
      function anyJustCreated(bkmIds) {
        return bkmIds.some(function(id) {
          var b = bkmById[id];
          return b && b.created && nowMs - b.created < BOOKMARK_PULSE_WINDOW_MS;
        });
      }
      if (byEndPos[-1] && byEndPos[-1].length > 0) {
        var endBlockIcon = _buildBookmarkIcon(hlKey, byEndPos[-1]);
        if (anyJustCreated(byEndPos[-1])) endBlockIcon.classList.add("just-created");
        container.appendChild(endBlockIcon);
        delete byEndPos[-1];
      }
      if (Object.keys(byEndPos).length === 0) return;
      var positions = Object.keys(byEndPos).map(Number).sort(function(a, b) {
        return b - a;
      });
      positions.forEach(function(endPos) {
        _insertBookmarkIconAt(container, hlKey, endPos, byEndPos[endPos], anyJustCreated(byEndPos[endPos]));
      });
    });
  }
  function _buildBookmarkIcon(hlKey, bkmIds) {
    var icon = document.createElement("span");
    icon.className = "inline-bookmark-icon";
    if (bkmIds && bkmIds.length > 1) icon.className += " inline-bookmark-icon-multi";
    icon.setAttribute("data-bkm-ids", (bkmIds || []).join(","));
    icon.setAttribute("data-hl-key", hlKey);
    var count = (bkmIds || []).length;
    icon.title = count === 1 ? "Bookmark" : count + " bookmarks";
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    var openIcon = function(e) {
      e.preventDefault();
      e.stopPropagation();
      var ids = (icon.getAttribute("data-bkm-ids") || "").split(",").filter(Boolean);
      if (ids.length === 1) {
        if (window.__bookmarkEdit) {
          window.__bookmarkEdit(ids[0], { atSource: true });
          return;
        }
      }
      var rect = icon.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.bottom + 4;
      if (window.__openBookmarkPopover) {
        window.__openBookmarkPopover(ids, x, y, hlKey);
      }
    };
    icon.addEventListener("click", openIcon);
    icon.addEventListener("touchend", openIcon);
    return icon;
  }
  function _insertBookmarkIconAt(container, hlKey, endPos, bkmIds, justCreated) {
    var WORD = /[\w’'-]/;
    var CLOSE_PUNCT = /[.,;:!?)\]}"'…—]/;
    var SKIP_RX = /\b(fn-ref|tap-ref|letter-link-ref|verse-link-icon|hl-note-icon|inline-link-icon|inline-bookmark-icon)\b/;
    function isSkip(el) {
      return el && el.nodeType === 1 && el.className && SKIP_RX.test(el.className);
    }
    function isPhraseChar(c) {
      return !!c && (WORD.test(c) || CLOSE_PUNCT.test(c));
    }
    function nextInsertionPoint(node) {
      var cur = node;
      while (cur && cur !== container) {
        var sib = cur.nextSibling;
        if (sib === null) {
          cur = cur.parentElement;
          continue;
        }
        if (isSkip(sib)) {
          cur = sib;
          continue;
        }
        return sib;
      }
      return null;
    }
    var textNodes = [];
    var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    while (w.nextNode()) textNodes.push(w.currentNode);
    var charPos = 0, nodeIdx = -1, localOffset = 0;
    for (var i = 0; i < textNodes.length; i++) {
      var nodeEnd = charPos + textNodes[i].length;
      if (endPos > charPos && endPos <= nodeEnd) {
        nodeIdx = i;
        localOffset = endPos - charPos;
        break;
      }
      charPos = nodeEnd;
    }
    if (nodeIdx < 0) {
      var fallbackIcon = _buildBookmarkIcon(hlKey, bkmIds);
      if (justCreated) fallbackIcon.classList.add("just-created");
      container.appendChild(fallbackIcon);
      return;
    }
    var ancestor = textNodes[nodeIdx].parentElement;
    var skipAncestor = null;
    while (ancestor && ancestor !== container) {
      if (isSkip(ancestor)) skipAncestor = ancestor;
      ancestor = ancestor.parentElement;
    }
    if (skipAncestor) {
      var ref = nextInsertionPoint(skipAncestor);
      var icon = _buildBookmarkIcon(hlKey, bkmIds);
      if (justCreated) icon.classList.add("just-created");
      if (ref) ref.parentNode.insertBefore(icon, ref);
      else container.appendChild(icon);
      return;
    }
    var BLOCK_TAGS = /^(BR|P|DIV|H[1-6]|LI|BLOCKQUOTE|HR|UL|OL|TR|TD|TH|TABLE|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|FIGURE|FIGCAPTION|PRE|ADDRESS)$/;
    function hasBlockBetween(prev, next) {
      var bw = document.createTreeWalker(container, NodeFilter.SHOW_ALL, null, false);
      bw.currentNode = prev;
      var n;
      while (n = bw.nextNode()) {
        if (n === next) return false;
        if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) return true;
      }
      return true;
    }
    while (true) {
      var text = textNodes[nodeIdx].nodeValue;
      while (localOffset < text.length && isPhraseChar(text[localOffset])) {
        localOffset++;
      }
      if (localOffset < text.length) break;
      var nextNodeIdx = nodeIdx + 1;
      while (nextNodeIdx < textNodes.length) {
        var na = textNodes[nextNodeIdx].parentElement;
        var inSkip = false;
        while (na && na !== container) {
          if (isSkip(na)) {
            inSkip = true;
            break;
          }
          na = na.parentElement;
        }
        if (!inSkip) break;
        nextNodeIdx++;
      }
      if (nextNodeIdx >= textNodes.length) break;
      if (hasBlockBetween(textNodes[nodeIdx], textNodes[nextNodeIdx])) break;
      nodeIdx = nextNodeIdx;
      localOffset = 0;
    }
    var finalNode = textNodes[nodeIdx];
    var finalText = finalNode.nodeValue;
    var insertBeforeNode = null;
    if (localOffset >= finalText.length) {
      insertBeforeNode = nextInsertionPoint(finalNode);
    } else if (localOffset === 0) {
      insertBeforeNode = finalNode;
    } else {
      insertBeforeNode = finalNode.splitText(localOffset);
    }
    var iconEl = _buildBookmarkIcon(hlKey, bkmIds);
    if (justCreated) iconEl.classList.add("just-created");
    if (insertBeforeNode) {
      insertBeforeNode.parentNode.insertBefore(iconEl, insertBeforeNode);
    } else {
      container.appendChild(iconEl);
    }
  }

  // app/src/main/assets/src/renderer/annotation-engine.jsx
  function snapRangeToWords(text, start, end) {
    if (!text || typeof text !== "string") return { start, end };
    start = Math.max(0, Math.min(start, text.length));
    end = Math.max(0, Math.min(end, text.length));
    const isWord = (c) => !!c && /[\w’’-]/.test(c);
    while (start > 0 && isWord(text[start - 1]) && isWord(text[start])) start--;
    return { start, end };
  }
  function annMarkClass(ann, isFirst, isLast) {
    const kind = ann.kind || "highlight";
    if (kind === "note") {
      return "hl-mark hl-note hl-" + ann.color + (isFirst ? " first-segment" : "") + (isLast ? " last-segment" : "");
    }
    if (kind === "underline") return "hl-mark hl-underline hl-" + ann.color;
    return "hl-mark hl-" + ann.color;
  }
  function HighlightableText({ text, hlKey, hlTick }) {
    const annotations = React.useMemo(() => AnnotationStore.get(hlKey), [hlKey, hlTick]);
    if (!text) return null;
    if (!annotations || annotations.length === 0) {
      return /* @__PURE__ */ React.createElement("span", { "data-hl-key": hlKey }, text);
    }
    const valid = annotations.map((a) => ({ ann: a, s: Math.max(0, Math.min(a.start, text.length)), e: Math.max(0, Math.min(a.end, text.length)) })).filter((v) => v.s < v.e);
    if (valid.length === 0) {
      return /* @__PURE__ */ React.createElement("span", { "data-hl-key": hlKey }, text);
    }
    const set = /* @__PURE__ */ new Set([0, text.length]);
    valid.forEach((v) => {
      set.add(v.s);
      set.add(v.e);
    });
    const positions = [...set].sort((x, y) => x - y);
    const segments = [];
    for (let i = 0; i < positions.length - 1; i++) {
      const ss = positions[i], se = positions[i + 1];
      if (ss >= se) continue;
      const active = valid.filter((v) => v.s <= ss && v.e >= se).map((v) => v.ann).sort((a, b) => a.start - b.start || (a.id || "").localeCompare(b.id || ""));
      segments.push({ start: ss, end: se, active });
    }
    const firstSegByGroup = /* @__PURE__ */ new Map();
    const lastSegByGroup = /* @__PURE__ */ new Map();
    segments.forEach((seg, idx) => {
      seg.active.forEach((a) => {
        if (!firstSegByGroup.has(a.groupId)) firstSegByGroup.set(a.groupId, idx);
        lastSegByGroup.set(a.groupId, idx);
      });
    });
    const isWordChar = (c) => !!c && /[\w’'-]/.test(c);
    segments.forEach((seg, idx) => {
      if (idx < segments.length - 1) {
        const lastCh = text[seg.end - 1];
        const nextCh = text[seg.end];
        if (isWordChar(lastCh) && isWordChar(nextCh)) seg.noBreakAfter = true;
      }
    });
    return /* @__PURE__ */ React.createElement("span", { "data-hl-key": hlKey }, segments.map((seg, segIdx) => {
      const segText = text.slice(seg.start, seg.end);
      if (seg.active.length === 0) {
        if (seg.noBreakAfter) {
          return /* @__PURE__ */ React.createElement("span", { key: "p" + segIdx, "data-no-break-after": "1" }, segText);
        }
        return /* @__PURE__ */ React.createElement(React.Fragment, { key: "p" + segIdx }, segText);
      }
      return seg.active.reduceRight((child, ann, i) => {
        const kind = ann.kind || "highlight";
        const isFirst = firstSegByGroup.get(ann.groupId) === segIdx;
        const isLast = lastSegByGroup.get(ann.groupId) === segIdx;
        const isOutermost = i === 0;
        const props = {
          key: isOutermost ? "m" + segIdx : "m" + segIdx + "_" + i,
          className: annMarkClass(ann, isFirst, isLast),
          "data-hl-id": ann.id,
          "data-group-id": ann.groupId,
          "data-kind": kind
        };
        if (isOutermost && seg.noBreakAfter) props["data-no-break-after"] = "1";
        return /* @__PURE__ */ React.createElement("mark", { ...props }, child);
      }, segText);
    }));
  }
  function findNoteIconInsertionPoint(mark) {
    const container = mark.closest("[data-hl-key]");
    if (!container) return { kind: "afterMark" };
    const boundaryRx = /[\s.,;:!?)\]}”’—-]/;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let pastMark = false;
    while (walker.nextNode()) {
      const tn = walker.currentNode;
      if (mark.contains(tn)) {
        pastMark = true;
        continue;
      }
      if (!pastMark) continue;
      const text = tn.nodeValue;
      if (text.length === 0) continue;
      if (boundaryRx.test(text[0])) return { kind: "afterMark" };
      const m = text.match(boundaryRx);
      if (m) {
        const splitAt = m.index + 1;
        if (splitAt >= text.length) return { kind: "afterMark" };
        const tail = tn.splitText(splitAt);
        return { kind: "beforeNode", node: tail };
      }
    }
    return { kind: "afterMark" };
  }
  function _markCharEnd(mark) {
    const container = mark.closest("[data-hl-key]");
    if (!container) return -1;
    try {
      const range = document.createRange();
      range.selectNodeContents(container);
      range.setEndAfter(mark);
      return range.toString().length;
    } catch (_e) {
      return -1;
    }
  }
  function applyNoteIcons() {
    document.querySelectorAll(".hl-note-icon").forEach((el) => el.remove());
    const lastByGroup = /* @__PURE__ */ new Map();
    document.querySelectorAll("mark.hl-note[data-group-id]").forEach((mark) => {
      lastByGroup.set(mark.getAttribute("data-group-id"), mark);
    });
    const groupsByTarget = /* @__PURE__ */ new Map();
    lastByGroup.forEach((mark, gid) => {
      const ip = findNoteIconInsertionPoint(mark);
      const container = mark.closest("[data-hl-key]");
      const hlKey = container ? container.getAttribute("data-hl-key") : "";
      const charEnd = _markCharEnd(mark);
      const key = hlKey + ":" + charEnd;
      if (!groupsByTarget.has(key)) groupsByTarget.set(key, []);
      groupsByTarget.get(key).push({ gid, mark, ip });
    });
    groupsByTarget.forEach((entries) => {
      const primary = entries[0];
      const allGids = entries.map((e) => e.gid);
      const container = primary.mark.closest("[data-hl-key]");
      const hlKey = container ? container.getAttribute("data-hl-key") : "";
      const colorClass = (primary.mark.className.match(/\bhl-(yellow|green|pink|red|orange|blue|purple|teal|brown|gray|cyan)\b/) || [])[0] || "";
      const icon = document.createElement("span");
      icon.className = "hl-note-icon" + (colorClass ? " " + colorClass : "") + (entries.length > 1 ? " hl-note-icon-badge" : "");
      icon.setAttribute("data-group-id", primary.gid);
      icon.setAttribute("data-group-ids", allGids.join(","));
      icon.setAttribute("data-hl-key", hlKey);
      if (entries.length > 1) icon.setAttribute("data-count", String(entries.length));
      icon.title = entries.length > 1 ? entries.length + " notes here" : "Open note";
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';
      var _openIcon = function(x, y) {
        if (entries.length > 1 && window.__showMultiNote) {
          window.__showMultiNote(allGids, x, y);
        } else if (window.__openNote) {
          window.__openNote(primary.gid);
        }
      };
      icon.addEventListener("click", function(e) {
        e.stopPropagation();
        _openIcon(e.clientX, e.clientY);
      });
      icon.addEventListener("touchend", function(e) {
        e.preventDefault();
        e.stopPropagation();
        var t = e.changedTouches && e.changedTouches[0];
        _openIcon(t ? t.clientX : 0, t ? t.clientY : 0);
      });
      const ip = primary.ip;
      const ipUsable = ip.kind === "beforeNode" && ip.node && ip.node.parentNode && container && container.contains(ip.node);
      if (ipUsable) {
        const prev = ip.node.previousSibling;
        if (prev && prev.nodeType === 3 && / $/.test(prev.nodeValue)) {
          prev.nodeValue = prev.nodeValue.replace(/ $/, "");
          ip.node.nodeValue = " " + ip.node.nodeValue;
        }
        ip.node.parentNode.insertBefore(icon, ip.node);
      } else if (primary.mark.parentNode && primary.mark.nextSibling) {
        primary.mark.parentNode.insertBefore(icon, primary.mark.nextSibling);
      } else if (primary.mark.parentNode) {
        primary.mark.parentNode.appendChild(icon);
      }
    });
  }
  function applyActiveNoteState() {
    document.querySelectorAll(".hl-note.is-active, .hl-note-icon.is-active").forEach((el) => el.classList.remove("is-active"));
    const gid = window.__activeNoteGroup;
    if (!gid) return;
    const safe = String(gid).replace(/"/g, '\\"');
    document.querySelectorAll('mark.hl-note[data-group-id="' + safe + '"], .hl-note-icon[data-group-id="' + safe + '"]').forEach((el) => el.classList.add("is-active"));
  }
  function applyDOMHighlights() {
    document.querySelectorAll("[data-hl-key]").forEach(function(container) {
      if (container.querySelector("mark.hl-mark[data-hl-id]") || container.childElementCount === 0 && container.textContent && !container.querySelector("mark.hl-dom")) {
        if (!container.hasAttribute("data-hl-dom")) return;
      }
      if (!container.hasAttribute("data-hl-dom")) return;
      var hlKey = container.getAttribute("data-hl-key");
      var existing = container.querySelectorAll("mark.hl-dom");
      for (var i = 0; i < existing.length; i++) {
        var mark = existing[i];
        var parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      }
      container.querySelectorAll(".hl-note-icon").forEach(function(el) {
        el.remove();
      });
      container.normalize();
      var anns = AnnotationStore.get(hlKey);
      if (!anns.length) return;
      var sorted = anns.slice().sort(function(a, b) {
        return a.start - b.start;
      });
      var groupCounts = {};
      sorted.forEach(function(a) {
        groupCounts[a.groupId] = (groupCounts[a.groupId] || 0) + 1;
      });
      var groupSeen = {};
      for (var hi = 0; hi < sorted.length; hi++) {
        var ann = sorted[hi];
        var seenIdx = groupSeen[ann.groupId] || 0;
        var isFirst = seenIdx === 0;
        groupSeen[ann.groupId] = seenIdx + 1;
        var kind = ann.kind || "highlight";
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        var charPos = 0;
        while (walker.nextNode()) {
          var node = walker.currentNode;
          textNodes.push({ node, start: charPos, end: charPos + node.length });
          charPos += node.length;
        }
        var lastMark = null;
        for (var ti = 0; ti < textNodes.length; ti++) {
          var tn = textNodes[ti];
          var overlapStart = Math.max(ann.start, tn.start);
          var overlapEnd = Math.min(ann.end, tn.end);
          if (overlapStart >= overlapEnd) continue;
          var localStart = overlapStart - tn.start;
          var localEnd = overlapEnd - tn.start;
          var tNode = tn.node;
          if (localEnd < tNode.length) tNode.splitText(localEnd);
          var midNode = localStart > 0 ? tNode.splitText(localStart) : tNode;
          var m = document.createElement("mark");
          var cls = "hl-mark hl-dom hl-" + ann.color;
          if (kind === "underline") cls += " hl-underline";
          else if (kind === "note") {
            cls += " hl-note";
            if (isFirst && ti === textNodes.findIndex(function(x) {
              return Math.max(ann.start, x.start) < Math.min(ann.end, x.end);
            })) cls += " first-segment";
          }
          m.className = cls;
          m.setAttribute("data-hl-id", ann.id);
          m.setAttribute("data-group-id", ann.groupId);
          m.setAttribute("data-kind", kind);
          midNode.parentNode.replaceChild(m, midNode);
          m.appendChild(midNode);
          lastMark = m;
        }
        if (kind === "note" && lastMark) lastMark.classList.add("last-segment");
        if (lastMark) {
          var fullText = container.textContent;
          var lastCh = fullText.charAt(ann.end - 1);
          var nextCh = fullText.charAt(ann.end);
          if (lastCh && nextCh && /[\w’'-]/.test(lastCh) && /[\w’'-]/.test(nextCh)) {
            lastMark.setAttribute("data-no-break-after", "1");
          }
        }
      }
    });
  }
  var StaticSubtree = class extends React.Component {
    shouldComponentUpdate() {
      return false;
    }
    render() {
      return this.props.children;
    }
  };

  // app/src/main/assets/src/renderer/_entry.js
  Object.assign(window, {
    applyDOMLinks,
    applyDOMBookmarks,
    snapRangeToWords,
    HighlightableText,
    findNoteIconInsertionPoint,
    applyNoteIcons,
    applyActiveNoteState,
    applyDOMHighlights,
    StaticSubtree
  });
})();
