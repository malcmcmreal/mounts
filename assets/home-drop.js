// Home page: drop files onto a mount's row to upload them without opening the mount.
//   .dcd, .csv                       → Grain coordinate files (grains/), up to 1 MB
//   .jpg .jpeg .png .gif .webp .tif  → Photos and hi-res images, up to 5 MB
//   .xls, .xlsx                      → asks: coordinate file or data file
//   anything else                    → Data and other files, up to 5 MB
// Needs sign-in; everything dropped at once is saved in one commit.
(function () {
  var rows = document.querySelectorAll('.mount-row[data-folder]');
  if (!rows.length) return;
  var MB = 1048576;
  var LIMIT = { grain: 1 * MB, image: 5 * MB, data: 5 * MB };
  var WHERE = { grain: 'coordinate files', image: 'images', data: 'data files' };

  function kindOf(name) {
    var ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (/^\.(dcd|csv)$/.test(ext)) return 'grain';
    if (/^\.(jpe?g|png|gif|webp|tiff?)$/.test(ext)) return 'image';
    if (/^\.(xlsx?)$/.test(ext)) return 'ask';
    if (/^\.(md|markdown|html?)$/.test(ext)) return 'page';
    return 'data';
  }
  function safeName(name) {
    var dot = name.lastIndexOf('.');
    var base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
    base = base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '')
      .replace(/_+/g, '_').replace(/^[._-]+|[._-]+$/g, '') || 'file';
    return base + ext.replace(/[^a-z0-9.]/g, '');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function readBase64(file) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { fail(new Error('Couldn\'t read ' + file.name)); };
      r.readAsDataURL(file);
    });
  }

  // Status message, bottom of the screen
  var toast = document.createElement('div');
  toast.className = 'drop-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  var toastTimer;
  function say(html, keep) {
    clearTimeout(toastTimer);
    toast.innerHTML = html + '<button type="button" class="icon-btn" aria-label="Close">&times;</button>';
    toast.hidden = false;
    if (!keep) toastTimer = setTimeout(function () { toast.hidden = true; }, 9000);
  }
  toast.addEventListener('click', function (e) { if (e.target.closest('.icon-btn')) toast.hidden = true; });

  // Spreadsheets: coordinate file or data file?
  var ask = document.createElement('dialog');
  ask.className = 'dialog';
  ask.innerHTML = '<form method="dialog"><div class="dialog-head"><h2>Where do these go?</h2>' +
    '<button type="button" class="icon-btn" value="cancel" data-close aria-label="Close">&times;</button></div>' +
    '<div class="dialog-body" id="ask-list"></div>' +
    '<div class="dialog-foot"><button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="submit" class="btn primary">Upload</button></div></form>';
  document.body.appendChild(ask);
  function askKinds(files, mountId) {
    return new Promise(function (resolve) {
      ask.querySelector('#ask-list').innerHTML = '<p class="small">Spreadsheets for ' + esc(mountId) + ':</p>' + files.map(function (f, i) {
        return '<fieldset class="dl-set"><legend class="mono">' + esc(f.name) + '</legend>' +
          '<label class="check"><input type="radio" name="k' + i + '" value="grain"> Coordinate file</label>' +
          '<label class="check"><input type="radio" name="k' + i + '" value="data" checked> Data file</label></fieldset>';
      }).join('');
      var done = false;
      function finish(v) { if (done) return; done = true; ask.close(); resolve(v); }
      ask.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { finish(null); }; });
      ask.onclose = function () { finish(null); };
      ask.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        finish(files.map(function (f, i) { return ask.querySelector('input[name="k' + i + '"]:checked').value; }));
      };
      ask.showModal();
    });
  }

  function upload(row, fileList) {
    var mountId = row.dataset.id, folder = row.dataset.folder;
    if (!(window.GH && GH.canWrite())) { say('Sign in with GitHub (top right) to upload files here.'); return; }
    var items = Array.prototype.map.call(fileList, function (f) { return { file: f, name: safeName(f.name), kind: kindOf(f.name) }; });
    var spreadsheets = items.filter(function (it) { return it.kind === 'ask'; });
    (spreadsheets.length ? askKinds(spreadsheets.map(function (it) { return it.file; }), mountId) : Promise.resolve([]))
      .then(function (kinds) {
        if (spreadsheets.length && !kinds) return;            // cancelled
        spreadsheets.forEach(function (it, i) { it.kind = kinds[i]; });
        var skipped = [], todo = [];
        items.forEach(function (it) {
          if (it.kind === 'page') skipped.push(it.name + ' (pages can\'t be uploaded; rename to .txt)');
          else if (it.file.size > LIMIT[it.kind]) skipped.push(it.name + ' (over ' + LIMIT[it.kind] / MB + ' MB for ' + WHERE[it.kind] + ')');
          else todo.push(it);
        });
        if (!todo.length) { say('Nothing uploaded to ' + esc(mountId) + ': ' + esc(skipped.join('; '))); return; }
        row.classList.add('uploading');
        say('<span class="spinner"></span> Uploading ' + todo.length + ' file' + (todo.length === 1 ? '' : 's') + ' to ' + esc(mountId) + '…', true);
        return Promise.all(todo.map(function (it) {
          it.path = folder + (it.kind === 'grain' ? 'grains/' : '') + it.name;
          return readBase64(it.file).then(function (b64) { return { path: it.path, base64: b64 }; });
        })).then(function (out) {
          return GH.commit(out, 'Add ' + out.length + ' file' + (out.length === 1 ? '' : 's') + ' to ' + mountId);
        }).then(function () {
          var by = {};
          todo.forEach(function (it) {
            (by[it.kind] = by[it.kind] || []).push(it.name);
          });
          var lines = Object.keys(by).map(function (k) { return '<b>' + WHERE[k] + ':</b> ' + by[k].map(esc).join(', '); });
          say('<strong>Saved to ' + esc(mountId) + '.</strong> ' + lines.join(' · ') +
            (skipped.length ? '<br><span class="error">Skipped: ' + esc(skipped.join('; ')) + '</span>' : '') +
            '<br><span class="muted">The mount page updates in about a minute.</span>', true);
        }).catch(function (err) {
          say('<span class="error">Upload to ' + esc(mountId) + ' failed: ' + esc(err.message) + '</span>', true);
        }).then(function () { row.classList.remove('uploading'); });
      });
  }

  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  Array.prototype.forEach.call(rows, function (row) {
    var depth = 0;
    row.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; row.classList.add('drop-over'); });
    row.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    row.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; row.classList.remove('drop-over'); } });
    row.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; row.classList.remove('drop-over');
      if (e.dataTransfer.files.length) upload(row, e.dataTransfer.files);
    });
  });
  // A file dropped next to a row shouldn't open in the browser
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', function (e) { if (hasFiles(e) && !e.target.closest('.mount-row')) e.preventDefault(); });
})();
