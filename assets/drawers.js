// Mineral Split Database: the vial cabinet. Three columns of fifteen drawers (1–15, 16–30, 31–45,
// top to bottom); a drawer is the first number of a catalogue number (17B05 is in drawer 17).
// Each drawer shows how many samples and vials it holds and its mix of minerals; any drawers past
// 45 are listed underneath.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/', box = document.getElementById('drawers');
  if (!box) return;
  function tone(m) { m = (m || '').split(' + ')[0]; return m === 'Apatite' ? 'ap' : m === 'Zircon' ? 'zr' : m === 'Titanite' ? 'ti' : 'o'; }
  var all = null, hits = null, only = document.getElementById('cab-only');
  try { if (only && localStorage.getItem('mnts-cab-only') === '1') only.checked = true; } catch (e) {}
  document.addEventListener('splits-loaded', function (e) { all = e.detail.all; draw(); });
  document.addEventListener('splits-filtered', function (e) { hits = e.detail; if (only && only.checked) draw(); });
  if (only) only.addEventListener('change', function () {
    try { localStorage.setItem('mnts-cab-only', only.checked ? '1' : '0'); } catch (e) {}
    draw();
  });
  function draw() {
    if (!all) return;
    var sel = only && only.checked && hits && hits.filtered, list = sel ? hits : all, ok = sel ? hits.vialOk : null, qs = sel && hits.query ? '?' + hits.query : '';
    box.classList.toggle('filtered', !!sel);
    var st = {};
    list.forEach(function (s) {
      var seen = {};
      s[2].forEach(function (v) {
        if (ok && !ok(v)) return;
        var m = /^(\d+)/.exec(v[0] || '');
        if (!m) return;
        var d = +m[1], x = st[d] || (st[d] = { vials: 0, samples: 0, ap: 0, zr: 0, ti: 0, o: 0 });
        x.vials++; x[tone(v[1])]++;
        if (!seen[d]) { x.samples++; seen[d] = 1; }
      });
    });
    function cell(d) {
      var x = st[d];
      if (!x) return '<div class="drawer empty"><span class="dnum">' + d + '</span><span class="dstat muted">' + (sel ? 'None' : 'Empty') + '</span></div>';
      var bar = ['ap', 'zr', 'ti', 'o'].map(function (k) { return x[k] ? '<i class="m-' + k + '" style="flex:' + x[k] + '"></i>' : ''; }).join('');
      return '<a class="drawer" href="' + base + 'drawer/' + d + '/' + qs + '" title="Drawer ' + d + ': ' + x.samples + ' samples, ' + x.vials + ' vials (' +
        ['ap', 'zr', 'ti', 'o'].filter(function (k) { return x[k]; }).map(function (k) { return x[k] + ' ' + { ap: 'apatite', zr: 'zircon', ti: 'titanite', o: 'other' }[k]; }).join(', ') + ')">' +
        '<span class="dnum">' + d + '</span><span class="dbar">' + bar + '</span>' +
        '<span class="dstat">' + x.samples + ' <small>sample' + (x.samples === 1 ? '' : 's') + '</small> · ' + x.vials + ' <small>vial' + (x.vials === 1 ? '' : 's') + '</small></span></a>';
    }
    var ROWS = 15, html = '';
    for (var c = 0; c < 3; c++) {
      html += '<div class="cab-col">';
      for (var r = 1; r <= ROWS; r++) html += cell(c * ROWS + r);
      html += '</div>';
    }
    var extra = Object.keys(st).map(Number).filter(function (d) { return d > 3 * ROWS; }).sort(function (a, b) { return a - b; });
    if (extra.length) html += '<div class="cab-extra"><span class="muted small">Also:</span>' + extra.map(cell).join('') + '</div>';
    if (sel) {
      var n = 0; Object.keys(st).forEach(function (k) { n += st[k].vials; });
      html += '<p class="cab-note small">Showing only the ' + n.toLocaleString() + ' vial' + (n === 1 ? '' : 's') + ' that match the current filters.</p>';
    }
    html += '<p class="cab-key small muted"><i class="m-ap"></i> Apatite <i class="m-zr"></i> Zircon <i class="m-ti"></i> Titanite <i class="m-o"></i> Other</p>';
    box.innerHTML = html;
  }
})();
