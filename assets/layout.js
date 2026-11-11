// Mount layout: a schematic of the mount (round or rectangular) with sample regions,
// numbered fiducial markers and notes. Shown on the mount page; drawn in the builder.
// Saved as a history entry (type: layout); the newest one is shown.
//
// Layout data (all lengths in mm, origin at the top-left of the mount's outline):
//   { v: 1, shape: "round"|"rect", w, h, orient: true|false,
//     regions:   [{ x, y, w, h, label }],
//     fiducials: [{ x, y }],                // numbered 1, 2, 3… in this order
//     notes:     [{ x, y, text, size }],   // text may have line breaks; size = text height in mm
//     arrows:    [{ x1, y1, x2, y2 }],     // head at x2, y2
//     shapes:    [{ kind, x, y, s, rot }] } // circle|square|triangle|hexprism|diamond; s = size in mm
// Notes, arrows and shapes may sit outside the mount, in the margin around it.
(function () {
  // Clearly different colours (Tableau 10 order), so neighbouring samples never look alike
  var COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#ff7f0e', '#9467bd', '#e377c2', '#8c564b', '#17becf', '#bcbd22', '#7f7f7f'];
  var FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';
  // Margin around the mount (mm): room for notes and arrows outside the mount
  function marg(L) { return r2(3 + 0.05 * Math.max(L.w, L.h)); }
  function noteSize(L, n) { return n.size || r2(0.76 * Math.max(L.w, L.h) / 25); }
  var SHAPES = { circle: 'Circle', square: 'Square', triangle: 'Triangle', hexprism: 'Hex prism', diamond: 'Diamond' };
  // Outline of a shape centred on 0,0 (size s = overall width)
  function shapePath(k, s) {
    var h = s / 2, pts;
    if (k === 'square') pts = [[-h, -h], [h, -h], [h, h], [-h, h]];
    else if (k === 'triangle') { var th = s * 0.866; pts = [[0, -th * 2 / 3], [h, th / 3], [-h, th / 3]]; }
    else if (k === 'diamond') pts = [[0, -h * 1.4], [h * 0.8, 0], [0, h * 1.4], [-h * 0.8, 0]];
    else if (k === 'hexprism') { var w = s * 0.42, t = s * 0.18; pts = [[-h, 0], [-h + t, -w / 2], [h - t, -w / 2], [h, 0], [h - t, w / 2], [-h + t, w / 2]]; }
    if (!pts) return null;
    return 'M' + pts.map(function (p) { return r2(p[0]) + ' ' + r2(p[1]); }).join('L') + 'Z';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  // Each sample keeps one colour everywhere on the page: the mount's sample order first,
  // then any other region labels in the order they appear.
  function colorFor(label, labels) {
    var i = labels.indexOf(label);
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  }
  function labelsOf(L, order) {
    var out = (order || []).slice();
    (L.regions || []).forEach(function (r) { if (out.indexOf(r.label) === -1) out.push(r.label); });
    return out;
  }
  // Fiducial coordinates relative to the mount centre, x to the right and y up (mm)
  function fidCoords(L) {
    return (L.fiducials || []).map(function (f, i) {
      return { n: i + 1, x: r2(f.x - L.w / 2), y: r2(L.h / 2 - f.y) };
    });
  }

  // ---------- drawing (shared by the page and the builder) ----------
  // opts: { title, lines: [smaller lines under the title], editing, selected: {kind, i},
  //         points: [{ n, x, y }] measured grain positions in drawing mm, pointLabels, hideFids }
  function render(L, opts) {
    opts = opts || {};
    var sub = opts.title ? (opts.lines || []).filter(Boolean) : [];
    var oy = opts.title ? 3 + sub.length * 1.4 : 0;
    var M = marg(L);
    var W = L.w + 2 * M, H = L.h + 2 * M + oy;
    var u = Math.max(L.w, L.h) / 25;           // text scales with the mount
    var labels = labelsOf(L, opts.order || sampleOrder), sel = opts.selected || {};
    var o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r2(W) + ' ' + r2(H) + '" width="' + r2(W * 20) + '" height="' + r2(H * 20) + '" font-family="' + FONT + '">');
    o.push('<rect width="' + r2(W) + '" height="' + r2(H) + '" fill="#fff"/>');
    if (opts.title) o.push('<text x="' + M + '" y="' + r2(2.4) + '" font-size="' + r2(1.7) + '" font-weight="700" fill="#222">' + esc(opts.title) + '</text>');
    sub.forEach(function (t, i) {
      o.push('<text x="' + M + '" y="' + r2(2.4 + 1.4 * (i + 1)) + '" font-size="' + r2(1.0) + '" fill="#555">' + esc(t) + '</text>');
    });
    o.push('<g transform="translate(' + M + ' ' + r2(M + oy) + ')">');
    // mount body
    if (L.shape === 'round') {
      o.push('<ellipse cx="' + r2(L.w / 2) + '" cy="' + r2(L.h / 2) + '" rx="' + r2(L.w / 2) + '" ry="' + r2(L.h / 2) + '" fill="#e8e1cf" stroke="#6b6658" stroke-width="' + r2(0.12 * u) + '"/>');
    } else {
      o.push('<rect width="' + r2(L.w) + '" height="' + r2(L.h) + '" rx="' + r2(0.6 * u) + '" fill="#e8e1cf" stroke="#6b6658" stroke-width="' + r2(0.12 * u) + '"/>');
    }
    if (opts.editing && opts.grid) {
      var g = [];
      for (var gx = 1; gx < L.w; gx++) g.push('M' + gx + ' 0V' + L.h);
      for (var gy = 1; gy < L.h; gy++) g.push('M0 ' + gy + 'H' + L.w);
      o.push('<path d="' + g.join('') + '" stroke="#000" stroke-opacity=".07" stroke-width=".04"/>');
    }
    // orientation mark: a notch at the top
    if (L.orient) {
      var t = 0.9 * u;
      o.push('<path d="M' + r2(L.w / 2 - t) + ' ' + r2(-t * 1.1) + 'L' + r2(L.w / 2 + t) + ' ' + r2(-t * 1.1) + 'L' + r2(L.w / 2) + ' ' + r2(t * 0.5) + 'Z" fill="#6b6658"/>');
    }
    // sample regions
    (L.regions || []).forEach(function (r, i) {
      var c = colorFor(r.label, labels), on = sel.kind === 'region' && sel.i === i;
      o.push('<g data-kind="region" data-i="' + i + '" class="lay-item">');
      o.push('<rect x="' + r2(r.x) + '" y="' + r2(r.y) + '" width="' + r2(r.w) + '" height="' + r2(r.h) + '" fill="' + c + '" fill-opacity=".14" stroke="' + c +
        '" stroke-width="' + r2((on ? 0.22 : 0.12) * u) + '"' + (on ? ' stroke-dasharray="' + r2(0.5 * u) + ' ' + r2(0.25 * u) + '"' : '') + ' rx="' + r2(0.25 * u) + '"/>');
      var fs = Math.max(0.5, Math.min(1.25 * u, r.h * 0.35, (r.w * 0.9) / (Math.max(3, String(r.label).length) * 0.62)));
      o.push('<text x="' + r2(r.x + r.w / 2) + '" y="' + r2(r.y + r.h / 2 + fs * 0.35) + '" font-size="' + r2(fs) + '" font-weight="700" fill="' + c + '" text-anchor="middle" pointer-events="none">' + esc(r.label) + '</text>');
      if (on && opts.editing) {
        var hs = 0.9 * u;
        o.push('<rect data-handle="resize" x="' + r2(r.x + r.w - hs / 2) + '" y="' + r2(r.y + r.h - hs / 2) + '" width="' + r2(hs) + '" height="' + r2(hs) + '" fill="#fff" stroke="' + c + '" stroke-width="' + r2(0.12 * u) + '" style="cursor:nwse-resize"/>');
      }
      o.push('</g>');
    });
    // shapes (grains, features)
    (L.shapes || []).forEach(function (sh, i) {
      var on = sel.kind === 'shape' && sel.i === i, sw = r2((on ? 0.2 : 0.12) * u);
      var tr = 'translate(' + r2(sh.x) + ' ' + r2(sh.y) + ')' + (sh.rot ? ' rotate(' + r2(sh.rot) + ')' : '');
      var d = shapePath(sh.kind, sh.s);
      o.push('<g data-kind="shape" data-i="' + i + '" class="lay-item" transform="' + tr + '">' +
        (d ? '<path d="' + d + '"' : '<circle r="' + r2(sh.s / 2) + '"') +
        ' fill="#fff" fill-opacity=".35" stroke="#222" stroke-width="' + sw + '" stroke-linejoin="round"' +
        (on ? ' stroke-dasharray="' + r2(0.4 * u) + ' ' + r2(0.2 * u) + '"' : '') + '/></g>');
    });
    // arrows
    (L.arrows || []).forEach(function (a, i) {
      var on = sel.kind === 'arrow' && sel.i === i, sw = 0.12 * u;
      var dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
      var hl = Math.min(0.9 * u, len * 0.6), hw = hl * 0.45;
      var bx = a.x2 - ux * hl, by = a.y2 - uy * hl;
      o.push('<g data-kind="arrow" data-i="' + i + '" class="lay-item">' +
        '<line x1="' + r2(a.x1) + '" y1="' + r2(a.y1) + '" x2="' + r2(a.x2) + '" y2="' + r2(a.y2) + '" stroke="transparent" stroke-width="' + r2(1.2 * u) + '"/>' +
        '<line x1="' + r2(a.x1) + '" y1="' + r2(a.y1) + '" x2="' + r2(bx + ux * hl * 0.3) + '" y2="' + r2(by + uy * hl * 0.3) + '" stroke="' + (on ? '#b8860b' : '#222') + '" stroke-width="' + r2(sw) + '" stroke-linecap="round"/>' +
        '<path d="M' + r2(a.x2) + ' ' + r2(a.y2) + 'L' + r2(bx - uy * hw) + ' ' + r2(by + ux * hw) + 'L' + r2(bx + uy * hw) + ' ' + r2(by - ux * hw) + 'Z" fill="' + (on ? '#b8860b' : '#222') + '"/>');
      if (on && opts.editing) {
        var hr = 0.45 * u;
        o.push('<circle data-handle="a1" cx="' + r2(a.x1) + '" cy="' + r2(a.y1) + '" r="' + r2(hr) + '" fill="#fff" stroke="#b8860b" stroke-width="' + r2(sw) + '" style="cursor:move"/>' +
          '<circle data-handle="a2" cx="' + r2(a.x2) + '" cy="' + r2(a.y2) + '" r="' + r2(hr) + '" fill="#fff" stroke="#b8860b" stroke-width="' + r2(sw) + '" style="cursor:move"/>');
      }
      o.push('</g>');
    });
    // notes (line breaks become separate lines)
    (L.notes || []).forEach(function (n, i) {
      var on = sel.kind === 'note' && sel.i === i, fs = noteSize(L, n);
      var lines = String(n.text == null ? '' : n.text).split('\n');
      o.push('<g data-kind="note" data-i="' + i + '" class="lay-item"><text x="' + r2(n.x) + '" y="' + r2(n.y) + '" font-size="' + r2(fs) + '" font-style="italic" fill="#444"' +
        (on ? ' text-decoration="underline"' : '') + '>' +
        lines.map(function (t, k) { return '<tspan x="' + r2(n.x) + '"' + (k ? ' dy="' + r2(fs * 1.2) + '"' : '') + '>' + (esc(t) || ' ') + '</tspan>'; }).join('') +
        '</text></g>');
    });
    // fiducials
    (opts.hideFids ? [] : L.fiducials || []).forEach(function (f, i) {
      var on = sel.kind === 'fid' && sel.i === i, s = 0.525 * u, sw = r2(0.12 * u);
      o.push('<g data-kind="fid" data-i="' + i + '" class="lay-item">' +
        '<circle cx="' + r2(f.x) + '" cy="' + r2(f.y) + '" r="' + r2(s * 1.3) + '" fill="' + (on ? '#ffe9a8' : '#fff') + '" fill-opacity=".85" stroke="#111" stroke-width="' + sw + '"/>' +
        '<path d="M' + r2(f.x - s * 1.9) + ' ' + r2(f.y) + 'H' + r2(f.x + s * 1.9) + 'M' + r2(f.x) + ' ' + r2(f.y - s * 1.9) + 'V' + r2(f.y + s * 1.9) + '" stroke="#111" stroke-width="' + sw + '"/>' +
        '<text x="' + r2(f.x + s * 1.5) + '" y="' + r2(f.y - s * 1.5) + '" font-size="' + r2(1.05 * u) + '" font-weight="700" fill="#111" pointer-events="none">' + (i + 1) + '</text></g>');
    });
    // measured grain positions (from the grain coordinate file)
    if (opts.points && opts.points.length) {
      var pr = r2(0.11 * u), pfs = r2(0.42 * u);
      o.push('<g class="lay-points">');
      opts.points.forEach(function (p) {
        o.push('<circle cx="' + r2(p.x) + '" cy="' + r2(p.y) + '" r="' + pr + '" fill="#0b57d0" stroke="#fff" stroke-width="' + r2(0.04 * u) + '"><title>' + esc(p.n) + '</title></circle>');
        if (opts.pointLabels) o.push('<text x="' + r2(p.x + pr * 1.3) + '" y="' + r2(p.y - pr * 0.6) + '" font-size="' + pfs + '" fill="#0b3d91">' + esc(p.n) + '</text>');
      });
      o.push('</g>');
    }
    o.push('</g>');
    // scale bar (not on thumbnails)
    if (!opts.thumb) {
    var bar = L.w >= 20 ? 5 : L.w >= 8 ? 2 : 1;
    var bx = W - M - bar, by = H - 0.9;
    o.push('<path d="M' + r2(bx) + ' ' + r2(by) + 'h' + bar + '" stroke="#222" stroke-width="' + r2(0.18 * u) + '"/>' +
      '<text x="' + r2(bx + bar / 2) + '" y="' + r2(by - 0.45) + '" font-size="' + r2(0.9 * u) + '" fill="#222" text-anchor="middle">' + bar + ' mm</text>');
    }
    o.push('</svg>');
    return o.join('');
  }
  var sampleOrder = [];
  try { sampleOrder = JSON.parse((document.getElementById('sample-order') || {}).textContent || '[]'); } catch (e) {}
  function sampleColor(id) { return colorFor(String(id), labelsOf({ regions: [] }, sampleOrder)); }
  window.MountLayout = { render: render, fidCoords: fidCoords, sampleColor: sampleColor };

  // Colour dots beside samples (Samples table, EarthBank cards) so they match the drawing and the map
  if (sampleOrder.length) {
    document.querySelectorAll('[data-sample]').forEach(function (el) {
      var dot = document.createElement('span');
      dot.className = 'sdot'; dot.style.background = sampleColor(el.dataset.sample);
      dot.title = 'Colour used for ' + el.dataset.sample + ' in the layout and map';
      var h = el.querySelector('h3') || el;
      h.insertBefore(dot, h.firstChild);
    });
  }

  // ---------- on the mount page ----------
  var view = document.getElementById('layout-view');
  var dataEl = document.getElementById('layout-data');
  var saved = null;
  try { saved = dataEl ? JSON.parse(dataEl.textContent) : null; } catch (e) { saved = null; }
  var mountId = view ? view.dataset.mount : '';
  var mstate = {};
  try { mstate = JSON.parse(document.getElementById('mount-state').textContent) || {}; } catch (e) {}
  if (!mountId) mountId = mstate.mount_id || '';
  // Under the mount ID: polish, then coating (only when filled in)
  function filled(v) { v = String(v == null ? '' : v).trim(); return /^(none|na|n\/a|-|no)$/i.test(v) ? '' : v; }
  var mf = mstate.fields || {};
  var titleLines = [filled(mf.polish) && 'Polish: ' + filled(mf.polish), filled(mf.coating) && 'Coating: ' + filled(mf.coating)];
  // ---- grain points: stage coordinates (µm) placed on the drawing through the three fiducials ----
  // An affine fit maps the file's First, Second, Third onto drawn fiducials 1, 2, 3 exactly,
  // so each point sits where it really is relative to the fiducials.
  var grains = null, show = { fids: true, points: true, labels: false }, gpts = [];
  try { grains = JSON.parse((document.getElementById('grain-data') || {}).textContent || 'null'); } catch (e) {}
  function solve3(a, b) {                     // a: 3x3, b: 3 → x (Cramer's rule)
    function det(m) { return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); }
    var d = det(a);
    if (Math.abs(d) < 1e-9) return null;
    return [0, 1, 2].map(function (c) {
      var m = a.map(function (row, r) { return row.map(function (v, k) { return k === c ? b[r] : v; }); });
      return det(m) / d;
    });
  }
  function placePoints() {
    var note = document.getElementById('grain-note');
    if (!grains || !saved) return;
    var df = saved.fiducials || [];
    if (df.length < 3) { if (note) note.textContent = 'Draw three fiducial markers on the layout to show the grain points.'; return; }
    var A = grains.fids.map(function (f) { return [f[1], f[2], 1]; });
    var cx = solve3(A, df.slice(0, 3).map(function (f) { return f.x; }));
    var cy = solve3(A, df.slice(0, 3).map(function (f) { return f.y; }));
    if (!cx || !cy) { if (note) note.textContent = 'The three fiducials in the file are in a line, so the points can\'t be placed.'; return; }
    gpts = grains.points.map(function (p) { return { n: p[0], x: cx[0] * p[1] + cx[1] * p[2] + cx[2], y: cy[0] * p[1] + cy[1] * p[2] + cy[2] }; });
    if (note) {
      var k = Math.sqrt(Math.abs(cx[0] * cy[1] - cx[1] * cy[0])) / 0.001;   // drawing mm per real mm
      note.textContent = grains.points.length + ' points from ' + grains.file + ', placed using its fiducials ' +
        grains.fids.map(function (f) { return f[0]; }).join(', ') + ' on drawn fiducials 1, 2, 3' +
        (Math.abs(k - 1) > 0.05 ? ' (the drawing is about ' + Math.round(k * 100) + '% of true size).' : '.');
    }
  }
  placePoints();
  function viewOpts() {
    return { title: mountId, lines: titleLines, hideFids: !show.fids,
      points: show.points ? gpts : null, pointLabels: show.labels };
  }
  document.querySelectorAll('[data-show]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      show[cb.dataset.show] = cb.checked;
      if (view && saved) view.innerHTML = render(saved, viewOpts());
    });
  });

  if (view && saved) {
    view.innerHTML = render(saved, viewOpts());
    var tbl = document.getElementById('layout-fids');
    if (tbl) {
      var fc = fidCoords(saved);
      tbl.innerHTML = fc.length ? '<table class="small"><thead><tr><th>Fiducial</th><th>x (mm)</th><th>y (mm)</th></tr></thead><tbody>' +
        fc.map(function (f) { return '<tr><td>' + f.n + '</td><td class="mono">' + f.x.toFixed(2) + '</td><td class="mono">' + f.y.toFixed(2) + '</td></tr>'; }).join('') +
        '</tbody></table><p class="muted small">From the centre of the mount, x to the right and y towards the top (orientation mark).</p>' : '';
    }
  }

  function download(svg, name, fmt) {
    var blob = new Blob([svg], { type: 'image/svg+xml' });
    function save(b, n) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    if (fmt === 'svg') return save(blob, name + '.svg');
    var vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), img = new Image();
    img.onload = function () {
      var k = 2400 / Math.max(+vb[1], +vb[2]);
      var cv = document.createElement('canvas'); cv.width = Math.round(vb[1] * k); cv.height = Math.round(vb[2] * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(function (b) { save(b, name + '.png'); }, 'image/png');
    };
    img.src = URL.createObjectURL(blob);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-layout-dl]');
    if (!b || !saved) return;
    download(render(saved, viewOpts()), mountId + '_layout', b.dataset.layoutDl);
  });

  // ---------- the builder ----------
  var dlg = document.getElementById('layout-dialog');
  if (!dlg) return;
  var stage = document.getElementById('lay-stage');
  var props = document.getElementById('lay-props'), lists = document.getElementById('lay-lists');
  var errBox = document.getElementById('lay-error');
  var state = {};
  try { state = JSON.parse(document.getElementById('mount-state').textContent); } catch (e) {}
  var samples = (state.samples || []).map(function (s) { return String(s.id); });
  var L, tool = 'select', sel = {}, undo = [], snap = true, grid = true;

  function blank() {
    var fmt = (dlg.dataset.format || '').toLowerCase();
    var nums = (fmt.match(/\d+(\.\d+)?/g) || []).map(Number);
    var rect = /rect|slide|block|square|\bx\b|×/.test(fmt) && nums.length >= 2;
    var w = nums[0] || 25, h = rect ? nums[1] : w;
    return { v: 1, shape: rect ? 'rect' : 'round', w: w, h: h, orient: true, regions: [], fiducials: [], notes: [], arrows: [], shapes: [] };
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function push() { undo.push(clone(L)); if (undo.length > 100) undo.shift(); }
  function listOf(k) { return { region: L.regions, fid: L.fiducials, note: L.notes, arrow: L.arrows, shape: L.shapes }[k]; }
  var shapeKind = 'circle';

  document.querySelectorAll('[data-layout-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      L = saved ? clone(saved) : blank();
      delete L.updated; delete L.by;
      L.regions = L.regions || []; L.fiducials = L.fiducials || []; L.notes = L.notes || [];
      L.arrows = L.arrows || []; L.shapes = L.shapes || [];
      undo = []; sel = {}; setTool('select'); errBox.textContent = '';
      syncControls(); draw();
      showStep(1);
      dlg.showModal();
    });
  });
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });

  // controls
  var f = document.getElementById('lay-form').elements;
  function syncControls() {
    f.shape.value = L.shape; f.lw.value = L.w; f.lh.value = L.h; f.orient.checked = !!L.orient;
    f.snap.checked = snap; f.grid.checked = grid;
    document.getElementById('lay-h-row').hidden = L.shape === 'round';
    document.getElementById('lay-w-label').textContent = L.shape === 'round' ? 'Diameter (mm)' : 'Width (mm)';
  }
  f.shape.addEventListener('change', function () { push(); L.shape = f.shape.value; if (L.shape === 'round') L.h = L.w; clampAll(); syncControls(); draw(); });
  f.lw.addEventListener('change', function () { var v = +f.lw.value; if (v >= 3 && v <= 200) { push(); L.w = v; if (L.shape === 'round') L.h = v; clampAll(); } syncControls(); draw(); });
  f.lh.addEventListener('change', function () { var v = +f.lh.value; if (v >= 3 && v <= 200) { push(); L.h = v; clampAll(); } syncControls(); draw(); });
  f.orient.addEventListener('change', function () { push(); L.orient = f.orient.checked; draw(); });
  f.snap.addEventListener('change', function () { snap = f.snap.checked; });
  f.grid.addEventListener('change', function () { grid = f.grid.checked; draw(); });

  var kindSel = document.getElementById('lay-shape-kind');
  if (kindSel) kindSel.addEventListener('change', function () { shapeKind = kindSel.value; setTool('shape'); });
  document.getElementById('lay-tools').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  function setTool(t) {
    tool = t;
    document.querySelectorAll('#lay-tools [data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
    stage.dataset.tool = t;
    var hint = { select: 'Drag items to move them. Drag a region\'s corner square to resize. Delete removes the selected item.',
      region: 'Drag on the mount to draw a sample region (or click for a standard size).',
      fid: 'Click to place fiducial markers; they are numbered 1, 2, 3… in the order placed.',
      note: 'Click to add a text note, then type it on the right (Return starts a new line).',
      arrow: 'Drag from where the arrow starts to the point it should point at.',
      shape: 'Click to place the shape chosen in the list; change its size and angle on the right.' }[t];
    document.getElementById('lay-hint').textContent = hint;
  }
  document.getElementById('lay-undo').addEventListener('click', doUndo);
  function doUndo() { if (undo.length) { L = undo.pop(); sel = {}; syncControls(); draw(); } }
  document.getElementById('lay-auto').addEventListener('click', function () {
    if (!samples.length) return;
    push(); L.regions = autoRegions(); sel = {}; draw();
  });
  document.getElementById('lay-clear').addEventListener('click', function () {
    if (!L.regions.length && !L.fiducials.length && !L.notes.length && !L.arrows.length && !L.shapes.length) return;
    push(); L.regions = []; L.fiducials = []; L.notes = []; L.arrows = []; L.shapes = []; sel = {}; draw();
  });

  // Lay the mount's samples out in a tidy grid inside the outline
  function autoRegions() {
    var n = samples.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    var inset = L.shape === 'round' ? L.w * 0.18 : L.w * 0.08, insetY = L.shape === 'round' ? L.h * 0.18 : L.h * 0.08;
    var aw = L.w - 2 * inset, ah = L.h - 2 * insetY, gap = Math.min(aw, ah) * 0.06;
    var cw = (aw - gap * (cols - 1)) / cols, ch = (ah - gap * (rows - 1)) / rows;
    return samples.map(function (s, i) {
      var c = i % cols, r = Math.floor(i / cols);
      return { x: r2(inset + c * (cw + gap)), y: r2(insetY + r * (ch + gap)), w: r2(cw), h: r2(ch), label: s };
    });
  }

  // ---------- drawing area ----------
  function draw() {
    stage.innerHTML = render(L, { editing: true, grid: grid, selected: sel });
    var svg = stage.querySelector('svg');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    drawProps(); drawLists();
  }
  function toMm(ev) {
    var svg = stage.querySelector('svg'), pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    var p = pt.matrixTransform(svg.getScreenCTM().inverse());
    var m = marg(L);
    return { x: p.x - m, y: p.y - m };
  }
  function snapv(v) { return snap ? Math.round(v * 2) / 2 : r2(v); }
  function clampPt(p) { return { x: Math.min(L.w, Math.max(0, p.x)), y: Math.min(L.h, Math.max(0, p.y)) }; }
  // Notes, arrows and shapes may go into the margin
  function clampFree(p) { var m = marg(L) - 0.3; return { x: Math.min(L.w + m, Math.max(-m, p.x)), y: Math.min(L.h + m, Math.max(-m, p.y)) }; }
  function clampItem(kind, it) {
    if (kind === 'region') return clampRegion(it);
    if (kind === 'arrow') {
      var a = clampFree({ x: it.x1, y: it.y1 }), b = clampFree({ x: it.x2, y: it.y2 });
      it.x1 = a.x; it.y1 = a.y; it.x2 = b.x; it.y2 = b.y; return;
    }
    var c = kind === 'fid' ? clampPt(it) : clampFree(it); it.x = c.x; it.y = c.y;
  }
  function moveItem(kind, it, orig, dx, dy) {
    if (kind === 'arrow') {
      it.x1 = snapv(orig.x1 + dx); it.y1 = snapv(orig.y1 + dy); it.x2 = snapv(orig.x2 + dx); it.y2 = snapv(orig.y2 + dy);
    } else { it.x = snapv(orig.x + dx); it.y = snapv(orig.y + dy); }
    clampItem(kind, it);
  }
  function clampRegion(r) {
    r.w = Math.max(0.5, Math.min(r.w, L.w)); r.h = Math.max(0.5, Math.min(r.h, L.h));
    r.x = Math.min(L.w - r.w, Math.max(0, r.x)); r.y = Math.min(L.h - r.h, Math.max(0, r.y));
  }
  function clampAll() {
    L.regions.forEach(clampRegion);
    L.fiducials.forEach(function (p) { var c = clampPt(p); p.x = c.x; p.y = c.y; });
    L.notes.forEach(function (p) { clampItem('note', p); });
    L.shapes.forEach(function (p) { clampItem('shape', p); });
    L.arrows.forEach(function (p) { clampItem('arrow', p); });
  }
  function nextLabel() {
    var used = L.regions.map(function (r) { return r.label; });
    for (var i = 0; i < samples.length; i++) if (used.indexOf(samples[i]) === -1) return samples[i];
    return 'Sample ' + (L.regions.length + 1);
  }

  var drag = null;
  stage.addEventListener('pointerdown', function (ev) {
    if (!L || ev.button !== 0) return;
    var p = toMm(ev), item = ev.target.closest('.lay-item'), handle = ev.target.closest('[data-handle]');
    stage.setPointerCapture(ev.pointerId);
    if (tool === 'select') {
      if (handle && sel.kind === 'region') {
        push(); drag = { mode: 'resize', start: p, orig: clone(L.regions[sel.i]) };
      } else if (handle && sel.kind === 'arrow') {
        push(); drag = { mode: 'end', end: handle.dataset.handle };
      } else if (item) {
        sel = { kind: item.dataset.kind, i: +item.dataset.i };
        push(); drag = { mode: 'move', start: p, orig: clone(listOf(sel.kind)[sel.i]), moved: false };
        draw();
      } else { sel = {}; draw(); }
    } else if (tool === 'region') {
      push();
      var s = clampPt(p);
      L.regions.push({ x: snapv(s.x), y: snapv(s.y), w: 0, h: 0, label: nextLabel() });
      sel = { kind: 'region', i: L.regions.length - 1 };
      drag = { mode: 'draw', start: { x: snapv(s.x), y: snapv(s.y) } };
      draw();
    } else if (tool === 'fid') {
      push(); var c = clampPt(p);
      L.fiducials.push({ x: snapv(c.x), y: snapv(c.y) });
      sel = { kind: 'fid', i: L.fiducials.length - 1 }; draw();
    } else if (tool === 'note') {
      push(); var cn = clampFree(p);
      L.notes.push({ x: snapv(cn.x), y: snapv(cn.y), text: 'Note', size: r2(0.76 * Math.max(L.w, L.h) / 25) });
      sel = { kind: 'note', i: L.notes.length - 1 }; setTool('select'); draw();
      var inp = props.querySelector('[data-prop="text"]'); if (inp) { inp.focus(); inp.select(); }
    } else if (tool === 'arrow') {
      push(); var ca = clampFree(p), ax = snapv(ca.x), ay = snapv(ca.y);
      L.arrows.push({ x1: ax, y1: ay, x2: ax, y2: ay });
      sel = { kind: 'arrow', i: L.arrows.length - 1 };
      drag = { mode: 'end', end: 'a2', fresh: true };
      draw();
    } else if (tool === 'shape') {
      push(); var cs = clampFree(p);
      L.shapes.push({ kind: shapeKind, x: snapv(cs.x), y: snapv(cs.y), s: r2(Math.max(0.8, 1.4 * Math.max(L.w, L.h) / 25)), rot: 0 });
      sel = { kind: 'shape', i: L.shapes.length - 1 }; setTool('select'); draw();
    }
    ev.preventDefault();
  });
  stage.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var p = toMm(ev), st0 = drag.start || p, dx = p.x - st0.x, dy = p.y - st0.y;
    if (drag.mode === 'move') {
      moveItem(sel.kind, listOf(sel.kind)[sel.i], drag.orig, dx, dy);
      drag.moved = true;
    } else if (drag.mode === 'end') {
      var ar = L.arrows[sel.i], e2 = clampFree(p), k = drag.end === 'a1' ? '1' : '2';
      ar['x' + k] = snapv(e2.x); ar['y' + k] = snapv(e2.y);
    } else if (drag.mode === 'resize') {
      var r = L.regions[sel.i];
      r.w = snapv(Math.max(0.5, drag.orig.w + dx)); r.h = snapv(Math.max(0.5, drag.orig.h + dy));
      clampRegion(r);
    } else if (drag.mode === 'draw') {
      var q = clampPt(p), rr = L.regions[sel.i];
      rr.x = snapv(Math.min(drag.start.x, q.x)); rr.y = snapv(Math.min(drag.start.y, q.y));
      rr.w = snapv(Math.abs(q.x - drag.start.x)); rr.h = snapv(Math.abs(q.y - drag.start.y));
    }
    draw();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.mode === 'draw') {
      var r = L.regions[sel.i];
      if (r.w < 0.8 || r.h < 0.8) {               // a click: standard-size region centred there
        var sz = Math.max(2, Math.round(Math.min(L.w, L.h) / 5));
        r.w = sz; r.h = sz * 0.75; r.x = drag.start.x - r.w / 2; r.y = drag.start.y - r.h / 2;
      }
      clampRegion(r);
      setTool('select');
      draw();
      var inp = props.querySelector('[data-prop="label"]'); if (inp) inp.select();
    } else if (drag.mode === 'end' && drag.fresh) {
      var a = L.arrows[sel.i];
      if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < 0.8) {   // a click: a short arrow pointing down-right
        var d = r2(Math.max(1.5, 3 * Math.max(L.w, L.h) / 25)); a.x2 = a.x1 + d; a.y2 = a.y1 + d; clampItem('arrow', a);
      }
      setTool('select'); draw();
    } else if (drag.mode === 'move' && !drag.moved) undo.pop();
    drag = null;
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // keyboard: delete, nudge, undo, escape
  dlg.addEventListener('keydown', function (ev) {
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !typing) { ev.preventDefault(); doUndo(); return; }
    if (typing || !sel.kind) return;
    var list = listOf(sel.kind);
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); push(); list.splice(sel.i, 1); sel = {}; draw(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); sel = {}; draw(); }
    else if (/^Arrow/.test(ev.key)) {
      ev.preventDefault(); push();
      var st = ev.shiftKey ? 1 : 0.1, it = list[sel.i], ddx = 0, ddy = 0;
      if (ev.key === 'ArrowLeft') ddx = -st; if (ev.key === 'ArrowRight') ddx = st;
      if (ev.key === 'ArrowUp') ddy = -st; if (ev.key === 'ArrowDown') ddy = st;
      var keep = snap; snap = false; moveItem(sel.kind, it, clone(it), ddx, ddy); snap = keep;
      draw();
    }
  });

  // ---------- side panel ----------
  function num(label, prop, v) {
    return '<label>' + label + ' <input type="number" step="0.1" data-prop="' + prop + '" value="' + r2(v) + '"></label>';
  }
  function drawProps() {
    if (!sel.kind) {
      props.innerHTML = '<p class="muted small">Select an item to edit it.</p>';
      return;
    }
    var h = '';
    if (sel.kind === 'region') {
      var r = L.regions[sel.i];
      h = '<p class="lay-props-title">Sample region</p>' +
        '<label>Sample <input list="lay-samples" data-prop="label" value="' + esc(r.label) + '"></label>' +
        '<div class="lay-grid2">' + num('x (mm)', 'x', r.x) + num('y (mm)', 'y', r.y) + num('Width', 'w', r.w) + num('Height', 'h', r.h) + '</div>';
    } else if (sel.kind === 'fid') {
      var fd = L.fiducials[sel.i], fc = fidCoords(L)[sel.i];
      h = '<p class="lay-props-title">Fiducial ' + (sel.i + 1) + '</p>' +
        '<div class="lay-grid2">' + num('x (mm)', 'x', fd.x) + num('y (mm)', 'y', fd.y) + '</div>' +
        '<p class="muted small">From centre: ' + fc.x.toFixed(2) + ', ' + fc.y.toFixed(2) + ' mm</p>';
    } else if (sel.kind === 'arrow') {
      var a = L.arrows[sel.i];
      h = '<p class="lay-props-title">Arrow</p>' +
        '<div class="lay-grid2">' + num('Start x', 'x1', a.x1) + num('Start y', 'y1', a.y1) + num('Tip x', 'x2', a.x2) + num('Tip y', 'y2', a.y2) + '</div>' +
        '<p class="muted small">Drag the round handles to move either end.</p>';
    } else if (sel.kind === 'shape') {
      var sh = L.shapes[sel.i];
      h = '<p class="lay-props-title">Shape</p>' +
        '<label>Shape <select data-prop="kind">' + Object.keys(SHAPES).map(function (k) {
          return '<option value="' + k + '"' + (k === sh.kind ? ' selected' : '') + '>' + SHAPES[k] + '</option>';
        }).join('') + '</select></label>' +
        '<div class="lay-grid2">' + num('Size (mm)', 's', sh.s) + num('Angle (°)', 'rot', sh.rot || 0) + num('x (mm)', 'x', sh.x) + num('y (mm)', 'y', sh.y) + '</div>';
    } else {
      var n = L.notes[sel.i];
      h = '<p class="lay-props-title">Note</p><label>Text <textarea data-prop="text" rows="3">' + esc(n.text) + '</textarea></label>' +
        '<div class="lay-grid2">' + num('Text size (mm)', 'size', noteSize(L, n)) + '<span></span>' + num('x (mm)', 'x', n.x) + num('y (mm)', 'y', n.y) + '</div>';
    }
    h += '<button type="button" class="btn small" id="lay-del">Delete</button>';
    props.innerHTML = h;
  }
  props.addEventListener('change', function (e) {
    var k = e.target.dataset.prop;
    if (!k || !sel.kind) return;
    var it = listOf(sel.kind)[sel.i], v = e.target.value;
    push();
    if (k === 'label') it.label = v.trim() || nextLabel();
    else if (k === 'text') it.text = v.replace(/\s+$/, '') || 'Note';
    else if (k === 'kind') it.kind = v;
    else if (v !== '' && !isNaN(+v)) {
      v = +v;
      if (k === 's') v = Math.max(0.2, v);
      if (k === 'size') v = Math.max(0.2, Math.min(10, v));
      it[k] = v;
    }
    clampItem(sel.kind, it);
    draw();
  });
  props.addEventListener('input', function (e) {           // live label typing
    var k = e.target.dataset.prop;
    if ((k === 'label' || k === 'text') && sel.kind) {
      listOf(sel.kind)[sel.i][k] = e.target.value;
      stage.innerHTML = render(L, { editing: true, grid: grid, selected: sel });
      stage.querySelector('svg').removeAttribute('width'); stage.querySelector('svg').removeAttribute('height');
      drawLists();
    }
  });
  props.addEventListener('click', function (e) {
    if (e.target.id !== 'lay-del' || !sel.kind) return;
    push(); listOf(sel.kind).splice(sel.i, 1); sel = {}; draw();
  });
  function drawLists() {
    var used = L.regions.map(function (r) { return r.label; });
    var missing = samples.filter(function (s) { return used.indexOf(s) === -1; });
    var fc = fidCoords(L);
    lists.innerHTML =
      '<p class="lay-props-title">Fiducials (' + fc.length + ')</p>' +
      (fc.length ? '<table class="small lay-table"><tr><th>#</th><th>x</th><th>y</th></tr>' + fc.map(function (p) {
        return '<tr data-sel="fid:' + (p.n - 1) + '"><td>' + p.n + '</td><td class="mono">' + p.x.toFixed(2) + '</td><td class="mono">' + p.y.toFixed(2) + '</td></tr>';
      }).join('') + '</table><p class="muted small">mm from the centre; y towards the orientation mark.</p>' : '<p class="muted small">None yet.</p>') +
      '<p class="lay-props-title">Regions (' + L.regions.length + ')</p>' +
      (L.regions.length ? '<ul class="lay-list small">' + L.regions.map(function (r, i) {
        return '<li data-sel="region:' + i + '"><span class="dot" style="background:' + colorFor(r.label, labelsOf(L, sampleOrder)) + '"></span>' + esc(r.label) + '</li>';
      }).join('') + '</ul>' : '<p class="muted small">None yet.</p>') +
      (missing.length ? '<p class="muted small">Not placed yet: ' + missing.map(esc).join(', ') + '</p>' : '');
  }
  lists.addEventListener('click', function (e) {
    var row = e.target.closest('[data-sel]');
    if (!row) return;
    var p = row.dataset.sel.split(':');
    sel = { kind: p[0], i: +p[1] }; setTool('select'); draw();
  });

  // ---------- downloads and saving ----------
  dlg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lay-dl]');
    if (b) download(render(L, { title: mountId, lines: titleLines }), mountId + '_layout', b.dataset.layDl);
  });
  var saveBtn = document.getElementById('lay-save'), ghBtn = document.getElementById('lay-github'), backBtn = document.getElementById('lay-back');
  function direct() { return window.GH && GH.canWrite(); }
  function setSaveLabel() { saveBtn.textContent = direct() ? 'Save layout' : 'Next'; }
  document.addEventListener('gh-auth', setSaveLabel);
  function showStep(n) {
    document.getElementById('lay-step-edit').hidden = n !== 1;
    document.getElementById('lay-step-done').hidden = n !== 2;
    saveBtn.hidden = n !== 1; backBtn.hidden = n !== 2; ghBtn.hidden = n !== 2;
    document.getElementById('lay-saved').hidden = true; document.getElementById('lay-gh').hidden = false;
    setSaveLabel();
  }
  backBtn.addEventListener('click', function () { showStep(1); });
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  saveBtn.addEventListener('click', function () {
    var out = { v: 1, shape: L.shape, w: L.w, h: L.h, orient: !!L.orient,
      regions: L.regions.map(function (r) { return { x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h), label: r.label }; }),
      fiducials: L.fiducials.map(function (p) { return { x: r2(p.x), y: r2(p.y) }; }),
      notes: L.notes.map(function (n) { return { x: r2(n.x), y: r2(n.y), text: n.text, size: r2(noteSize(L, n)) }; }),
      arrows: L.arrows.map(function (a) { return { x1: r2(a.x1), y1: r2(a.y1), x2: r2(a.x2), y2: r2(a.y2) }; }),
      shapes: L.shapes.map(function (sh) { return { kind: sh.kind, x: r2(sh.x), y: r2(sh.y), s: r2(sh.s), rot: r2(sh.rot || 0) }; }) };
    var now = new Date(), by = '';
    try { by = localStorage.getItem('mounts.by') || ''; } catch (e) {}
    if (!by && window.GH && GH.user) by = GH.user.name;
    var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var text = 'date: "' + date + '"\n' + (by ? 'by: ' + JSON.stringify(by) + '\n' : '') + 'type: layout\nlayout: ' + JSON.stringify(JSON.stringify(out)) + '\n';
    var path = '_data/log/' + mountId + '/' + date.replace(/[-: ]/g, '').slice(0, 8) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-layout.yml';
    document.getElementById('lay-out').value = text;
    if (direct()) {
      saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner"></span> Saving…';
      GH.commit([{ path: path, text: text }], 'History: ' + mountId + ' (layout)').then(function () {
        showStep(2); ghBtn.hidden = true; backBtn.hidden = true;
        document.getElementById('lay-saved').hidden = false; document.getElementById('lay-gh').hidden = true;
      }).catch(function (err) { errBox.textContent = err.message; })
        .then(function () { saveBtn.disabled = false; setSaveLabel(); });
      return;
    }
    var repo = dlg.dataset.repo, branch = dlg.dataset.branch || 'main';
    ghBtn.href = 'https://github.com/' + repo + '/new/' + branch + '?filename=' + encodeURIComponent(path) +
      '&value=' + encodeURIComponent(text) + '&message=' + encodeURIComponent('History: ' + mountId + ' (layout)');
    showStep(2);
  });
})();
