// sx- area: fills every <div class="kbd"></div> with a plain on-screen keyboard (typing states only).
// Same layout as the sy- boards' keyboard so the two sets of typing states match.
document.addEventListener('DOMContentLoaded', function () {
  var rows = [
    'q w e r t y u i o p'.split(' '),
    'a s d f g h j k l'.split(' '),
    ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
    ['?123', ',', ' ', '.', 'go']
  ];
  document.querySelectorAll('.kbd').forEach(function (k) {
    var html = '';
    rows.forEach(function (r, ri) {
      html += '<div class="kr' + (ri === 1 ? ' mid' : '') + '">';
      r.forEach(function (c) {
        var cls = 'k';
        if (c === '⇧' || c === '⌫' || c === '?123' || c === ',' || c === '.') cls += ' fn';
        if (c === ' ') cls += ' space';
        // Inline svg: kit.js has already swapped the <i data-i> icons by the time this runs.
        if (c === 'go') { html += '<span class="k go"><svg class="i sm"><use href="#i-search"/></svg></span>'; return; }
        html += '<span class="' + cls + '">' + (c === ' ' ? '' : c) + '</span>';
      });
      html += '</div>';
    });
    k.innerHTML = html;
  });
});
