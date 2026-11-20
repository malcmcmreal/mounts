// Pull list page: every vial of the picked samples, sorted for walking the cabinet
// (drawer, row A→N, column 01→36), with a summary per drawer, print and .xlsx download.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/';
  var tbody = document.getElementById('pull-rows'), sum = document.getElementById('pull-summary');
  var selM = document.getElementById('pull-mineral'), selP = document.getElementById('pull-prep'), found = document.getElementById('pull-found');
  var q = document.getElementById('pull-q'), selC = document.getElementById('pull-country'), selJ = document.getElementById('pull-projsel');
  var qLo = document.getElementById('qty-lo'), qHi = document.getElementById('qty-hi'), qUn = document.getElementById('qty-unrated'),
    qOut = document.getElementById('qty-out'), qFill = document.getElementById('qty-fill');
  var resetBtn = document.getElementById('pull-reset'), trimWrap = document.getElementById('pull-trim-wrap'), trimNote = document.getElementById('pull-trim-note');
  var sortKey = 'drawer', sortDir = 1, shownSlugs = [];
  try { var ss = JSON.parse(localStorage.getItem('mnts-pull-sort') || 'null'); if (ss) { sortKey = ss[0]; sortDir = ss[1]; } } catch (e) {}
  function amtOn() { return +qLo.value > 0 || +qHi.value < 5 || !qUn.checked; }
  var index = {}, rows = [], trays = null, projects = [];
  var cab = document.getElementById('pull-cabinet'), dlg = document.getElementById('pull-drawer');
  var SHORT = { Apatite: 'Ap', Zircon: 'Zr', Titanite: 'Ti' };
  function tone(m) { m = (m || '').split(' + ')[0]; return m === 'Apatite' ? 'ap' : m === 'Zircon' ? 'zr' : m === 'Titanite' ? 'ti' : 'o'; }
  function norm(c) { c = String(c || '').toUpperCase().replace(/\s+/g, ''); var m = /^(\d+)([A-Z])(\d+)$/.exec(c); return m ? (+m[1]) + m[2] + ('0' + +m[3]).slice(-2) : c; }
  function mchip(v) {
    var t = tone(v[1]), parts = v[1].split(' + ');
    return '<span class="vchip m-' + (t === 'o' ? 'other' : t) + (parts[1] ? ' m2-' + ({ Apatite: 'ap', Zircon: 'zr', Titanite: 'ti' }[parts[1]] || 'other') : '') + (v[2] === 'Concentrate' ? ' conc' : '') + '">' + esc(v[1]) + '</span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function parse(cat) { var m = /^(\d+)([A-Z])(\d+)/.exec(cat || ''); return m ? { d: +m[1], r: m[2], c: +m[3] } : null; }
  function amount(q) { return q === 'missing' ? 'Not found' : q === '' || q == null ? '' : q + '/5'; }
  function build() {
    var m = selM.value, p = selP.value, slugs = PullList.get(), out = [], missingSamples = [], dropped = 0;
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean), c = selC.value, pj = selJ.value, amt = amtOn(), lo = +qLo.value, hi = +qHi.value;
    var filtering = !!(m || p || words.length || c || pj || amt);
    slugs.forEach(function (slug) {
      var s = index[slug];
      if (!s) { missingSamples.push(slug); return; }
      if ((c && (s[7] || '-') !== c) || (pj && (s[10] || '-') !== pj)) { dropped++; return; }
      var any = false, merged = [], byCat = {};
      s[2].forEach(function (v) {   // a mixed vial is listed once per mineral: show it once
        var k = v[0] && byCat[v[0]];
        if (k && k[2] === v[2]) { if (k[1].split(' + ').indexOf(v[1]) === -1) k[1] += ' + ' + v[1]; return; }
        var c = v.slice(); merged.push(c); if (v[0]) byCat[v[0]] = c;
      });
      merged.forEach(function (v) {
        var ms = v[1].split(' + ');
        if (m && !(m === 'Other' ? !/^(Apatite|Zircon|Titanite)$/.test(ms[0]) : ms.indexOf(m) !== -1)) return;
        if (p && v[2] !== p) return;
        if (found.checked && v[3] === 'missing') return;
        if (amt && (typeof v[3] === 'number' ? v[3] < lo || v[3] > hi : !qUn.checked || v[3] === 'missing')) return;
        if (words.length) {
          var t = [s[1], v[0], v[1], v[2], s[7] || '', s[10] || '', s[3] || '', v[4] || ''].join(' ').toLowerCase();
          if (!words.every(function (w) { return t.indexOf(w) !== -1; })) return;
        }
        var at = parse(v[0]);
        out.push({ s: s, v: v, at: at, pos: v[4] || (at ? at.r + ('0' + at.c).slice(-2) : '') });
        any = true;
      });
      if (!any) { if (filtering) dropped++; else out.push({ s: s, v: null, at: null, pos: '' }); }
    });
    var walk = function (a, b) {
      if (!a.at || !b.at) return (a.at ? 0 : 1) - (b.at ? 0 : 1) || a.s[1].localeCompare(b.s[1], undefined, { numeric: true });
      return a.at.d - b.at.d || a.at.r.localeCompare(b.at.r) || a.at.c - b.at.c;
    };
    var txt = function (x, y) { return String(x || '').localeCompare(String(y || ''), undefined, { numeric: true, sensitivity: 'base' }); };
    var empty = function (x) { return x === '' || x == null; };
    var by = {
      drawer: walk, cat: walk,
      pos: function (a, b) { return (a.at ? 0 : 1) - (b.at ? 0 : 1) || (a.at && b.at ? a.at.r.localeCompare(b.at.r) || a.at.c - b.at.c || a.at.d - b.at.d : 0); },
      sample: function (a, b) { return txt(a.s[1], b.s[1]); },
      mineral: function (a, b) { return txt(a.v && a.v[1], b.v && b.v[1]); },
      split: function (a, b) { return txt(a.v && a.v[2], b.v && b.v[2]); },
      amount: function (a, b) { var x = a.v && typeof a.v[3] === 'number' ? a.v[3] : -1, y = b.v && typeof b.v[3] === 'number' ? b.v[3] : -1; return x - y; },
      country: function (a, b) { return txt(a.s[7], b.s[7]); },
      project: function (a, b) { return txt(a.s[10], b.s[10]); }
    }[sortKey] || walk;
    var blankLast = { country: function (o) { return empty(o.s[7]); }, project: function (o) { return empty(o.s[10]); }, amount: function (o) { return !o.v || typeof o.v[3] !== 'number'; } }[sortKey];
    out.sort(function (a, b) {
      if (blankLast) { var ea = blankLast(a) ? 1 : 0, eb = blankLast(b) ? 1 : 0; if (ea !== eb) return ea - eb; }
      return sortDir * by(a, b) || walk(a, b);
    });
    rows = out;
    var grouped = (sortKey === 'drawer' || sortKey === 'cat') && sortDir === 1;
    document.querySelectorAll('.pull-table .sort').forEach(function (b) {
      var on = b.dataset.sort === sortKey;
      b.classList.toggle('on', on); b.setAttribute('aria-sort', on ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');
      b.dataset.dir = on ? (sortDir === 1 ? '▲' : '▼') : '';
    });
    resetBtn.hidden = !(filtering || !found.checked);
    shownSlugs = []; var seenS = {};
    out.forEach(function (o) { if (!seenS[o.s[0]]) { seenS[o.s[0]] = 1; shownSlugs.push(o.s[0]); } });
    trimWrap.hidden = !(filtering && dropped);
    trimNote.textContent = dropped ? dropped + ' sample' + (dropped === 1 ? ' has' : 's have') + ' no vials matching the filters' : '';
    var html = '', prevD = null, drawers = {};
    out.forEach(function (o) {
      var d = o.at ? o.at.d : null;
      if (grouped && d !== prevD) {
        html += '<tr class="group-row"><th colspan="10">' + (d != null ? '<button type="button" class="link-btn" data-drawer="' + d + '">Drawer ' + d + '</button>' : 'No vial position') + '</th></tr>';
        prevD = d;
      }
      if (d != null && o.v) drawers[d] = (drawers[d] || 0) + 1;
      var s = o.s, v = o.v;
      var go = v && d != null ? ' data-show="' + esc(v[0]) + '"' : '';
      html += '<tr><td class="mono">' + (d != null ? d : '') + '</td>' +
        '<td>' + (go ? '<button type="button" class="loc-btn mono"' + go + ' title="Show where this vial is in drawer ' + d + '">' + esc(o.pos) + '</button>' : '') + '</td>' +
        '<td>' + (go ? '<button type="button" class="loc-btn mono"' + go + ' title="Show where this vial is in drawer ' + d + '">' + esc(v[0]) + '</button>' : esc(v ? v[0] : '')) + '</td>' +
        '<td><a class="mono" href="' + base + 's/' + encodeURIComponent(s[0]) + '/">' + esc(s[1]) + '</a></td>' +
        '<td>' + (v ? mchip(v) : '<span class="muted small">No vials match the filters</span>') + '</td><td>' + esc(v ? v[2] : '') + '</td>' +
        '<td class="small">' + (v ? esc(amount(v[3])) : '') + '</td><td class="small">' + esc(s[7]) + '</td><td class="small">' + esc(s[10] || '') + '</td>' +
        '<td class="no-print"><button type="button" class="link-btn small" data-remove="' + esc(s[0]) + '" title="Take ' + esc(s[1]) + ' off the pull list">Remove</button></td></tr>';
    });
    if (slugs.length && !out.length) html = '<tr><td colspan="10" class="muted">No vials on the list match these filters.</td></tr>';
    if (!slugs.length) html = '<tr><td colspan="10" class="muted">The pull list is empty. Tick samples in the <a href="' + base + 'samples/">Mineral Split Database</a> or pick them on the <a href="' + base + 'samples/map/">map</a>.</td></tr>';
    tbody.innerHTML = html;
    cabinet(out);
    var vials = out.filter(function (o) { return o.v; }).length, ds = Object.keys(drawers);
    sum.innerHTML = '<div class="stat"><strong>' + (filtering ? shownSlugs.length + '<small class="muted"> / ' + slugs.length + '</small>' : slugs.length) + '</strong><span>samples' + (filtering ? ' shown' : '') + '</span></div><div class="stat"><strong>' + vials + '</strong><span>vials</span></div>' +
      '<div class="stat"><strong>' + ds.length + '</strong><span>drawer' + (ds.length === 1 ? '' : 's') + '</span></div>' +
      (ds.length ? '<div class="stat wide"><strong class="small">' + ds.map(function (d) { return 'Drawer ' + d + ' <span class="muted">' + drawers[d] + '</span>'; }).join(' · ') + '</strong><span>vials per drawer</span></div>' : '') +
      (missingSamples.length ? '<div class="stat wide"><strong class="small">' + missingSamples.map(esc).join(', ') + '</strong><span>no longer in the database</span></div>' : '');
  }
  tbody.addEventListener('click', function (e) {
    var b = e.target.closest('[data-remove]'); if (b) { PullList.remove(b.dataset.remove); return; }
    var sh = e.target.closest('[data-show]'); if (sh) { show(+/^(\d+)/.exec(sh.dataset.show)[1], sh.dataset.show); return; }
    var dr = e.target.closest('[data-drawer]'); if (dr) show(+dr.dataset.drawer);
  });
  cab.addEventListener('click', function (e) { var a = e.target.closest('[data-drawer]'); if (a) show(+a.dataset.drawer); });

  // ---- cabinet at a glance: drawers holding vials on the list ----
  function cabinet(out) {
    var st = {};
    out.forEach(function (o) {
      if (!o.v || !o.at) return;
      var x = st[o.at.d] || (st[o.at.d] = { n: 0, ap: 0, zr: 0, ti: 0, o: 0 });
      x.n++; x[tone(o.v[1])]++;
    });
    var max = 44, html = '';
    Object.keys(st).forEach(function (d) { if (+d > max) max = +d; });
    var R = Math.ceil(max / 3);
    for (var c = 0; c < 3; c++) {
      html += '<div class="cab-col">';
      for (var r = 1; r <= R; r++) {
        var d = c * R + r, x = st[d];
        if (d > max) { html += '<div class="drawer none" aria-hidden="true"></div>'; continue; }
        if (!x) { html += '<div class="drawer empty"><span class="dnum">' + d + '</span><span></span><span></span></div>'; continue; }
        html += '<button type="button" class="drawer has-pull" data-drawer="' + d + '" title="Show the ' + x.n + ' vial' + (x.n === 1 ? '' : 's') + ' to pull in drawer ' + d + '">' +
          '<span class="dnum">' + d + '</span><span class="dbar">' + ['ap', 'zr', 'ti', 'o'].map(function (k) { return x[k] ? '<i class="m-' + k + '" style="flex:' + x[k] + '"></i>' : ''; }).join('') + '</span>' +
          '<span class="dstat">' + x.n + ' <small>vial' + (x.n === 1 ? '' : 's') + '</small></span></button>';
      }
      html += '</div>';
    }
    cab.innerHTML = Object.keys(st).length ? html : '';
    cab.parentNode.hidden = !Object.keys(st).length;
  }

  // ---- pop-up: one drawer, the list's vials coloured, the clicked one ringed ----
  var S = 17, RD = 5.5, LM = 22, BM = 20, TM = 6;
  function show(d, cat) {
    if (!trays) return;
    var t = trays.trays[String(d)], want = {}, hit = cat ? norm(cat) : null, hitPos = '', hitSample = '';
    rows.forEach(function (o) { if (o.v && o.at && o.at.d === d) want[norm(o.v[0])] = o; });
    document.getElementById('pd-title').textContent = 'Drawer ' + d;
    document.getElementById('pd-open').href = base + 'drawer/' + d + '/';
    if (!t) { document.getElementById('pd-tray').innerHTML = '<p class="muted small">No positions recorded for this drawer.</p>'; dlg.showModal(); return; }
    var cols = t.cols, nr = trays.rows.length, w = LM + cols * S + 4, h = TM + nr * S + BM, at = {};
    t.v.forEach(function (v) { at[v[0] + ',' + v[1]] = v; });
    var out = ['<svg class="tray-svg pop" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Drawer ' + d + '">'], ring = '';
    for (var r = 0; r < nr; r++) {
      var y = TM + (nr - 1 - r) * S + S / 2;
      out.push('<text class="tray-lab" x="' + (LM - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + trays.rows[r] + '</text>');
      for (var c = 0; c < cols; c++) {
        var x = LM + c * S + S / 2, v = at[r + ',' + c], pos = trays.rows[r] + ('0' + (c + 1)).slice(-2);
        if (!v) { out.push('<circle class="tray-empty" cx="' + x + '" cy="' + y + '" r="' + (RD - 1.5) + '"/>'); continue; }
        var o = want[norm(v[2])], title = esc((v[8] || v[3]) + ' · ' + v[2] + ' · ' + pos);
        if (o) out.push('<circle class="tray-own m-' + v[4] + (v[5] ? ' conc' : '') + '" cx="' + x + '" cy="' + y + '" r="' + RD + '"><title>' + title + '</title></circle>');
        else out.push('<circle class="tray-other" cx="' + x + '" cy="' + y + '" r="' + (RD - 1) + '"><title>' + title + '</title></circle>');
        if (hit && norm(v[2]) === hit) {
          ring = '<circle class="tray-hit" cx="' + x + '" cy="' + y + '" r="' + (RD + 3.5) + '"/>' +
            '<line class="tray-hit-line" x1="' + LM + '" x2="' + (x - RD - 3.5) + '" y1="' + y + '" y2="' + y + '"/>' +
            '<line class="tray-hit-line" x1="' + x + '" x2="' + x + '" y1="' + (y + RD + 3.5) + '" y2="' + (h - BM + 2) + '"/>';
          hitPos = pos; hitSample = v[8] || v[3];
        }
      }
    }
    for (var c2 = 0; c2 < cols; c2++)
      out.push('<text class="tray-lab col" x="' + (LM + c2 * S + S / 2) + '" y="' + (h - 5) + '" text-anchor="middle">' + ('0' + (c2 + 1)).slice(-2) + '</text>');
    out.push(ring + '</svg>');
    document.getElementById('pd-tray').innerHTML = out.join('');
    var n = Object.keys(want).length;
    document.getElementById('pd-sub').innerHTML = (hit ? '<strong class="mono">' + esc(cat) + '</strong> · ' + esc(hitSample) + ' · row <strong class="mono">' + esc(hitPos.charAt(0)) + '</strong>, column <strong class="mono">' + esc(hitPos.slice(1)) + '</strong>. ' : '') +
      n + ' vial' + (n === 1 ? '' : 's') + ' on the pull list in this drawer.';
    dlg.showModal();
  }
  document.getElementById('pd-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  fetch(me.dataset.trays).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { trays = d; }).catch(function () {});
  [selM, selP, found, selC, selJ, qUn].forEach(function (el) { el.addEventListener('change', build); });
  var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(build, 120); });
  function qty(e) {
    if (+qLo.value > +qHi.value) { if (e && e.target === qLo) qHi.value = qLo.value; else qLo.value = qHi.value; }
    qOut.textContent = qLo.value === qHi.value ? qLo.value : qLo.value + '–' + qHi.value;
    qFill.style.left = (qLo.value * 20) + '%'; qFill.style.right = ((5 - qHi.value) * 20) + '%';
  }
  [qLo, qHi].forEach(function (el) { el.addEventListener('input', function (e) { qty(e); clearTimeout(t); t = setTimeout(build, 80); }); });
  qty();
  resetBtn.addEventListener('click', function () {
    q.value = ''; selM.value = ''; selP.value = ''; selC.value = ''; selJ.value = ''; found.checked = true;
    qLo.value = 0; qHi.value = 5; qUn.checked = true; qty(); build();
  });
  document.getElementById('pull-trim').addEventListener('click', function () {
    var keep = {}; shownSlugs.forEach(function (x) { keep[x] = 1; });
    var drop = PullList.get().filter(function (x) { return !keep[x] && index[x]; });
    if (drop.length && confirm('Take the ' + drop.length + ' sample' + (drop.length === 1 ? '' : 's') + ' with no matching vials off the pull list?')) PullList.remove(drop);
  });
  document.querySelector('.pull-table thead').addEventListener('click', function (e) {
    var b = e.target.closest('.sort'); if (!b) return;
    if (sortKey === b.dataset.sort) sortDir = -sortDir; else { sortKey = b.dataset.sort; sortDir = 1; }
    try { localStorage.setItem('mnts-pull-sort', JSON.stringify([sortKey, sortDir])); } catch (e) {}
    build();
  });
  document.getElementById('pull-clear').addEventListener('click', function () {
    if (PullList.get().length && confirm('Take all ' + PullList.get().length + ' samples off the pull list?')) PullList.clear();
  });
  document.getElementById('pull-project').addEventListener('click', function () {
    var l = PullList.get(); if (!l.length) return;
    if (window.ProjectTag) ProjectTag.open(l, projects);
  });
  document.getElementById('pull-print').addEventListener('click', function () { window.print(); });
  document.getElementById('pull-xlsx').addEventListener('click', function () {
    var data = [['Drawer', 'Position', 'Catalogue number', 'Sample', 'Mineral', 'Split', 'Amount (0-5)', 'Country', 'Latitude', 'Longitude', 'Rock type · age', 'Collected by', 'Project', 'Mounts', 'Pulled']];
    rows.forEach(function (o) {
      var s = o.s, v = o.v || [];
      data.push([o.at ? o.at.d : '', o.pos, v[0] || '', s[1], v[1] || '', v[2] || '', v[3] === 'missing' ? 'Not found' : v[3] == null ? '' : v[3], s[7] || '',
        s[8] == null ? '' : s[8], s[9] == null ? '' : s[9], s[6] || '', s[3] || '', s[10] || '', s[5].join(', '), '']);
    });
    var blob = makeXlsx([{ name: 'Pull list', rows: data, widths: [8, 9, 16, 18, 12, 12, 12, 14, 10, 10, 30, 22, 16, 18, 8] }]);
    var a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'pull-list-' + d.toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  PullList.onChange(build);
  fetch(me.dataset.index, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    d.samples.forEach(function (s) { index[s[0]] = s; });
    projects = d.projects || [];
    function fill() {   // options from the samples on the list
      var cs = {}, ps = {}, sp = {};
      PullList.get().forEach(function (x) { var r = index[x]; if (!r) return; cs[r[7] || '-'] = 1; ps[r[10] || '-'] = 1; r[2].forEach(function (v) { if (v[2]) sp[v[2]] = 1; }); });
      [[selC, cs, 'Country not known'], [selJ, ps, 'No project'], [selP, sp, null]].forEach(function (a) {
        var sel = a[0], cur = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        Object.keys(a[1]).sort(function (x, y) { return x === '-' ? 1 : y === '-' ? -1 : x.localeCompare(y); }).forEach(function (k) { if (k !== '-' || a[2]) sel.add(new Option(k === '-' ? a[2] : k, k)); });
        sel.value = cur; if (sel.value !== cur) sel.value = '';
      });
    }
    fill(); PullList.onChange(fill);
    build();
  }).catch(function () { sum.innerHTML = '<p class="muted small">The sample list isn\'t available yet. It is made when the site is built.</p>'; });
})();
