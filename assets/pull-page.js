// Pull list page: every vial of the picked samples, sorted for walking the cabinet
// (drawer, row A→N, column 01→36), with a summary per drawer, print and .xlsx download.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/';
  var tbody = document.getElementById('pull-rows'), sum = document.getElementById('pull-summary');
  var selM = document.getElementById('pull-mineral'), selP = document.getElementById('pull-prep'), found = document.getElementById('pull-found');
  var index = {}, rows = [];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function parse(cat) { var m = /^(\d+)([A-Z])(\d+)/.exec(cat || ''); return m ? { d: +m[1], r: m[2], c: +m[3] } : null; }
  function amount(q) { return q === 'missing' ? 'Not found' : q === '' || q == null ? '' : q + '/5'; }
  function build() {
    var m = selM.value, p = selP.value, slugs = PullList.get(), out = [], missingSamples = [];
    slugs.forEach(function (slug) {
      var s = index[slug];
      if (!s) { missingSamples.push(slug); return; }
      var any = false;
      s[2].forEach(function (v) {
        var ms = v[1].split(' + ');
        if (m && !(m === 'Other' ? !/^(Apatite|Zircon|Titanite)$/.test(ms[0]) : ms.indexOf(m) !== -1)) return;
        if (p && v[2] !== p) return;
        if (found.checked && v[3] === 'missing') return;
        var at = parse(v[0]);
        out.push({ s: s, v: v, at: at, pos: v[4] || (at ? at.r + ('0' + at.c).slice(-2) : '') });
        any = true;
      });
      if (!any) out.push({ s: s, v: null, at: null, pos: '' });
    });
    out.sort(function (a, b) {
      if (!a.at || !b.at) return (a.at ? 0 : 1) - (b.at ? 0 : 1) || a.s[1].localeCompare(b.s[1], undefined, { numeric: true });
      return a.at.d - b.at.d || a.at.r.localeCompare(b.at.r) || a.at.c - b.at.c;
    });
    rows = out;
    var html = '', prevD = null, drawers = {};
    out.forEach(function (o) {
      var d = o.at ? o.at.d : null;
      if (d !== prevD) {
        html += '<tr class="group-row"><th colspan="10">' + (d != null ? '<a href="' + base + 'drawer/' + d + '/">Drawer ' + d + '</a>' : 'No vial position') + '</th></tr>';
        prevD = d;
      }
      if (d != null) drawers[d] = (drawers[d] || 0) + 1;
      var s = o.s, v = o.v;
      html += '<tr><td class="mono">' + (d != null ? d : '') + '</td><td class="mono">' + esc(o.pos) + '</td><td class="mono">' + esc(v ? v[0] : '') + '</td>' +
        '<td><a class="mono" href="' + base + 's/' + encodeURIComponent(s[0]) + '/">' + esc(s[1]) + '</a></td>' +
        '<td>' + (v ? esc(v[1]) : '<span class="muted small">No vials match the filters</span>') + '</td><td>' + esc(v ? v[2] : '') + '</td>' +
        '<td class="small">' + (v ? esc(amount(v[3])) : '') + '</td><td class="small">' + esc(s[7]) + '</td><td class="small">' + esc(s[3]) + '</td>' +
        '<td class="no-print"><button type="button" class="link-btn small" data-remove="' + esc(s[0]) + '" title="Take ' + esc(s[1]) + ' off the pull list">Remove</button></td></tr>';
    });
    if (!slugs.length) html = '<tr><td colspan="10" class="muted">The pull list is empty. Tick samples in the <a href="' + base + 'samples/">Mineral Split Database</a> or pick them on the <a href="' + base + 'samples/map/">map</a>.</td></tr>';
    tbody.innerHTML = html;
    var vials = out.filter(function (o) { return o.v; }).length, ds = Object.keys(drawers);
    sum.innerHTML = '<div class="stat"><strong>' + slugs.length + '</strong><span>samples</span></div><div class="stat"><strong>' + vials + '</strong><span>vials</span></div>' +
      '<div class="stat"><strong>' + ds.length + '</strong><span>drawer' + (ds.length === 1 ? '' : 's') + '</span></div>' +
      (ds.length ? '<div class="stat wide"><strong class="small">' + ds.map(function (d) { return 'Drawer ' + d + ' <span class="muted">' + drawers[d] + '</span>'; }).join(' · ') + '</strong><span>vials per drawer</span></div>' : '') +
      (missingSamples.length ? '<div class="stat wide"><strong class="small">' + missingSamples.map(esc).join(', ') + '</strong><span>no longer in the database</span></div>' : '');
  }
  tbody.addEventListener('click', function (e) { var b = e.target.closest('[data-remove]'); if (b) PullList.remove(b.dataset.remove); });
  [selM, selP, found].forEach(function (el) { el.addEventListener('change', build); });
  document.getElementById('pull-clear').addEventListener('click', function () {
    if (PullList.get().length && confirm('Take all ' + PullList.get().length + ' samples off the pull list?')) PullList.clear();
  });
  document.getElementById('pull-print').addEventListener('click', function () { window.print(); });
  document.getElementById('pull-xlsx').addEventListener('click', function () {
    var data = [['Drawer', 'Position', 'Catalogue number', 'Sample', 'Mineral', 'Split', 'Amount (0-5)', 'Country', 'Latitude', 'Longitude', 'Rock type · age', 'Collected by', 'Mounts', 'Pulled']];
    rows.forEach(function (o) {
      var s = o.s, v = o.v || [];
      data.push([o.at ? o.at.d : '', o.pos, v[0] || '', s[1], v[1] || '', v[2] || '', v[3] === 'missing' ? 'Not found' : v[3] == null ? '' : v[3], s[7] || '',
        s[8] == null ? '' : s[8], s[9] == null ? '' : s[9], s[6] || '', s[3] || '', s[5].join(', '), '']);
    });
    var blob = makeXlsx([{ name: 'Pull list', rows: data, widths: [8, 9, 16, 18, 12, 12, 12, 14, 10, 10, 30, 22, 18, 8] }]);
    var a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'pull-list-' + d.toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  PullList.onChange(build);
  fetch(me.dataset.index, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    d.samples.forEach(function (s) { index[s[0]] = s; });
    build();
  }).catch(function () { sum.innerHTML = '<p class="muted small">The sample list isn\'t available yet. It is made when the site is built.</p>'; });
})();
