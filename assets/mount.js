// Mount page: previews CSV / text / .xlsx files. (The codes are drawn by codes.js.)
(function () {
  // ---------- file previews ----------
  function parseCSV(str, sep) {
    var rows = [], row = [], cell = '', inQ = false;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (inQ) {
        if (c === '"') { if (str[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && str[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || r[0] !== ''; });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var MAX = 500;

  // ---------- .xlsx preview: unzip in the browser (DecompressionStream), read the sheet XML ----------
  function inflate(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function unzip(buf) {
    var v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), files = {};
    var e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) return Promise.reject('not a zip');
    var n = v.getUint16(e + 10, true), p = v.getUint32(e + 16, true), jobs = [];
    for (var i = 0; i < n; i++) {
      var method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      var off = v.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      var data = u8.subarray(start, start + csize);
      jobs.push((method === 8 ? inflate(data) : Promise.resolve(data)).then(function (nm) {
        return function (d) { files[nm] = dec.decode(d); };
      }(name)));
      p += 46 + nl + xl + cl;
    }
    return Promise.all(jobs).then(function () { return files; });
  }
  function xml(s) { return new DOMParser().parseFromString(s || '<x/>', 'application/xml'); }
  function tags(node, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', name)); }
  function colIdx(ref) { var m = /^[A-Z]+/.exec(ref)[0], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + m.charCodeAt(i) - 64; return n - 1; }
  function readXlsx(buf) {
    return unzip(buf).then(function (f) {
      var shared = tags(xml(f['xl/sharedStrings.xml']), 'si').map(function (si) {
        return tags(si, 't').map(function (t) { return t.textContent; }).join('');
      });
      // number formats → decimals per style index
      var st = xml(f['xl/styles.xml']), codes = { 1: '0', 2: '0.00' };
      tags(st, 'numFmt').forEach(function (nf) { codes[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode'); });
      var xfs = tags(st, 'cellXfs')[0], dps = xfs ? tags(xfs, 'xf').map(function (xf) {
        var c = codes[xf.getAttribute('numFmtId')], m = c && /^0(?:\.(0+))?$/.exec(c);
        return m ? (m[1] || '').length : null;
      }) : [];
      var rels = {};
      tags(xml(f['xl/_rels/workbook.xml.rels']), 'Relationship').forEach(function (r) { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
      return tags(xml(f['xl/workbook.xml']), 'sheet').map(function (sh) {
        var t = rels[sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] || '';
        t = t.replace(/^\/?xl\//, '').replace(/^\//, '');
        var rows = [];
        tags(xml(f['xl/' + t]), 'row').forEach(function (r) {
          var row = [];
          tags(r, 'c').forEach(function (c) {
            var ty = c.getAttribute('t'), vEl = tags(c, 'v')[0], val = vEl ? vEl.textContent : '';
            if (ty === 's') val = shared[+val] || '';
            else if (ty === 'inlineStr') val = tags(c, 't').map(function (x) { return x.textContent; }).join('');
            else if (ty !== 'str' && ty !== 'b' && ty !== 'e' && val !== '') {
              var d = dps[+(c.getAttribute('s') || 0)], num = +val;
              val = d != null ? num.toFixed(d) : String(Math.round(num * 1e4) / 1e4);
            }
            row[c.getAttribute('r') ? colIdx(c.getAttribute('r')) : row.length] = val;
          });
          rows.push(row);
        });
        return { name: sh.getAttribute('name'), rows: rows };
      });
    });
  }
  function table(rows) {
    if (!rows.length) return '<p class="muted small">Empty sheet.</p>';
    var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    function cells(r, tag) { var h = ''; for (var i = 0; i < w; i++) h += '<' + tag + '>' + esc(r[i] == null ? '' : r[i]) + '</' + tag + '>'; return h; }
    if (w === 1) return '<pre>' + rows.map(function (r) { return esc(r[0] == null ? '' : r[0]); }).join('\n') + '</pre>';
    var body = rows.slice(1, MAX + 1), total = rows.length - 1;
    return '<div class="table-scroll"><table><thead><tr>' + cells(rows[0], 'th') + '</tr></thead><tbody>' +
      body.map(function (r) { return '<tr>' + cells(r, 'td') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="muted small">' + total + ' row' + (total === 1 ? '' : 's') +
      (total > MAX ? ', showing the first ' + MAX + '. Download the file to see everything.' : '') + '</p>';
  }
  function showSheets(out, sheets) {
    if (!sheets.length) { out.textContent = 'No sheets found.'; return; }
    var tabs = sheets.length > 1 ? '<div class="sheet-tabs">' + sheets.map(function (s, i) {
      return '<button type="button" class="btn small' + (i ? '' : ' on') + '" data-sheet="' + i + '">' + esc(s.name) + '</button>';
    }).join('') + '</div>' : '';
    out.innerHTML = tabs + '<div class="sheet-body"></div>';
    var body = out.querySelector('.sheet-body');
    function show(i) {
      body.innerHTML = table(sheets[i].rows);
      out.querySelectorAll('[data-sheet]').forEach(function (b) { b.classList.toggle('on', +b.dataset.sheet === i); });
    }
    out.querySelectorAll('[data-sheet]').forEach(function (b) { b.addEventListener('click', function () { show(+b.dataset.sheet); }); });
    show(0);
  }
  document.querySelectorAll('[data-preview]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var out = btn.closest('li').querySelector('.preview');
      if (!out.hidden) { out.hidden = true; btn.textContent = 'Preview'; return; }
      btn.textContent = 'Hide';
      out.hidden = false;
      if (out.dataset.loaded) return;
      out.textContent = 'Loading…';
      if (btn.dataset.ext === '.xlsx') {
        fetch(btn.dataset.preview).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then(readXlsx).then(function (sheets) { out.dataset.loaded = '1'; showSheets(out, sheets); })
          .catch(function () { out.textContent = 'Could not read this spreadsheet. Download it to open in Excel.'; });
        return;
      }
      fetch(btn.dataset.preview).then(function (r) { return r.text(); }).then(function (t) {
        out.dataset.loaded = '1';
        if (btn.dataset.ext === '.txt') {
          out.innerHTML = '<pre>' + esc(t) + '</pre>';
          return;
        }
        var rows = parseCSV(t, btn.dataset.ext === '.tsv' ? '\t' : ',');
        if (!rows.length) { out.textContent = 'File is empty.'; return; }
        var head = rows[0], body = rows.slice(1, MAX + 1);
        var html = '<div class="table-scroll"><table><thead><tr>' +
          head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          body.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
        var total = rows.length - 1;
        html += '<p class="muted small">' + total + ' row' + (total === 1 ? '' : 's') +
          (total > MAX ? ', showing the first ' + MAX + '. Download the file to see everything.' : '') + '</p>';
        out.innerHTML = html;
      }).catch(function () { out.textContent = 'Could not load this file.'; });
    });
  });
})();

// Close the "···" menu when clicking elsewhere or choosing an item
document.addEventListener('click', function (e) {
  document.querySelectorAll('details.menu[open]').forEach(function (m) {
    if (!m.contains(e.target) || e.target.closest('.menu-list')) m.open = false;
  });
});

// Notes card: clip long notes with a fade and a "Show all notes" toggle.
(function () {
  var clip = document.getElementById('notes-clip'), btn = document.getElementById('notes-more');
  if (!clip || !btn) return;
  function check() {
    if (clip.classList.contains('open')) return;
    var over = clip.scrollHeight > clip.clientHeight + 4;
    clip.classList.toggle('clipped', over); btn.hidden = !over;
  }
  btn.addEventListener('click', function () {
    var open = clip.classList.toggle('open');
    btn.textContent = open ? 'Show less' : '… Show all notes';
    btn.setAttribute('aria-expanded', open);
    if (!open) { check(); clip.closest('.card').scrollIntoView({ block: 'nearest' }); }
  });
  check(); window.addEventListener('resize', check);
})();
