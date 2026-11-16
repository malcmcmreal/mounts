// New mount / Edit mount: search the Mineral Split Database while typing a sample's ID or its
// mineral split (vial catalogue number), and pick a vial. Picking fills the sample ID and the
// vial's catalogue number, and the mount's minerals if that box is empty.
(function () {
  var me = document.currentScript, url = me.dataset.index;
  var vials = null, loading = null, pop = null, target = null, items = [], on = -1;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load() {
    if (vials || loading) return loading;
    loading = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      vials = [];
      d.samples.forEach(function (s) {
        s[2].forEach(function (v) {
          vials.push({ id: s[1], cat: v[0], mineral: v[1], prep: v[2], t: (s[1] + ' ' + v[0] + ' ' + v[1] + ' ' + v[2]).toLowerCase() });
        });
      });
    }).catch(function () { vials = []; });
    return loading;
  }
  function field(el) {
    if (!el || !el.closest) return null;
    if (el.matches('#new-mount .sample-row [data-k=separates], #new-mount .sample-row [data-k=id]')) return el;
    if (el.matches('#log-dialog input[name=separates]')) return el;
    return null;
  }
  function close() { if (pop) pop.remove(); pop = null; target = null; on = -1; }
  function search(text) {
    var words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !vials) return [];
    var q = text.trim().toLowerCase(), out = [];
    for (var i = 0; i < vials.length && out.length < 400; i++) {
      var v = vials[i];
      if (words.every(function (w) { return v.t.indexOf(w) !== -1; })) out.push(v);
    }
    function score(v) {
      return (v.cat.toLowerCase() === q ? 0 : v.id.toLowerCase() === q ? 1 : v.cat.toLowerCase().indexOf(q) === 0 ? 2 : v.id.toLowerCase().indexOf(q) === 0 ? 3 : 4) * 2 +
        (v.prep === 'Concentrate' ? 0 : 1);
    }
    out.sort(function (a, b) { return score(a) - score(b) || a.id.localeCompare(b.id, undefined, { numeric: true }); });
    return out.slice(0, 30);
  }
  function show(el) {
    var text = el.value.trim();
    if (text.length < 2) { close(); return; }
    load().then(function () {
      if (document.activeElement !== el) return;
      items = search(text);
      if (!items.length) { close(); return; }
      var dlg = el.closest('dialog') || document.body;
      if (!pop || pop.parentNode !== dlg) { if (pop) pop.remove(); pop = document.createElement('div'); pop.className = 'split-pop'; pop.setAttribute('role', 'listbox'); dlg.appendChild(pop); }
      target = el; on = -1;
      pop.innerHTML = '<div class="muted" style="padding:.35rem .7rem">Mineral Split Database</div>' + items.map(function (v, i) {
        return '<button type="button" data-i="' + i + '"><span class="mono">' + esc(v.cat || '—') + '</span> · <span class="mono">' + esc(v.id) + '</span> · ' +
          esc(v.mineral) + (v.prep ? ' <span class="muted">' + esc(v.prep.toLowerCase()) + '</span>' : '') + '</button>';
      }).join('');
      var r = el.getBoundingClientRect(), d = dlg === document.body ? { left: 0, top: 0 } : dlg.getBoundingClientRect();
      pop.style.position = 'absolute';
      pop.style.left = (r.left - d.left + (dlg.scrollLeft || 0)) + 'px';
      pop.style.top = (r.bottom - d.top + (dlg === document.body ? window.scrollY : 0) + 2) + 'px';
      pop.style.width = Math.max(r.width, 320) + 'px';
    });
  }
  function pick(v) {
    var el = target; close();
    var row = el.closest('.sample-row');
    if (row) {
      row.querySelector('[data-k=separates]').value = v.cat;
      var idIn = row.querySelector('[data-k=id]');
      if (!idIn.value.trim() || el === idIn || idIn.dataset.fromSplit) { idIn.value = v.id; idIn.dataset.fromSplit = '1'; }
      var form = row.closest('form'), mIn = form && form.elements.minerals;
      if (mIn && (!mIn.value.trim() || mIn.dataset.fromSplit)) {
        var ms = [];
        form.querySelectorAll('.sample-row [data-k=separates]').forEach(function (s) {
          var hit = vials.filter(function (x) { return x.cat && x.cat === s.value.trim(); })[0];
          if (hit) hit.mineral.split(' + ').forEach(function (m) { if (ms.indexOf(m) === -1) ms.push(m); });
        });
        if (ms.length) { mIn.value = ms.join(', '); mIn.dataset.fromSplit = '1'; }
      }
    } else el.value = v.cat;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.addEventListener('input', function (e) {
    var el = field(e.target);
    if (!el) return;
    if (e.target.dataset.k === 'id' && e.isTrusted) delete e.target.dataset.fromSplit;
    if (e.isTrusted) show(el);
  });
  document.addEventListener('input', function (e) { if (e.target.name === 'minerals' && e.isTrusted) delete e.target.dataset.fromSplit; });
  document.addEventListener('focusin', function (e) { var el = field(e.target); if (el && el.value.trim().length >= 2) show(el); else if (!el) { if (!(pop && pop.contains(e.target))) close(); } });
  document.addEventListener('mousedown', function (e) {
    if (!pop) return;
    var b = e.target.closest('.split-pop button');
    if (b) { e.preventDefault(); pick(items[+b.dataset.i]); }
    else if (!pop.contains(e.target) && e.target !== target) close();
  });
  document.addEventListener('keydown', function (e) {
    if (!pop || e.target !== target) return;
    var bs = pop.querySelectorAll('button');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      on = Math.max(0, Math.min(bs.length - 1, on + (e.key === 'ArrowDown' ? 1 : -1)));
      bs.forEach(function (b, i) { b.classList.toggle('on', i === on); });
      bs[on].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && on >= 0) { e.preventDefault(); pick(items[on]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  document.addEventListener('focusin', function (e) { if (field(e.target)) load(); });
  document.addEventListener('scroll', function (e) { if (pop && !pop.contains(e.target)) close(); }, true);
})();
