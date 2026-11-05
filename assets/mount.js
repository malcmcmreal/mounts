// Mount page: draws the QR code and previews CSV / text files.
(function () {
  // ---------- QR code ----------
  var box = document.getElementById('qr');
  if (box && window.qrcode) {
    var text = box.dataset.text;
    // All-capitals URLs use the compact "alphanumeric" mode, giving a smaller code.
    var mode = /^[0-9A-Z $%*+\-.\/:]*$/.test(text) ? 'Alphanumeric' : 'Byte';
    var qr = qrcode(0, 'M');
    qr.addData(text, mode);
    qr.make();
    var n = qr.getModuleCount();
    box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 32, scalable: true });
    document.getElementById('qr-info').textContent =
      'Standard QR, version ' + ((n - 17) / 4) + ' (' + n + '×' + n + ' squares)' +
      (mode === 'Byte' ? '. Set a short qr_base in _config.yml for a smaller code.' : '.');
    document.getElementById('qr-download').addEventListener('click', function () {
      var blob = new Blob([box.innerHTML], { type: 'image/svg+xml' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'QR-' + (document.querySelector('h1').textContent.trim()) + '.svg';
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

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
  document.querySelectorAll('[data-preview]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var out = btn.closest('li').querySelector('.preview');
      if (!out.hidden) { out.hidden = true; btn.textContent = 'Preview'; return; }
      btn.textContent = 'Hide';
      out.hidden = false;
      if (out.dataset.loaded) return;
      out.textContent = 'Loading…';
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
