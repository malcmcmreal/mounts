// Pull list: samples picked for pulling vials from the drawers later. Kept in this browser
// (localStorage) across pages; a small button bottom right opens the list (/pull/).
(function () {
  var KEY = 'mnts-pull-list', me = document.currentScript, base = (me && me.dataset.base) || '/';
  var fns = [];
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  var list = read();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    fns.forEach(function (f) { f(list.slice()); });
    badge();
  }
  window.PullList = {
    get: function () { return list.slice(); },
    has: function (slug) { return list.indexOf(slug) !== -1; },
    add: function (slugs) { (Array.isArray(slugs) ? slugs : [slugs]).forEach(function (s) { if (s && list.indexOf(s) === -1) list.push(s); }); save(); },
    remove: function (slugs) { (Array.isArray(slugs) ? slugs : [slugs]).forEach(function (s) { var i = list.indexOf(s); if (i !== -1) list.splice(i, 1); }); save(); },
    toggle: function (slug, on) { if (on) this.add(slug); else this.remove(slug); },
    clear: function () { list = []; save(); },
    onChange: function (f) { fns.push(f); }
  };
  window.addEventListener('storage', function (e) { if (e.key === KEY) { list = read(); fns.forEach(function (f) { f(list.slice()); }); badge(); } });

  var btn;
  function badge() {
    if (document.body.dataset.page === 'pull' || document.body.dataset.page === 'ternary') return;
    if (!btn) {
      btn = document.createElement('a');
      btn.className = 'pull-badge';
      btn.href = base + 'pull/';
      document.body.appendChild(btn);
    }
    btn.hidden = !list.length;
    btn.innerHTML = '<span aria-hidden="true">☰</span> Pull list <strong>' + list.length + '</strong> sample' + (list.length === 1 ? '' : 's');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge); else badge();
})();
