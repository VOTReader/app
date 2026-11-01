/* Page-side counters for tools/leak-walk.mjs (leak hunt, 2026-11-01).
   Injected before any app script (evaluateOnNewDocument). Keeps one live record, with
   the creating stack, per: listener on window / document / <html> / <body> /
   visualViewport / a MediaQueryList / a worker / a channel; interval; timeout of
   1 s or more (shorter ones are deferrals); pending animation frame; observing
   Resize/Intersection/MutationObserver; BroadcastChannel; open IndexedDB
   connection; unrevoked object URL. window.__leak.snapshot() returns them. */
(function () {
  if (window.__leak) return;
  var seq = 0;
  var live = new Map(); // id -> {kind, desc, stack}
  function stack() { var s = (new Error().stack || '').split('\n').slice(3, 9).map(function (l) { return l.trim(); }).join(' | '); return s; }
  function add(kind, desc) { var id = ++seq; live.set(id, { kind: kind, desc: desc, stack: stack() }); return id; }
  window.__leak = {
    live: live,
    snapshot: function () {
      var out = {};
      live.forEach(function (v, id) { out[id] = v; });
      return out;
    },
    counts: function () { var c = {}; live.forEach(function (v) { c[v.kind] = (c[v.kind] || 0) + 1; }); return c; },
  };
  // listeners on window/document/visualViewport/matchMedia
  var listeners = new Map(); // key -> id
  var keyOf = function (t, type, _fn, opts) {
    var cap = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    var tk = t === window ? 'window' : t === document ? 'document' : (t && t.constructor && t.constructor.name);
    return { tk: tk, k: type + '|' + cap };
  };
  var tracked = function (t) { return t === window || t === document || t === document.documentElement || t === document.body || (window.visualViewport && t === window.visualViewport) || (typeof MediaQueryList !== 'undefined' && t instanceof MediaQueryList) || (typeof Worker !== 'undefined' && t instanceof Worker) || (typeof BroadcastChannel !== 'undefined' && t instanceof BroadcastChannel); };
  var fnIds = new WeakMap(); var fnSeq = 0;
  var fid = function (f) { if (!f || (typeof f !== 'function' && typeof f !== 'object')) return 'x'; var i = fnIds.get(f); if (!i) { i = ++fnSeq; fnIds.set(f, i); } return i; };
  var tIds = new WeakMap(); var tSeq = 0;
  var tid = function (t) { var i = tIds.get(t); if (!i) { i = ++tSeq; tIds.set(t, i); } return i; };
  var oAdd = EventTarget.prototype.addEventListener, oRem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (fn && tracked(this)) {
      var k = keyOf(this, type, fn, opts); var key = tid(this) + '|' + k.k + '|' + fid(fn);
      if (!listeners.has(key)) {
        var id = add('listener', k.tk + ':' + type);
        listeners.set(key, id);
        if (opts && typeof opts === 'object' && opts.signal) { var sig = opts.signal; var kk = key; sig.addEventListener('abort', function () { var i = listeners.get(kk); if (i) { live.delete(i); listeners.delete(kk); } }); }
      }
    }
    return oAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    if (fn && tracked(this)) {
      var k = keyOf(this, type, fn, opts); var key = tid(this) + '|' + k.k + '|' + fid(fn);
      var id = listeners.get(key); if (id) { live.delete(id); listeners.delete(key); }
    }
    return oRem.call(this, type, fn, opts);
  };
  if (typeof MediaQueryList !== 'undefined') {
    MediaQueryList.prototype.addListener = function (fn) { return this.addEventListener('change', fn); };
    MediaQueryList.prototype.removeListener = function (fn) { return this.removeEventListener('change', fn); };
  }
  // timers
  var oSI = window.setInterval, oCI = window.clearInterval, oST = window.setTimeout, oCT = window.clearTimeout;
  var timers = new Map();
  window.setInterval = function (fn, ms) { var h = oSI.apply(window, arguments); timers.set(h, add('interval', 'interval ' + ms)); return h; };
  window.clearInterval = function (h) { var i = timers.get(h); if (i) { live.delete(i); timers.delete(h); } return oCI.call(window, h); };
  window.setTimeout = function (fn, ms) {
    var args = [].slice.call(arguments, 2); var h;
    var wrapped = typeof fn === 'function' ? function () { var i = timers.get(h); if (i) { live.delete(i); timers.delete(h); } return fn.apply(this, args); } : fn;
    h = oST.call(window, wrapped, ms);
    if ((ms | 0) >= 1000) timers.set(h, add('timeout', 'timeout ' + ms));
    return h;
  };
  window.clearTimeout = function (h) { var i = timers.get(h); if (i) { live.delete(i); timers.delete(h); } return oCT.call(window, h); };
  // rAF: count chains - a rAF scheduled from within a rAF callback continuing
  var oRAF = window.requestAnimationFrame, oCAF = window.cancelAnimationFrame; var rafs = new Map();
  window.requestAnimationFrame = function (fn) { var h; h = oRAF.call(window, function (t) { var i = rafs.get(h); if (i) { live.delete(i); rafs.delete(h); } return fn(t); }); rafs.set(h, add('raf', 'raf')); return h; };
  window.cancelAnimationFrame = function (h) { var i = rafs.get(h); if (i) { live.delete(i); rafs.delete(h); } return oCAF.call(window, h); };
  // observers
  ['ResizeObserver', 'IntersectionObserver', 'MutationObserver'].forEach(function (name) {
    var O = window[name]; if (!O) return;
    var obsIds = new WeakMap();
    var oObs = O.prototype.observe, oDis = O.prototype.disconnect, oUn = O.prototype.unobserve;
    O.prototype.observe = function (t) {
      var st = obsIds.get(this); if (!st) { st = { id: 0, n: new Set() }; obsIds.set(this, st); }
      st.n.add(t); if (!st.id) st.id = add('observer', name);
      return oObs.apply(this, arguments);
    };
    O.prototype.disconnect = function () { var st = obsIds.get(this); if (st && st.id) { live.delete(st.id); st.id = 0; st.n.clear(); } return oDis.apply(this, arguments); };
    if (oUn) O.prototype.unobserve = function (t) { var st = obsIds.get(this); if (st) { st.n.delete(t); if (!st.n.size && st.id) { live.delete(st.id); st.id = 0; } } return oUn.apply(this, arguments); };
  });
  // BroadcastChannel
  if (window.BroadcastChannel) {
    var OB = window.BroadcastChannel; var bcIds = new WeakMap();
    window.BroadcastChannel = function (n) { var b = new OB(n); bcIds.set(b, add('broadcast', 'bc ' + n)); return b; };
    window.BroadcastChannel.prototype = OB.prototype;
    var oClose = OB.prototype.close; OB.prototype.close = function () { var i = bcIds.get(this); if (i) { live.delete(i); bcIds.delete(this); } return oClose.apply(this, arguments); };
  }
  // IndexedDB
  if (window.indexedDB) {
    var oOpen = IDBFactory.prototype.open; var dbIds = new WeakMap();
    IDBFactory.prototype.open = function (name) {
      var req = oOpen.apply(this, arguments); var st = stack();
      req.addEventListener('success', function () { var db = req.result; var id = ++seq; live.set(id, { kind: 'idb', desc: 'idb ' + name, stack: st }); dbIds.set(db, id); db.addEventListener('close', function () { live.delete(id); }); });
      return req;
    };
    var oDbClose = IDBDatabase.prototype.close; IDBDatabase.prototype.close = function () { var i = dbIds.get(this); if (i) live.delete(i); return oDbClose.apply(this, arguments); };
  }
  // object URLs
  var oCU = URL.createObjectURL, oRU = URL.revokeObjectURL; var urls = new Map();
  URL.createObjectURL = function (b) { var u = oCU.call(URL, b); urls.set(u, add('objecturl', 'url ' + (b && b.type))); return u; };
  URL.revokeObjectURL = function (u) { var i = urls.get(u); if (i) { live.delete(i); urls.delete(u); } return oRU.call(URL, u); };
})();
