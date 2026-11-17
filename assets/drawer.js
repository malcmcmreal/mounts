// Drawer page: quick stats, the drawer's layout (every vial coloured by mineral; hover for the
// sample, fraction, amount and position; click to open the sample) and a map of the listed samples
// that have coordinates. The map follows the search and filters of the list below it.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/', D = String(me.dataset.drawer);
  var statsBox = document.getElementById('drawer-stats'), trayBox = document.getElementById('drawer-tray');
  var mapBox = document.getElementById('drawer-map'), mapNote = document.getElementById('drawer-map-note');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tone(m) { m = (m || '').split(' + ')[0]; return m === 'Apatite' ? 'ap' : m === 'Zircon' ? 'zr' : m === 'Titanite' ? 'ti' : 'o'; }
  var MIN = { ap: 'Apatite', zr: 'Zircon', ti: 'Titanite', o: 'Other' };
  var trayInfo = null, listed = null;

  function stat(n, label, cls) { return '<div class="stat' + (cls ? ' ' + cls : '') + '"><strong>' + n + '</strong><span>' + label + '</span></div>'; }
  function stats() {
    if (!listed) return;
    var v = [], c = {};
    listed.forEach(function (s) { s._v.forEach(function (x) { v.push(x); }); if (s[7]) c[s[7]] = (c[s[7]] || 0) + 1; });
    var by = { ap: 0, zr: 0, ti: 0, o: 0 }, conc = 0, q = [];
    v.forEach(function (x) {
      by[tone(x[1])]++;
      if (x[2] === 'Concentrate') conc++;
      if (tone(x[1]) === 'ap' && typeof x[3] === 'number') q.push(x[3]);
    });
    var html = stat(listed.length, 'samples') + stat(v.length, 'vials');
    ['ap', 'zr', 'ti', 'o'].forEach(function (k) { if (by[k]) html += stat(by[k], MIN[k].toLowerCase(), 'm-' + k); });
    html += stat(conc, 'concentrates');
    if (trayInfo) {
      var cols = trayInfo.cols, empty = 14 * cols - trayInfo.v.length;
      html += stat(empty, 'empty positions');
    }
    if (q.length) html += stat((q.reduce(function (a, b) { return a + b; }, 0) / q.length).toFixed(1) + '<small>/5</small>', 'average apatite amount (' + q.length + ' rated)');
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 3);
    if (top.length) html += '<div class="stat wide"><strong class="small">' + top.map(function (k) { return esc(k) + ' <span class="muted">' + c[k] + '</span>'; }).join(' · ') + '</strong><span>main countries</span></div>';
    statsBox.innerHTML = html;
  }

  // ---- layout grid ----
  var S = 17, R = 5.5, LM = 22, B = 20, T = 6;
  fetch(me.dataset.trays).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    var t = d.trays[D];
    if (!t) { trayBox.innerHTML = '<p class="muted small">No vials recorded in this drawer.</p>'; trayInfo = { cols: 36, v: [] }; stats(); return; }
    trayInfo = t; stats();
    var cols = t.cols, rows = d.rows.length, w = LM + cols * S + 4, h = T + rows * S + B, at = {};
    t.v.forEach(function (v) { at[v[0] + ',' + v[1]] = v; });
    var out = ['<svg class="tray-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Drawer ' + D + ' layout">'];
    for (var r = 0; r < rows; r++) {
      var y = T + (rows - 1 - r) * S + S / 2;
      out.push('<text class="tray-lab" x="' + (LM - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + d.rows[r] + '</text>');
      for (var c = 0; c < cols; c++) {
        var x = LM + c * S + S / 2, v = at[r + ',' + c], tip = ' data-tip="' + r + ':' + c + '"';
        if (!v) out.push('<circle class="tray-empty" cx="' + x + '" cy="' + y + '" r="' + (R - 1.5) + '"' + tip + '/>');
        else out.push('<a href="' + base + 's/' + encodeURIComponent(v[3]) + '/"><circle class="tray-own m-' + v[4] + (v[5] ? ' conc' : '') + '" cx="' + x + '" cy="' + y + '" r="' + R + '" data-slug="' + esc(v[3]) + '"' + tip + '/></a>');
      }
    }
    for (var c2 = 0; c2 < cols; c2++) if (c2 === 0 || (c2 + 1) % 5 === 0 || c2 === cols - 1)
      out.push('<text class="tray-lab" x="' + (LM + c2 * S + S / 2) + '" y="' + (h - 5) + '" text-anchor="middle">' + ('0' + (c2 + 1)).slice(-2) + '</text>');
    out.push('</svg>');
    trayBox.innerHTML = '<div class="tray-scroll">' + out.join('') + '</div>' +
      '<p class="tray-key small muted"><span class="dot m-ap"></span> Apatite <span class="dot m-zr"></span> Zircon <span class="dot m-ti"></span> Titanite ' +
      '<span class="dot m-o"></span> Other <span class="dot conc"></span> Concentrate <span class="dot empty"></span> Empty. Row A at the bottom, 01 on the left. Click a vial to open its sample.</p>';
    var tipBox = document.createElement('div');
    tipBox.className = 'tray-tip'; tipBox.hidden = true; document.body.appendChild(tipBox);
    trayBox.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tip]');
      if (!el) { tipBox.hidden = true; return; }
      var p = el.dataset.tip.split(':'), v = at[p[0] + ',' + p[1]], pos = d.rows[+p[0]] + ('0' + (+p[1] + 1)).slice(-2);
      tipBox.innerHTML = v ? '<strong class="mono">' + esc(v[8] || v[3]) + '</strong><br>' + esc(v[7] || MIN[v[4]] || '') + (v[6] ? ' ' + esc(v[6].toLowerCase()) : '') +
        (v[9] === 'missing' ? '<br><span class="muted">Vial not found when checked</span>' : v[9] !== '' && v[9] != null ? '<br><span class="muted">Amount</span> ' + v[9] + '/5' : '') +
        '<br><span class="muted">Vial</span> <span class="mono">' + esc(v[2]) + '</span> <span class="muted">· position</span> <span class="mono">' + pos + '</span>'
        : '<span class="muted">Empty · position</span> <span class="mono">' + pos + '</span>';
      tipBox.hidden = false;
      var b = el.getBoundingClientRect();
      tipBox.style.left = (window.scrollX + b.left + b.width / 2) + 'px';
      tipBox.style.top = (window.scrollY + b.top - 8) + 'px';
    });
    trayBox.addEventListener('mouseleave', function () { tipBox.hidden = true; });
  }).catch(function () { trayBox.innerHTML = '<p class="muted small">The drawer layout isn\'t available yet. It is made when the site is built.</p>'; });

  // ---- map ----
  var map = null, layer = null;
  function draw(samples) {
    var pts = samples.filter(function (s) { return s[8] != null && s[9] != null; });
    var without = samples.length - pts.length;
    mapNote.textContent = pts.length ? pts.length + ' of ' + samples.length + ' listed samples have coordinates' + (without ? '; ' + without + ' have none.' : '.') :
      samples.length ? 'None of the listed samples have coordinates yet.' : '';
    if (!pts.length || !window.L) { mapBox.hidden = true; return; }
    mapBox.hidden = false;
    if (!map) {
      map = L.map(mapBox, { scrollWheelZoom: false, preferCanvas: true });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 16, attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(map);
    }
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    var colour = { ap: '#7fcf7f', zr: '#74b0ec', ti: '#e6cf5c', o: '#b9b9c0' }, bounds = [];
    pts.forEach(function (s) {
      bounds.push([s[8], s[9]]);
      L.circleMarker([s[8], s[9]], { radius: 6, color: '#111', weight: 1, fillOpacity: .95, fillColor: colour[tone((s._v[0] || [])[1])] })
        .bindPopup('<a href="' + base + 's/' + encodeURIComponent(s[0]) + '/"><strong>' + esc(s[1]) + '</strong></a>' + (s[7] ? '<br>' + esc(s[7]) : '') +
          '<br>' + s._v.map(function (v) { return esc(v[0]) + ' ' + esc(v[1]) + (v[2] ? ' ' + esc(v[2].toLowerCase()) : ''); }).join('<br>'))
        .addTo(layer);
    });
    if (bounds.length === 1) map.setView(bounds[0], 8); else map.fitBounds(bounds, { padding: [20, 20], maxZoom: 9 });
    setTimeout(function () { map.invalidateSize(); }, 50);
  }
  document.addEventListener('splits-loaded', function (e) { listed = e.detail.listed; stats(); });
  document.addEventListener('splits-filtered', function (e) { draw(e.detail); });
})();
