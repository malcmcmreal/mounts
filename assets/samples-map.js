// Sample map: every sample with coordinates, coloured by its first mineral. Click a sample to
// select it (or use its popup); "Select an area" then drag selects everything inside the box.
// Selected samples are listed under the map and can be added to the pull list in one go.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/';
  var box = document.getElementById('sample-map'), count = document.getElementById('map-count');
  var q = document.getElementById('map-q'), selM = document.getElementById('map-mineral'), boxBtn = document.getElementById('map-box');
  var pick = document.getElementById('map-pick'), pickRows = document.getElementById('pick-rows'), pickN = document.getElementById('pick-n');
  var selJ = document.getElementById('map-project'), qLo = document.getElementById('qty-lo'), qHi = document.getElementById('qty-hi'),
    qUn = document.getElementById('qty-unrated'), qOut = document.getElementById('qty-out'), qFill = document.getElementById('qty-fill'), projects = [];
  var COLOUR = { ap: '#7fcf7f', zr: '#74b0ec', ti: '#e6cf5c', o: '#b9b9c0' };
  var all = [], shown = [], chosen = {}, marks = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tone(m) { m = (m || '').split(' + ')[0]; return m === 'Apatite' ? 'ap' : m === 'Zircon' ? 'zr' : m === 'Titanite' ? 'ti' : 'o'; }
  function vtxt(s) { return s[2].map(function (v) { return v[0] + ' ' + v[1] + (v[2] ? ' ' + v[2].toLowerCase() : ''); }).join(', '); }

  var map = L.map(box, { preferCanvas: true, worldCopyJump: true }).setView([-25, 134], 4);
  var dark = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 })]).addTo(map);
  var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles &copy; Esri' });
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap' });
  L.control.layers({ Dark: dark, Satellite: sat, Topographic: topo }, null, { position: 'topright' }).addTo(map);
  var layer = L.layerGroup().addTo(map);

  function style(s) {
    var on = !!chosen[s[0]], pulled = window.PullList && PullList.has(s[0]);
    return { radius: on ? 7 : 5, weight: on ? 2.5 : 1, color: on ? '#fff' : pulled ? '#ff9f43' : '#111', fillOpacity: .95, fillColor: COLOUR[tone((s[2][0] || [])[1])] };
  }
  function restyle(s) { if (marks[s[0]]) marks[s[0]].setStyle(style(s)); }
  function popup(s) {
    var on = window.PullList && PullList.has(s[0]);
    return '<a class="mono" href="' + base + 's/' + encodeURIComponent(s[0]) + '/"><strong>' + esc(s[1]) + '</strong></a>' + (s[7] ? ' · ' + esc(s[7]) : '') +
      (s[6] ? '<br><span class="small">' + esc(s[6]) + '</span>' : '') + (s[10] ? '<br><span class="small">Project: ' + esc(s[10]) + '</span>' : '') +
      '<br>' + s[2].map(function (v) { return '<span class="mono small">' + esc(v[0]) + '</span> ' + esc(v[1]) + (v[2] ? ' ' + esc(v[2].toLowerCase()) : '') +
        (typeof v[3] === 'number' ? ' <span class="muted small">· ' + v[3] + '/5</span>' : v[3] === 'missing' ? ' <span class="muted small">· not found</span>' : ''); }).join('<br>') +
      '<br><button type="button" class="link-btn small" data-pull="' + esc(s[0]) + '">' + (on ? 'On the pull list ✓ (remove)' : '+ Add to pull list') + '</button>';
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pull]');
    if (!b) return;
    var slug = b.dataset.pull, on = PullList.has(slug);
    PullList.toggle(slug, !on);
    b.textContent = !on ? 'On the pull list ✓ (remove)' : '+ Add to pull list';
  });

  function draw() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean), m = selM.value, pj = selJ.value;
    var lo = +qLo.value, hi = +qHi.value, un = qUn.checked, amt = lo > 0 || hi < 5 || !un;
    shown = all.filter(function (s) {
      if (pj && (pj === '-' ? s[10] : s[10] !== pj)) return false;
      if ((m || amt) && !s[2].some(function (v) {
        var ms = v[1].split(' + ');
        if (m && !(m === 'Other' ? !/^(Apatite|Zircon|Titanite)$/.test(ms[0]) : ms.indexOf(m) !== -1)) return false;
        if (!amt) return true;
        return typeof v[3] === 'number' ? v[3] >= lo && v[3] <= hi : un && v[3] !== 'missing';
      })) return false;
      return words.every(function (w) { return s._t.indexOf(w) !== -1; });
    });
    layer.clearLayers(); marks = {};
    shown.forEach(function (s) {
      var mk = L.circleMarker([s[8], s[9]], style(s)).bindTooltip(esc(s[1]) + (s[7] ? ' · ' + esc(s[7]) : ''), { direction: 'top', offset: [0, -4] });
      mk.on('click', function (e) {
        if (e.originalEvent.shiftKey || e.originalEvent.metaKey || e.originalEvent.ctrlKey) { toggle(s); return; }
        toggle(s, true);
        L.popup({ offset: [0, -2] }).setLatLng(mk.getLatLng()).setContent(popup(s)).openOn(map);
      });
      marks[s[0]] = mk; mk.addTo(layer);
    });
    count.textContent = shown.length.toLocaleString() + ' sample' + (shown.length === 1 ? '' : 's') + ' on the map' + (shown.length < all.length ? ' (of ' + all.length.toLocaleString() + ' with coordinates)' : '') +
      '. Click a sample to select it; shift-click to select several. White ring: selected. Orange ring: already on the pull list.';
  }
  function toggle(s, on) {
    if (on === undefined) on = !chosen[s[0]];
    if (on) chosen[s[0]] = s; else delete chosen[s[0]];
    restyle(s); list();
  }
  function list() {
    var picked = Object.keys(chosen).map(function (k) { return chosen[k]; }).sort(function (a, b) { return a[1].localeCompare(b[1], undefined, { numeric: true }); });
    pick.hidden = !picked.length; pickN.textContent = picked.length;
    pickRows.innerHTML = picked.map(function (s) {
      return '<tr><td><a class="mono" href="' + base + 's/' + encodeURIComponent(s[0]) + '/">' + esc(s[1]) + '</a></td><td class="small mono">' + esc(s[2].map(function (v) { return v[0]; }).join(' ')) +
        '</td><td class="small">' + esc(s[7]) + '</td><td><button type="button" class="link-btn small" data-unpick="' + esc(s[0]) + '">Remove</button></td></tr>';
    }).join('');
  }
  pickRows.addEventListener('click', function (e) { var b = e.target.closest('[data-unpick]'); if (b && chosen[b.dataset.unpick]) toggle(chosen[b.dataset.unpick], false); });
  document.getElementById('pick-clear').addEventListener('click', function () { var c = chosen; chosen = {}; Object.keys(c).forEach(function (k) { restyle(c[k]); }); list(); });
  document.getElementById('pick-add').addEventListener('click', function () {
    var slugs = Object.keys(chosen);
    PullList.add(slugs);
    this.textContent = 'Added ' + slugs.length + ' ✓';
    var b = this; setTimeout(function () { b.textContent = 'Add to pull list'; }, 1800);
  });
  if (window.PullList) PullList.onChange(function () { shown.forEach(restyle); });

  // ---- area selection: drag a box ----
  var boxing = false, start = null, rect = null;
  function setBoxing(on) {
    boxing = on; boxBtn.setAttribute('aria-pressed', on); boxBtn.classList.toggle('primary', on);
    box.classList.toggle('boxing', on);
    if (on) map.dragging.disable(); else map.dragging.enable();
  }
  boxBtn.addEventListener('click', function () { setBoxing(!boxing); });
  map.on('mousedown', function (e) { if (!boxing) return; start = e.latlng; rect = L.rectangle([start, start], { color: '#fff', weight: 1.5, dashArray: '4 3', fillOpacity: .08 }).addTo(map); });
  map.on('mousemove', function (e) { if (rect && start) rect.setBounds([start, e.latlng]); });
  map.on('mouseup', function () {
    if (!rect) return;
    var b = rect.getBounds(); rect.remove(); rect = null; start = null;
    var n = 0;
    shown.forEach(function (s) { if (b.contains([s[8], s[9]]) && !chosen[s[0]]) { chosen[s[0]] = s; restyle(s); n++; } });
    list(); setBoxing(false);
    if (n) pick.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && boxing) { if (rect) { rect.remove(); rect = null; } setBoxing(false); } });

  var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(draw, 150); });
  selM.addEventListener('change', draw);
  selJ.addEventListener('change', draw);
  function qty(e) {
    if (+qLo.value > +qHi.value) { if (e && e.target === qLo) qHi.value = qLo.value; else qLo.value = qHi.value; }
    qOut.textContent = qLo.value === qHi.value ? qLo.value : qLo.value + '–' + qHi.value;
    qFill.style.left = (qLo.value * 20) + '%'; qFill.style.right = ((5 - qHi.value) * 20) + '%';
    clearTimeout(t); t = setTimeout(draw, 80);
  }
  [qLo, qHi].forEach(function (el) { el.addEventListener('input', qty); });
  qUn.addEventListener('change', draw);
  qty();
  document.getElementById('pick-project').addEventListener('click', function () { var l = Object.keys(chosen); if (l.length && window.ProjectTag) ProjectTag.open(l, projects); });
  fetch(me.dataset.index, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    all = d.samples.filter(function (s) { return s[8] != null && s[9] != null; });
    all.forEach(function (s) { s._t = [s[1], s[3], s[6], s[7], s[10] || '', vtxt(s)].join(' ').toLowerCase(); });
    projects = d.projects || [];
    var pjs = {}, none = 0;
    all.forEach(function (s) { if (s[10]) pjs[s[10]] = (pjs[s[10]] || 0) + 1; else none++; });
    Object.keys(pjs).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (x) { selJ.add(new Option(x + ' (' + pjs[x] + ')', x)); });
    if (Object.keys(pjs).length) selJ.add(new Option('No project (' + none + ')', '-'));
    else selJ.add(new Option('No samples tagged yet', '', false, false)), selJ.disabled = true;
    draw();
    if (all.length) {
      var aus = all.filter(function (s) { return s[7] === 'Australia'; });
      map.fitBounds((aus.length > all.length / 3 ? aus : all).map(function (s) { return [s[8], s[9]]; }), { padding: [20, 20] });
    }
  }).catch(function () { count.textContent = 'The sample list isn\'t available yet. It is made when the site is built.'; });
})();
