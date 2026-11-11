// Mount page: drag-and-drop file uploads straight to the repository (when signed in).
// Signed out, each "+ Add" button opens GitHub's own upload page instead.
(function () {
  // Each [data-upload] button names its folder: the mount's own folder, or grains/ for grain coordinate files
  var openers = document.querySelectorAll('[data-upload]');
  var dlg = document.getElementById('upload-dialog');
  if (!openers.length || !dlg) return;
  var folder, mountId, existing = [], kind = '';
  var where = document.getElementById('upload-where'), whereDefault = where ? where.textContent : '';
  var input = document.getElementById('upload-input'), drop = document.getElementById('upload-drop');
  var list = document.getElementById('upload-list'), btn = document.getElementById('upload-btn');
  var errBox = document.getElementById('upload-error'), saved = document.getElementById('upload-saved');
  var cancel = dlg.querySelector('.dialog-foot [data-close]');
  var MAX = 25 * 1024 * 1024, BIG_IMAGE = 5 * 1024 * 1024, max = MAX;
  var files = [];

  Array.prototype.forEach.call(openers, function (link) {
    link.addEventListener('click', function (e) {
      if (!(window.GH && GH.canWrite())) return;    // follow the link to GitHub
      e.preventDefault();
      folder = link.dataset.folder;                 // e.g. "mounts/GR001/"
      mountId = link.dataset.mount;
      kind = link.dataset.kind || '';
      max = link.dataset.max ? +link.dataset.max * 1024 * 1024 : MAX;
      try { existing = JSON.parse(link.dataset.existing || '[]'); } catch (x) { existing = []; }
      input.accept = link.dataset.accept || '';
      document.getElementById('upload-title').textContent =
        ({ grain: 'Add grain coordinate files to ', image: 'Add photos to ', data: 'Add files to ' }[kind] || 'Add files to ') + mountId;
      if (where) where.textContent = { grain: 'CSV, text or spreadsheet files. Up to 5 MB each.',
        image: 'JPG, PNG, GIF or WebP images. Up to 25 MB each.',
        data: 'Data and other files (not images). Up to 25 MB each.' }[kind] || whereDefault;
      open();
    });
  });
  function open() {
    files = []; render(); errBox.textContent = ''; saved.hidden = true;
    drop.hidden = false; cancel.textContent = 'Cancel';
    dlg.showModal();
  }
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });

  // Letters, numbers, hyphens, underscores and dots only (the README's advice, applied automatically)
  function safeName(name) {
    var dot = name.lastIndexOf('.');
    var base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
    base = base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '')
      .replace(/_+/g, '_').replace(/^[._-]+|[._-]+$/g, '') || 'file';
    return base + ext.replace(/[^a-z0-9.]/g, '');
  }
  function sizeText(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function add(fileList) {
    Array.prototype.forEach.call(fileList, function (file) {
      var name = safeName(file.name), ext = (name.match(/\.[^.]+$/) || [''])[0];
      var item = { file: file, name: name, problem: '', warn: '' };
      if (/^\.(md|markdown|html?)$/.test(ext)) item.problem = 'Pages can\'t be uploaded here (the site would turn them into pages). Rename to .txt to keep it as a file.';
      else if (file.size > max) item.problem = max < MAX ? 'Larger than ' + Math.round(max / 1048576) + ' MB, the limit for these files.' : 'Larger than 25 MB, which GitHub won\'t accept from a browser.';
      else if (kind === 'image' && !/^\.(jpe?g|png|gif|webp)$/.test(ext)) item.problem = 'Not an image this page can show. Use + Add under Data and other files.';
      else if (kind === 'data' && /^\.(jpe?g|png|gif|webp)$/.test(ext)) item.problem = 'Images go under Photos and hi-res images (+ Add there).';
      else if (kind === 'grain' && /^\.(jpe?g|png|gif|webp|tiff?|svg|pdf)$/.test(ext)) item.problem = 'Images go under Photos and hi-res images (+ Add there).';
      else if (/^\.tiff?$/.test(ext)) item.warn = 'Browsers can\'t show TIFF images, so it will be listed as a data file. Upload a JPG or PNG copy to show it as a map.';
      else if (/^\.(jpe?g|png|gif|webp)$/.test(ext) && file.size > BIG_IMAGE) item.warn = 'Large image; it may load slowly on phones.';
      if (name !== file.name) item.warn = (item.warn ? item.warn + ' ' : '') + 'Saved as ' + name + '.';
      if (existing.indexOf(name) !== -1) item.warn = (item.warn ? item.warn + ' ' : '') + 'Replaces the existing file with this name.';
      files = files.filter(function (f) { return f.name !== name; });
      files.push(item);
    });
    render();
  }
  function render() {
    list.innerHTML = files.map(function (f, i) {
      return '<li class="' + (f.problem ? 'bad' : '') + '"><span class="mono">' + esc(f.name) + '</span> <span class="muted small">' +
        sizeText(f.file.size) + '</span><button type="button" class="icon-btn" data-remove="' + i + '" aria-label="Remove">&times;</button>' +
        (f.problem ? '<small class="error">' + esc(f.problem) + '</small>' : f.warn ? '<small class="muted">' + esc(f.warn) + '</small>' : '') + '</li>';
    }).join('');
    var ok = files.filter(function (f) { return !f.problem; }).length;
    btn.disabled = !ok;
    btn.textContent = ok ? 'Upload ' + ok + ' file' + (ok === 1 ? '' : 's') : 'Upload';
  }
  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-remove]');
    if (b) { files.splice(+b.dataset.remove, 1); render(); }
  });
  input.addEventListener('change', function () { add(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { add(e.dataTransfer.files); });

  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('Couldn\'t read ' + file.name)); };
      r.readAsDataURL(file);
    });
  }

  document.getElementById('upload-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var todo = files.filter(function (f) { return !f.problem; });
    if (!todo.length) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Uploading…'; errBox.textContent = '';
    Promise.all(todo.map(function (f) {
      return readBase64(f.file).then(function (b64) { return { path: folder + f.name, base64: b64 }; });
    })).then(function (out) {
      return GH.commit(out, 'Add ' + out.length + ' file' + (out.length === 1 ? '' : 's') + ' to ' + mountId);
    }).then(function () {
      todo.forEach(function (f) { if (existing.indexOf(f.name) === -1) existing.push(f.name); });
      document.getElementById('upload-saved-text').textContent =
        todo.length + ' file' + (todo.length === 1 ? '' : 's') + ' saved. They appear on this page in about a minute; refresh it to see them.';
      saved.hidden = false; files = []; render(); drop.hidden = true; cancel.textContent = 'Close';
    }).catch(function (err) {
      errBox.textContent = err.message; render();
    });
  });
})();
