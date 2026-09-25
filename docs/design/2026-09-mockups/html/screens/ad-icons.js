// ad- area icon supplement: Lucide line icons the kit sprite does not carry (paths from lucide-static).
// Use as <i data-i="ad-arrow-up"></i>; kit.js turns it into <svg><use href="#i-ad-arrow-up">.
(function () {
  var a = ' viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  var sym = {
    'arrow-up': '<path d="m5 12 7-7 7 7" /><path d="M12 19V5" />',
    'arrow-down': '<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />',
    'repeat': '<path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />',
    'repeat-1': '<path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /><path d="M11 10h1v4" />',
    'minus': '<path d="M5 12h14" />',
    'ban': '<circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" />',
    'alert': '<circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />',
    'audio-lines': '<path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />',
    'delete': '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><path d="m12 9 6 6" /><path d="m18 9-6 6" />',
    'enter': '<polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" />',
    'volume': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" />',
    'chevron-up': '<path d="m18 15-6-6-6 6" />'
  };
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">';
  for (var k in sym) svg += '<symbol id="i-ad-' + k + '"' + a + '>' + sym[k] + '</symbol>';
  svg += '</svg>';
  function add() { var d = document.createElement('div'); d.innerHTML = svg; document.body.appendChild(d.firstChild); }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
