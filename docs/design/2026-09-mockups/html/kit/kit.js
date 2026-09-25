// Mockup kit runtime: theme from ?theme=, icon sprite, status bar, and a small icon helper.
(function () {
  const q = new URLSearchParams(location.search);
  document.documentElement.setAttribute('data-theme', q.get('theme') === 'light' ? 'light' : 'dark');
  const base = document.currentScript.src.replace(/kit\.js.*$/, '');
  fetch(base + 'icons.svg').then(r => r.text()).then(svg => {
    const inject = () => {
      const d = document.createElement('div'); d.innerHTML = svg; document.body.prepend(d.firstElementChild);
      document.documentElement.dataset.ready = '1';
    };
    if (document.body && document.readyState !== 'loading') inject(); else document.addEventListener('DOMContentLoaded', inject);
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.status').forEach(s => {
      s.innerHTML = `<span>${s.dataset.time || '9:41'}</span><span class="sys"><svg class="i"><use href="#i-signal"/></svg><svg class="i"><use href="#i-wifi"/></svg><svg class="i"><use href="#i-battery-full"/></svg></span>`;
    });
    // <i data-i="name" class="sm"></i>  ->  inline sprite reference
    document.querySelectorAll('i[data-i]').forEach(el => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'i ' + (el.className || ''));
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-' + el.dataset.i); svg.appendChild(use);
      if (el.style.cssText) svg.style.cssText = el.style.cssText;
      el.replaceWith(svg);
    });
  });
})();
