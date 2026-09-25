// Library-area mockup helper: fills placeholder-bar blocks so reading views behind sheets stay short to write.
//   <div data-lb-ph="3"></div>            -> three .ph bars (last one shorter)
//   <div data-lb-paras="5,4,6"></div>     -> paragraphs of .ph bars on the reading rhythm (.lb-lines .para)
// Widths come from a fixed seed, so every render is identical. Runs at the end of <body>, before kit.js
// converts icons on DOMContentLoaded.
(function () {
  var seed = 7;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  function bars(n, lastMin, lastMax) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var w = i === n - 1 ? Math.round(lastMin + rnd() * (lastMax - lastMin)) : Math.round(90 + rnd() * 10);
      out += '<div class="ph" style="width:' + w + '%"></div>';
    }
    return out;
  }
  document.querySelectorAll('[data-lb-ph]').forEach(function (el) {
    var n = parseInt(el.getAttribute('data-lb-ph'), 10) || 2;
    el.insertAdjacentHTML('beforeend', bars(n, 34, 68));
  });
  document.querySelectorAll('[data-lb-paras]').forEach(function (el) {
    el.classList.add('lb-lines');
    var html = '';
    el.getAttribute('data-lb-paras').split(',').forEach(function (n) {
      html += '<div class="para">' + bars(parseInt(n, 10), 38, 78) + '</div>';
    });
    el.insertAdjacentHTML('beforeend', html);
  });

  // Anchored floaters: an absolutely positioned child of .screen with
  //   data-lb-above="<selector>"  sits just above the anchor's first line box (toolbars)
  //   data-lb-below="<selector>"  sits just below the anchor's last line box (popovers)
  // data-lb-x="center|left" aligns it horizontally; --ax is set to the anchor's centre for an arrow.
  // Runs once fonts are ready (the renderer waits for the same promise before its screenshot).
  function place() {
    document.querySelectorAll('[data-lb-above],[data-lb-below]').forEach(function (fl) {
      var scr = fl.closest('.screen') || document.body;
      var sel = fl.getAttribute('data-lb-above') || fl.getAttribute('data-lb-below');
      var anchor = scr.querySelector(sel);
      if (!anchor) return;
      var sr = scr.getBoundingClientRect();
      var z = sr.width / scr.offsetWidth || 1;
      var rects = anchor.getClientRects();
      var r = fl.hasAttribute('data-lb-above') ? rects[0] : rects[rects.length - 1];
      var gap = parseFloat(fl.getAttribute('data-lb-gap') || '14');
      var top = fl.hasAttribute('data-lb-above')
        ? (r.top - sr.top) / z - fl.offsetHeight - gap
        : (r.bottom - sr.top) / z + gap;
      fl.style.top = Math.round(top) + 'px';
      var cx = (r.left + r.width / 2 - sr.left) / z;
      if (fl.getAttribute('data-lb-x') === 'center') {
        var w = fl.offsetWidth, left = Math.max(12, Math.min(cx - w / 2, scr.offsetWidth - w - 12));
        fl.style.left = Math.round(left) + 'px';
      }
      var flLeft = (fl.getBoundingClientRect().left - sr.left) / z;
      fl.style.setProperty('--ax', Math.round(Math.max(24, Math.min(cx - flLeft, fl.offsetWidth - 24))) + 'px');
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place); else place();
  });
})();
