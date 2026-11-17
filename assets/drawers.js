// Mineral Split Database: the vial cabinet. Three columns of thirteen drawers (1–13, 14–26, 27–39,
// top to bottom); a drawer is the first number of a catalogue number (17B05 is in drawer 17).
// Each drawer shows how many samples and vials it holds and its mix of minerals; any drawers past
// 39 are listed underneath.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/', box = document.getElementById('drawers');
  if (!box) return;
  function tone(m) { m = (m || '').split(' + ')[0]; return m === 'Apatite' ? 'ap' : m === 'Zircon' ? 'zr' : m === 'Titanite' ? 'ti' : 'o'; }
  document.addEventListener('splits-loaded', function (e) {
    var st = {};
    e.detail.all.forEach(function (s) {
      var seen = {};
      s[2].forEach(function (v) {
        var m = /^(\d+)/.exec(v[0] || '');
        if (!m) return;
        var d = +m[1], x = st[d] || (st[d] = { vials: 0, samples: 0, ap: 0, zr: 0, ti: 0, o: 0 });
        x.vials++; x[tone(v[1])]++;
        if (!seen[d]) { x.samples++; seen[d] = 1; }
      });
    });
    function cell(d) {
      var x = st[d];
      if (!x) return '<div class="drawer empty"><span class="dnum">' + d + '</span><span class="dstat muted">Empty</span></div>';
      var bar = ['ap', 'zr', 'ti', 'o'].map(function (k) { return x[k] ? '<i class="m-' + k + '" style="flex:' + x[k] + '"></i>' : ''; }).join('');
      return '<a class="drawer" href="' + base + 'drawer/' + d + '/" title="Drawer ' + d + ': ' + x.samples + ' samples, ' + x.vials + ' vials (' +
        ['ap', 'zr', 'ti', 'o'].filter(function (k) { return x[k]; }).map(function (k) { return x[k] + ' ' + { ap: 'apatite', zr: 'zircon', ti: 'titanite', o: 'other' }[k]; }).join(', ') + ')">' +
        '<span class="dnum">' + d + '</span><span class="dbar">' + bar + '</span>' +
        '<span class="dstat">' + x.samples + ' <small>samples</small> · ' + x.vials + ' <small>vials</small></span></a>';
    }
    var ROWS = 13, html = '';
    for (var c = 0; c < 3; c++) {
      html += '<div class="cab-col">';
      for (var r = 1; r <= ROWS; r++) html += cell(c * ROWS + r);
      html += '</div>';
    }
    var extra = Object.keys(st).map(Number).filter(function (d) { return d > 3 * ROWS; }).sort(function (a, b) { return a - b; });
    if (extra.length) html += '<div class="cab-extra"><span class="muted small">Also:</span>' + extra.map(cell).join('') + '</div>';
    html += '<p class="cab-key small muted"><i class="m-ap"></i> Apatite <i class="m-zr"></i> Zircon <i class="m-ti"></i> Titanite <i class="m-o"></i> Other</p>';
    box.innerHTML = html;
  });
})();
