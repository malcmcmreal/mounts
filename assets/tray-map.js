// Sample page: where this sample's vials sit in their trays. A catalogue number is tray, row
// letter, column (17B05); rows A–N run bottom to top and columns 01–36 left to right. Positions
// come from assets/trays.json (_scripts/mount_state.py), which also corrects skipped letters and
// numbers. This sample's vials are coloured by mineral; other vials in the tray are grey and
// open their own sample page.
(function () {
  var me = document.currentScript, box = document.getElementById('tray-map');
  if (!box) return;
  var data = JSON.parse(document.getElementById('sample-data').textContent);
  var mine = (data.vials || []).map(function (v) { return String(v.catalogue || '').toUpperCase().replace(/\s+/g, ''); });
  var base = me.dataset.base || '/';
  var S = 17, R = 5.5, L = 22, B = 20, T = 6;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(c) { var m = /^(\d+)([A-Z])(\d+)$/.exec(c); return m ? (+m[1]) + m[2] + ('0' + +m[3]).slice(-2) : c; }
  var mineN = mine.map(norm);
  fetch(me.dataset.trays).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    var trays = {};
    mineN.forEach(function (c) { var m = /^(\d+)/.exec(c); if (m) trays[m[1]] = 1; });
    var keys = Object.keys(trays).sort(function (a, b) { return a - b; });
    if (!keys.length) { box.innerHTML = '<p class="muted small">No vial positions to show.</p>'; return; }
    box.innerHTML = keys.map(function (k) {
      var t = d.trays[k];
      if (!t) return '<p class="muted small">Tray ' + esc(k) + ': no positions recorded.</p>';
      var cols = t.cols, rows = d.rows.length, w = L + cols * S + 4, h = T + rows * S + B;
      var at = {};
      t.v.forEach(function (v) { at[v[0] + ',' + v[1]] = v; });
      var out = ['<svg class="tray-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Tray ' + esc(k) + '">'];
      for (var r = 0; r < rows; r++) {
        var y = T + (rows - 1 - r) * S + S / 2;
        out.push('<text class="tray-lab" x="' + (L - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + d.rows[r] + '</text>');
        for (var c = 0; c < cols; c++) {
          var x = L + c * S + S / 2, v = at[r + ',' + c];
          if (!v) { out.push('<circle class="tray-empty" cx="' + x + '" cy="' + y + '" r="' + (R - 1.5) + '" data-tip="' + k + ':' + r + ':' + c + '"/>'); continue; }
          var own = mineN.indexOf(norm(v[2].toUpperCase().replace(/\s+/g, ''))) !== -1 && v[3] === data.slug;
          var tip = ' data-tip="' + k + ':' + r + ':' + c + '"';
          if (own) out.push('<circle class="tray-own m-' + v[4] + (v[5] ? ' conc' : '') + '" cx="' + x + '" cy="' + y + '" r="' + R + '" data-cat="' + esc(v[2]) + '"' + tip + '/>');
          else out.push('<a href="' + base + 's/' + encodeURIComponent(v[3]) + '/"><circle class="tray-other" cx="' + x + '" cy="' + y + '" r="' + (R - 1) + '"' + tip + '/></a>');
        }
      }
      for (var c2 = 0; c2 < cols; c2++) {
        if (c2 === 0 || (c2 + 1) % 5 === 0 || c2 === cols - 1)
          out.push('<text class="tray-lab" x="' + (L + c2 * S + S / 2) + '" y="' + (h - 5) + '" text-anchor="middle">' + ('0' + (c2 + 1)).slice(-2) + '</text>');
      }
      out.push('</svg>');
      var where = t.v.filter(function (v) { return v[3] === data.slug && mineN.indexOf(norm(v[2].toUpperCase().replace(/\s+/g, ''))) !== -1; })
        .map(function (v) { return '<span class="mono">' + esc(v[2]) + '</span> row ' + d.rows[v[0]] + ', column ' + (v[1] + 1); });
      return '<figure class="tray"><figcaption><strong>Tray ' + esc(k) + '</strong> <span class="muted small">' + where.join(' · ') + '</span></figcaption>' +
        '<div class="tray-scroll">' + out.join('') + '</div></figure>';
    }).join('') +
      '<p class="tray-key small muted"><span class="dot m-ap"></span> Apatite <span class="dot m-zr"></span> Zircon <span class="dot m-ti"></span> Titanite ' +
      '<span class="dot m-o"></span> Other <span class="dot conc"></span> Concentrate (ring) <span class="dot other"></span> Other samples\' vials (click to open) ' +
      '<span class="dot empty"></span> Empty. Row A is at the bottom, column 01 on the left.</p>';
    // Instant tooltip: sample, fraction and position (row letter + column, e.g. N03)
    var tipBox = document.createElement('div');
    tipBox.className = 'tray-tip'; tipBox.hidden = true;
    document.body.appendChild(tipBox);
    var MIN = { ap: 'Apatite', zr: 'Zircon', ti: 'Titanite' };
    function cell(key) {
      var p = key.split(':'), t = d.trays[p[0]], r = +p[1], c = +p[2];
      var v = t.v.filter(function (x) { return x[0] === r && x[1] === c; })[0];
      return { tray: p[0], pos: d.rows[r] + ('0' + (c + 1)).slice(-2), v: v };
    }
    box.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tip]');
      if (!el) { tipBox.hidden = true; return; }
      var c = cell(el.dataset.tip), v = c.v;
      tipBox.innerHTML = v
        ? '<strong class="mono">' + esc(v[8] || v[3]) + '</strong><br>' + esc(v[7] || MIN[v[4]] || '') + (v[6] ? ' ' + esc(v[6].toLowerCase()) : '') +
          (v[9] === 'missing' ? '<br><span class="muted">Vial not found when checked</span>' : v[9] !== '' && v[9] != null ? '<br><span class="muted">Amount</span> ' + v[9] + '/5' : '') +
          '<br><span class="muted">Vial</span> <span class="mono">' + esc(v[2]) + '</span> <span class="muted">· tray ' + esc(c.tray) + ', position</span> <span class="mono">' + c.pos + '</span>'
        : '<span class="muted">Empty · tray ' + esc(c.tray) + ', position</span> <span class="mono">' + c.pos + '</span>';
      tipBox.hidden = false;
      var r = el.getBoundingClientRect();
      tipBox.style.left = (window.scrollX + r.left + r.width / 2) + 'px';
      tipBox.style.top = (window.scrollY + r.top - 8) + 'px';
    });
    box.addEventListener('mouseleave', function () { tipBox.hidden = true; });

    // pointing at a vial in the Vials table lights it up in the tray
    document.querySelectorAll('table.vials tbody tr').forEach(function (tr) {
      var cat = tr.querySelector('td').textContent.trim();
      function hot(on) { box.querySelectorAll('[data-cat="' + cat.replace(/"/g, '') + '"]').forEach(function (c) { c.classList.toggle('hot', on); }); }
      tr.addEventListener('mouseenter', function () { hot(true); });
      tr.addEventListener('mouseleave', function () { hot(false); });
    });
  }).catch(function () { box.innerHTML = '<p class="muted small">The tray map isn\'t available yet. It is made when the site is built.</p>'; });
})();
