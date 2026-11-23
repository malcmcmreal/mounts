// Ternary plot of an apfu spreadsheet (…_apfu.xlsx), opened from the mount page: /ternary/?f=<file url>&m=<mount ID>
// Pick any three columns for the corners (default Cl, OH, F apfu, top / bottom left / bottom right as in plotly's
// scatter_ternary); the three values are normalised to sum to 1. Points are coloured by Sample ID.
(function () {
  var q = new URLSearchParams(location.search), file = q.get('f') || '', mount = q.get('m') || '';
  if (!/^\/[^:]*\.xlsx$/i.test(file)) file = '';   // only spreadsheets on this site
  if (q.get('embed') === '1') document.addEventListener('keydown', function (e) {   // Esc closes the mount page's pop-up
    if (e.key === 'Escape' && window.parent !== window) window.parent.postMessage('tern-close', location.origin);
  });
  var $ = function (id) { return document.getElementById(id); };
  var PAL = {   // categorical palette, fixed order (validated: dark on the page, light for exports)
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
  };
  var OTHER = { dark: '#8a8a8e', light: '#8a8a8e' };
  var THEME = {
    dark: { bg: '#282828', ink: '#e8e8ea', muted: '#98989d', grid: '#3d3d3f', edge: '#6e6e73', ring: '#282828' },
    light: { bg: '#ffffff', ink: '#1d1d1f', muted: '#6e6e73', grid: '#e3e3e6', edge: '#8e8e93', ring: '#ffffff' }
  };
  var DEF = ['Cl (apfu)', 'OH (apfu)', 'F (apfu)'];
  var head = [], rows = [], groups = [], hidden = {}, cand = [], apfu = [];
  var files = [], cache = {}, chosen = [];   // files: [{mount, url}], cache: url -> [{col: value}], chosen: mount IDs shown

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(c) { return c.replace(/\s*\((apfu|wt%)\)\s*$/, '').replace(/ wt%$/, ''); }

  try { files = JSON.parse($('tern-files').textContent).map(function (e) { var p = e.split('|'); return { mount: p[0], url: p[1] }; }); } catch (e) { files = []; }
  var fname = decodeURIComponent(file.split('/').pop() || '');
  if (!mount) { var mm = /\/mounts\/([^/]+)\//.exec(file); mount = mm ? decodeURIComponent(mm[1]) : ''; }
  if (file && !files.some(function (f) { return f.url === file; })) files.unshift({ mount: mount || fname, url: file });
  if (mount) { $('tern-back').href = $('tern-back').href.replace(/\/$/, '/') + encodeURIComponent(mount) + '/'; $('tern-back').innerHTML = '&larr; ' + esc(mount); }
  if (!files.length) { $('tern-plot').innerHTML = '<p class="muted">No apfu spreadsheets found.</p>'; return; }
  if (!file) { file = files[0].url; mount = files[0].mount; }
  chosen = [mount];

  function title() {
    var t = chosen.length === 1 ? (files.filter(function (f) { return f.mount === chosen[0]; })[0] || {}).url : '';
    t = t ? decodeURIComponent(t.split('/').pop()) : chosen.join(', ');
    $('tern-title').textContent = t;
    document.title = t + ' · Ternary plot';
  }
  function load(f) {
    if (cache[f.url]) return Promise.resolve(cache[f.url]);
    return fetch(f.url).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(readXlsx).then(function (sheets) {
      var sh = sheets.filter(function (s) { return s.name === 'apfu'; })[0] || sheets[0];
      var h = (sh.rows[0] || []).map(function (x) { return String(x || ''); });
      h.forEach(function (c) { if (c && head.indexOf(c) < 0) head.push(c); });
      return (cache[f.url] = sh.rows.slice(1).filter(function (r) { return r && r.length; }).map(function (r) {
        var o = { Mount: f.mount }; h.forEach(function (c, i) { if (c) o[c] = r[i] == null ? '' : r[i]; }); return o;
      }));
    });
  }
  function refresh() {
    var fs = files.filter(function (f) { return chosen.indexOf(f.mount) >= 0; });
    $('tern-note').textContent = 'Loading…';
    return Promise.all(fs.map(load)).then(function (sets) {
      rows = [].concat.apply([], sets);
      var first = !cand.length;
      setupColumns();
      if (first) setupControls();
      title(); draw();
    }).catch(function () { $('tern-plot').innerHTML = '<p class="muted">Could not read a spreadsheet.</p>'; });
  }
  function mountChips() {
    $('tern-mounts').innerHTML = files.map(function (f) {
      return '<label class="tern-mchip' + (chosen.indexOf(f.mount) >= 0 ? ' on' : '') + '"><input type="checkbox" value="' + esc(f.mount) + '"' +
        (chosen.indexOf(f.mount) >= 0 ? ' checked' : '') + '>' + esc(f.mount) + '</label>';
    }).join(' ') + (files.length > 1 ? ' <button type="button" class="link-btn small" id="tern-all">All</button>' : '');
    $('tern-mounts').querySelectorAll('input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) { if (chosen.indexOf(cb.value) < 0) chosen.push(cb.value); }
        else if (chosen.length > 1) chosen = chosen.filter(function (m) { return m !== cb.value; });
        else { cb.checked = true; return; }   // keep at least one
        chosen.sort(function (x, y) { return mIndex(x) - mIndex(y); });
        mountChips(); refresh();
      });
    });
    var all = $('tern-all');
    if (all) all.addEventListener('click', function () {
      chosen = chosen.length === files.length ? [mount] : files.map(function (f) { return f.mount; });
      mountChips(); refresh();
    });
  }
  function mIndex(m) { for (var i = 0; i < files.length; i++) if (files[i].mount === m) return i; return 999; }
  mountChips(); refresh();

  function numeric(c) { return rows.some(function (r) { return r[c] !== '' && r[c] != null && isFinite(+r[c]); }); }
  function setupColumns() {
    var keepA = $('tern-a').value, keepB = $('tern-b').value, keepC = $('tern-c').value;
    cand = head.filter(function (c) { return c && c !== 'No.' && numeric(c); });
    apfu = cand.filter(function (c) { return /\(apfu\)$/.test(c); });
    var rest = cand.filter(function (c) { return apfu.indexOf(c) < 0; });
    [['tern-a', keepA], ['tern-b', keepB], ['tern-c', keepC]].forEach(function (x, k) {
      var s = $(x[0]);
      s.innerHTML = '<optgroup label="apfu">' + apfu.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</optgroup>' +
        (rest.length ? '<optgroup label="Other columns">' + rest.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</optgroup>' : '');
      s.value = cand.indexOf(x[1]) >= 0 ? x[1] : cand.indexOf(DEF[k]) >= 0 ? DEF[k] : cand[k] || '';
    });
    // Colour order: samples as first met (run order), then standards. It only ever grows, so adding a mount or
    // filtering never repaints a sample that is already shown.
    var samples = [], stds = [];
    rows.forEach(function (r) {
      var g = r['Sample ID'] || '';
      if (!g || groups.indexOf(g) >= 0 || samples.indexOf(g) >= 0 || stds.indexOf(g) >= 0) return;
      if (!apfu.some(function (c) { return r[c] !== '' && r[c] != null; })) return;   // non-apatite rows don't take a colour
      (/\(standard\)$/.test(g) ? stds : samples).push(g);
    });
    groups = groups.filter(function (g) { return !/\(standard\)$/.test(g); }).concat(samples)
      .concat(groups.filter(function (g) { return /\(standard\)$/.test(g); })).concat(stds);
  }
  function setupControls() {
    ['tern-a', 'tern-b', 'tern-c'].forEach(function (id) { $(id).addEventListener('change', draw); });
    if (head.indexOf('Sample ID') < 0) $('tern-colour').value = files.length > 1 ? 'Mount' : '';
    ['tern-colour', 'tern-std', 'tern-low', 'tern-fcl'].forEach(function (id) { $(id).addEventListener('change', function () { hidden = {}; draw(); }); });
    $('tern-reset').addEventListener('click', function () {
      ['tern-a', 'tern-b', 'tern-c'].forEach(function (id, k) { if (cand.indexOf(DEF[k]) >= 0) $(id).value = DEF[k]; });
      $('tern-colour').value = head.indexOf('Sample ID') >= 0 ? 'Sample ID' : '';
      $('tern-std').checked = true; $('tern-low').checked = true; $('tern-fcl').checked = false; hidden = {}; draw();
    });
  }

  function pick() {
    var A = $('tern-a').value, B = $('tern-b').value, C = $('tern-c').value, by = $('tern-colour').value;
    var useStd = $('tern-std').checked, noLow = $('tern-low').checked, noFcl = $('tern-fcl').checked;
    var out = [], skipped = 0, filtered = 0;
    rows.forEach(function (r) {
      var cm = String(r.Comment || ''), g = r['Sample ID'] || '';
      if (/\(standard\)$/.test(g) && !useStd) { filtered++; return; }
      if (noLow && /^Low total/.test(cm)) { filtered++; return; }
      if (noFcl && /F\+Cl > 2/.test(cm)) { filtered++; return; }
      var va = r[A], vb = r[B], vc = r[C];
      if ([va, vb, vc].some(function (v) { return v === '' || v == null; }) || !isFinite(+va + +vb + +vc)) { skipped++; return; }
      var a = Math.max(+va, 0), b = Math.max(+vb, 0), c = Math.max(+vc, 0), s = a + b + c;
      if (s <= 0) { skipped++; return; }
      var key = by === 'Sample ID' ? g || '(no sample ID)' : by === 'Mount' ? r.Mount : 'All spots';
      out.push({ a: a / s, b: b / s, c: c / s, ra: va, rb: vb, rc: vc, spot: r['Spot ID'] || '', sample: g, mount: r.Mount, comment: cm, key: key });
    });
    return { pts: out, A: A, B: B, C: C, skipped: skipped, filtered: filtered, by: by };
  }
  function colourOf(key, theme, by) {
    if (!by) return PAL[theme][0];
    var i = by === 'Mount' ? mIndex(key) : groups.indexOf(key);
    return i >= 0 && i < 8 ? PAL[theme][i] : OTHER[theme];
  }

  // ---- drawing ----
  var S = 520, H = S * Math.sqrt(3) / 2, M = { l: 70, r: 70, t: 46, b: 64 }, W = S + M.l + M.r, HT = H + M.t + M.b;
  var VA = [M.l + S / 2, M.t], VB = [M.l, M.t + H], VC = [M.l + S, M.t + H];
  function xy(a, b, c) { return [a * VA[0] + b * VB[0] + c * VC[0], a * VA[1] + b * VB[1] + c * VC[1]]; }
  function f1(v) { return Math.round(v * 10) / 10; }
  function svg(p, theme, forExport) {
    var T = THEME[theme], o = [], leg = [], lx = M.l, ly = HT + 8;
    if (forExport && legendItems(p).length > 1) {   // legend rows under the triangle in exports
      legendItems(p).forEach(function (g) {
        if (hidden[g.key]) return;
        var w = 26 + g.key.length * 6.6;
        if (lx + w > W - 10) { lx = M.l; ly += 18; }
        leg.push({ key: g.key, x: lx, y: ly }); lx += w;
      });
    }
    var HH = leg.length ? ly + 14 : HT;
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + f1(HH) + '" width="' + W + '" height="' + f1(HH) + '" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">');
    if (forExport) o.push('<rect width="100%" height="100%" fill="' + T.bg + '"/>');
    // grid every 0.2, ticks on the three edges (a on the left, b on the bottom, c on the right)
    for (var k = 1; k < 5; k++) {
      var t = k / 5, L = [];
      L.push([xy(t, 1 - t, 0), xy(t, 0, 1 - t)]);
      L.push([xy(1 - t, t, 0), xy(0, t, 1 - t)]);
      L.push([xy(1 - t, 0, t), xy(0, 1 - t, t)]);
      L.forEach(function (l) { o.push('<line x1="' + f1(l[0][0]) + '" y1="' + f1(l[0][1]) + '" x2="' + f1(l[1][0]) + '" y2="' + f1(l[1][1]) + '" stroke="' + T.grid + '" stroke-width="1"/>'); });
      var pa = xy(t, 1 - t, 0), pb = xy(0, t, 1 - t), pc = xy(1 - t, 0, t), lab = t.toFixed(1);
      o.push('<text x="' + f1(pa[0] - 8) + '" y="' + f1(pa[1] + 4) + '" text-anchor="end" font-size="11" fill="' + T.muted + '">' + lab + '</text>');
      o.push('<text x="' + f1(pb[0]) + '" y="' + f1(pb[1] + 18) + '" text-anchor="middle" font-size="11" fill="' + T.muted + '">' + lab + '</text>');
      o.push('<text x="' + f1(pc[0] + 8) + '" y="' + f1(pc[1] + 4) + '" font-size="11" fill="' + T.muted + '">' + lab + '</text>');
    }
    o.push('<polygon points="' + [VA, VB, VC].map(function (v) { return f1(v[0]) + ',' + f1(v[1]); }).join(' ') + '" fill="none" stroke="' + T.edge + '" stroke-width="1.5"/>');
    o.push('<text x="' + f1(VA[0]) + '" y="' + f1(VA[1] - 16) + '" text-anchor="middle" font-size="15" font-weight="600" fill="' + T.ink + '">' + esc(short(p.A)) + '</text>');
    o.push('<text x="' + f1(VB[0] - 10) + '" y="' + f1(VB[1] + 40) + '" text-anchor="middle" font-size="15" font-weight="600" fill="' + T.ink + '">' + esc(short(p.B)) + '</text>');
    o.push('<text x="' + f1(VC[0] + 10) + '" y="' + f1(VC[1] + 40) + '" text-anchor="middle" font-size="15" font-weight="600" fill="' + T.ink + '">' + esc(short(p.C)) + '</text>');
    p.pts.forEach(function (d, i) {
      if (hidden[d.key]) return;
      var q = xy(d.a, d.b, d.c);
      o.push('<circle data-i="' + i + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="5" fill="' + colourOf(d.key, theme, p.by) + '" fill-opacity="0.9" stroke="' + T.ring + '" stroke-width="1.5"/>');
    });
    leg.forEach(function (g) {
      o.push('<circle cx="' + f1(g.x + 5) + '" cy="' + f1(g.y - 4) + '" r="5" fill="' + colourOf(g.key, theme, p.by) + '"/>');
      o.push('<text x="' + f1(g.x + 14) + '" y="' + f1(g.y) + '" font-size="11" fill="' + T.ink + '">' + esc(g.key) + '</text>');
    });
    o.push('</svg>');
    return o.join('');
  }
  function legendItems(p) {
    var c = {};
    p.pts.forEach(function (d) { c[d.key] = (c[d.key] || 0) + 1; });
    var keys = Object.keys(c).sort(function (x, y) {
      var i = p.by === 'Mount' ? mIndex(x) : groups.indexOf(x), j = p.by === 'Mount' ? mIndex(y) : groups.indexOf(y);
      return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || (x < y ? -1 : 1);
    });
    return keys.map(function (k) { return { key: k, n: c[k] }; });
  }

  var cur = null;
  function draw() {
    cur = pick();
    var items = legendItems(cur);
    $('tern-legend').innerHTML = items.length > 1 ? items.map(function (g) {
      return '<button type="button" class="tern-key' + (hidden[g.key] ? ' off' : '') + '" data-key="' + esc(g.key) + '">' +
        '<span class="sw" style="background:' + colourOf(g.key, 'dark', cur.by) + '"></span>' + esc(g.key) + ' <span class="muted">' + g.n + '</span></button>';
    }).join('') : '';
    $('tern-legend').querySelectorAll('.tern-key').forEach(function (b) {
      b.addEventListener('click', function () { hidden[b.dataset.key] = !hidden[b.dataset.key]; draw(); });
    });
    $('tern-plot').innerHTML = svg(cur, 'dark', false);
    var shown = cur.pts.filter(function (d) { return !hidden[d.key]; }).length;
    $('tern-note').textContent = shown + ' spot' + (shown === 1 ? '' : 's') + ' plotted. Each spot\'s three values are scaled to sum to 1.' +
      (cur.filtered ? ' ' + cur.filtered + ' hidden by the options above.' : '') +
      (cur.skipped ? ' ' + cur.skipped + ' without values for all three (non-apatite rows, blanks).' : '') +
      (cur.by === 'Sample ID' && groups.length > 8 ? ' Samples after the eighth are grey.' : '') +
      (cur.by === 'Mount' && chosen.some(function (m) { return mIndex(m) >= 8; }) ? ' Mounts after the eighth in the list are grey.' : '');
    if (!$('tern-table').hidden) table();
  }

  // hover tooltip (hit area bigger than the dot: nearest point within 12 px)
  var plot = $('tern-plot'), tip = $('tern-tip');
  plot.addEventListener('mousemove', function (ev) {
    var s = plot.querySelector('svg'); if (!s || !cur) return;
    var r = s.getBoundingClientRect(), k = W / r.width, mx = (ev.clientX - r.left) * k, my = (ev.clientY - r.top) * k, best = null, bd = 144 * k * k;
    s.querySelectorAll('circle[data-i]').forEach(function (c) {
      var dx = +c.getAttribute('cx') - mx, dy = +c.getAttribute('cy') - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; }
    });
    if (!best) { tip.hidden = true; return; }
    var d = cur.pts[+best.dataset.i];
    tip.innerHTML = '<strong>' + esc(d.spot) + '</strong>' + (d.sample || chosen.length > 1 ? '<br>' + esc([chosen.length > 1 ? d.mount : '', d.sample].filter(Boolean).join(' · ')) : '') +
      '<br>' + esc(short(cur.A)) + ' ' + esc(d.ra) + ' · ' + esc(short(cur.B)) + ' ' + esc(d.rb) + ' · ' + esc(short(cur.C)) + ' ' + esc(d.rc) +
      (d.comment ? '<br><span class="muted">' + esc(d.comment) + '</span>' : '');
    tip.hidden = false;
    var wr = plot.parentNode.getBoundingClientRect();
    var x = ev.clientX - wr.left + 14, y = ev.clientY - wr.top + 14;
    if (x + tip.offsetWidth > wr.width) x = ev.clientX - wr.left - tip.offsetWidth - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  plot.addEventListener('mouseleave', function () { tip.hidden = true; });

  // data table view
  function table() {
    var t = $('tern-table'), p = cur;
    t.innerHTML = '<div class="table-scroll"><table><thead><tr><th>Mount</th><th>Spot ID</th><th>Sample ID</th><th>' + esc(p.A) + '</th><th>' + esc(p.B) + '</th><th>' + esc(p.C) + '</th></tr></thead><tbody>' +
      p.pts.filter(function (d) { return !hidden[d.key]; }).map(function (d) {
        return '<tr><td>' + esc(d.mount) + '</td><td>' + esc(d.spot) + '</td><td>' + esc(d.sample) + '</td><td>' + esc(d.ra) + '</td><td>' + esc(d.rb) + '</td><td>' + esc(d.rc) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  $('tern-table-btn').addEventListener('click', function () {
    var t = $('tern-table'); t.hidden = !t.hidden; this.textContent = t.hidden ? 'Show data table' : 'Hide data table';
    if (!t.hidden) table();
  });

  // exports: light background so they drop straight into a paper or poster
  function save(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  document.querySelectorAll('[data-tern-dl]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!cur) return;
      var s = svg(cur, 'light', true), base = (chosen.length === 1 ? chosen[0] : chosen.length + '_mounts') + '_ternary_' + [cur.A, cur.B, cur.C].map(short).join('-');
      if (b.dataset.ternDl === 'svg') return save(new Blob([s], { type: 'image/svg+xml' }), base + '.svg');
      var img = new Image(), sc = 3;
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = img.width * sc; c.height = Math.ceil(img.height * sc);
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (bl) { save(bl, base + '.png'); }, 'image/png');
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  });
})();
