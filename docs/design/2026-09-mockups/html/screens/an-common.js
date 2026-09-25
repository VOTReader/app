// an-common.js: anchors floating pieces (toolbar, chip, confirm) to a selection or a mark inside a scaled phone.
//   data-an-above="#id"  the floater's bottom sits data-an-gap px (default 16) above the anchor's FIRST line box
//   data-an-below="#id"  the floater's top sits data-an-gap px below the anchor's LAST line box
//   data-an-x="center"   centre on the anchor (clamped to a 14px margin); otherwise the inline left stays
// Sets --ax (the anchor's centre, relative to the floater) for the pointer. Runs after fonts are ready.
(function () {
  function place() {
    document.querySelectorAll('[data-an-above],[data-an-below]').forEach(function (fl) {
      var scr = fl.closest('.screen') || document.body;
      var above = fl.hasAttribute('data-an-above');
      var anchor = scr.querySelector(fl.getAttribute(above ? 'data-an-above' : 'data-an-below'));
      if (!anchor) return;
      var sr = scr.getBoundingClientRect();
      var z = sr.width / scr.offsetWidth || 1;
      var rects = anchor.getClientRects();
      var r = above ? rects[0] : rects[rects.length - 1];
      var gap = parseFloat(fl.getAttribute('data-an-gap') || '16');
      var top = above ? (r.top - sr.top) / z - fl.offsetHeight - gap : (r.bottom - sr.top) / z + gap;
      fl.style.top = Math.round(top) + 'px';
      var cx = (r.left + r.width / 2 - sr.left) / z;
      if (fl.getAttribute('data-an-x') === 'center') {
        var w = fl.offsetWidth;
        fl.style.left = Math.round(Math.max(14, Math.min(cx - w / 2, scr.offsetWidth - w - 14))) + 'px';
      }
      var flLeft = (fl.getBoundingClientRect().left - sr.left) / z;
      fl.style.setProperty('--ax', Math.round(Math.max(26, Math.min(cx - flLeft, fl.offsetWidth - 26))) + 'px');
    });
    // data-an-ax="#id": a floater drawn in flow (full-size board cells) only needs its pointer aimed at the anchor
    document.querySelectorAll('[data-an-ax]').forEach(function (fl) {
      var anchor = document.querySelector(fl.getAttribute('data-an-ax'));
      if (!anchor) return;
      var r = anchor.getClientRects()[0], fr = fl.getBoundingClientRect();
      var z = fr.width / fl.offsetWidth || 1;
      var cx = (r.left + r.width / 2 - fr.left) / z;
      fl.style.setProperty('--ax', Math.round(Math.max(26, Math.min(cx, fl.offsetWidth - 26))) + 'px');
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place); else place();
  });
})();
