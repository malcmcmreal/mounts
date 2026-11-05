// "New mount" / "Edit mount" form: builds the mount's page file and hands it to GitHub.
// New mounts open GitHub with the file pre-filled. Edits copy the updated text and open
// GitHub's editor for the existing file (GitHub can't pre-fill an existing file).
(function () {
  var dlg = document.getElementById('new-mount');
  if (!dlg) return;
  var form = document.getElementById('new-mount-form');
  var openBtn = document.getElementById('new-mount-btn');
  var repo = dlg.dataset.repo, branch = dlg.dataset.branch || 'main';
  var existing = [];
  try { existing = JSON.parse(dlg.dataset.existing || '[]').map(String); } catch (e) {}

  var idInput = form.elements.mount_id;
  var idMsg = document.getElementById('id-msg');
  var defaultHint = '';
  var rowsBox = document.getElementById('sample-rows');
  var stepForm = document.getElementById('step-form');
  var stepDone = document.getElementById('step-done');
  var nextBtn = document.getElementById('next-btn');
  var backBtn = document.getElementById('back-btn');
  var ghBtn = document.getElementById('github-btn');
  var editMsg = document.getElementById('edit-msg');
  var FIELDS = ['year', 'created_by', 'affiliation', 'mount_format', 'resin', 'minerals',
                'polish', 'etch', 'coating', 'storage'];
  // Editing: { id, path, original file text } or null for a new mount
  var editing = null;

  // ---------- open / close ----------
  if (openBtn) openBtn.addEventListener('click', function () {
    if (editing) { form.reset(); rowsBox.innerHTML = ''; editing = null; }
    setMode();
    if (!form.elements.year.value) form.elements.year.value = new Date().getFullYear();
    buildRows();
    showStep(1);
    dlg.showModal();
    idInput.focus();
  });

  // Edit mode, opened from a mount's page
  var editBtn = document.getElementById('edit-mount-btn');
  if (editBtn) editBtn.addEventListener('click', function () {
    var data = JSON.parse(document.getElementById('mount-data').textContent);
    var path = editBtn.dataset.path;
    editing = { id: data.mount_id, path: path, text: null };
    form.reset(); rowsBox.innerHTML = '';
    setMode();
    idInput.value = data.mount_id;
    FIELDS.forEach(function (k) { if (data[k] != null) form.elements[k].value = data[k]; });
    var samples = data.samples || [];
    setCount(Math.max(1, samples.length));
    rows().forEach(function (row, i) {
      var s = samples[i];
      if (!s) return;
      row.dataset.orig = JSON.stringify(s);
      row.querySelector('[data-k=id]').value = s.id != null ? s.id : '';
      row.querySelector('[data-k=position]').value = s.position || '';
      if (s.earthbank) linkRow(row, String(s.earthbank), null, null);
    });
    showStep(1);
    dlg.showModal();
    // Show the EarthBank names of already-linked samples once the search list is loaded
    loadList().then(function () {
      if (!eb) return;
      rows().forEach(function (row) {
        if (!row.dataset.eb) return;
        var id = +row.dataset.eb;
        for (var i = 0; i < eb.samples.length; i++) if (eb.samples[i][0] === id) {
          var sm = eb.samples[i];
          var tag = row.querySelector('.eb-tag .mono');
          if (tag) tag.insertAdjacentText('afterend', ' (' + sm[1] + (sm[2] >= 0 ? ' · ' + eb.packages[sm[2]][1] : '') + ')');
          break;
        }
      });
    });
    // Fetch the current file so notes and any hand-added fields are kept
    editMsg.hidden = false;
    editMsg.textContent = 'Loading the current page from GitHub…';
    loadFile(path).then(function (text) {
      editing.text = text;
      form.elements.notes.value = body(text).trim();
      editMsg.hidden = true;
    }).catch(function () {
      editMsg.textContent = 'Couldn\'t load the current page from GitHub, so the notes below are empty. ' +
        'If this mount has notes, use "Edit file on GitHub" instead, or copy them in before saving.';
    });
  });

  function setMode() {
    var e = !!editing;
    document.getElementById('dlg-title').textContent = e ? 'Edit mount ' + editing.id : 'New mount';
    idInput.readOnly = e;
    document.getElementById('suggest-id').hidden = e;
    document.getElementById('custom-id-row').hidden = e;
    if (!e) { customBox.checked = false; applyMode(); }
    editMsg.hidden = true;
    idMsg.className = 'hint';
    idMsg.textContent = e ? 'The mount ID can\'t be changed, because printed QR codes point to it.' : defaultHint;
  }

  function loadFile(path) {
    if (window.GH && GH.canWrite()) {
      return GH.getFile(path).then(function (f) { if (!f) throw new Error('missing'); return f.text; });
    }
    // GitHub's API gives the latest version straight away (raw files can be cached for minutes)
    return fetch('https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch, {
      headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).catch(function () {
      return fetch('https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + path + '?t=' + Date.now())
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
    });
  }
  // Split a page file into front matter (without the --- lines) and body
  function frontMatter(text) {
    var m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text || '');
    return m ? m[1] : '';
  }
  function body(text) {
    var m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(text || '');
    return m ? text.slice(m[0].length) : '';
  }
  dlg.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { dlg.close(); });
  });

  // ---------- mount ID ----------
  // Standard IDs: exactly 5 characters from capitals and numbers without the lookalikes
  // 0/O and 1/I, plus hyphens. With "HTTP://<domain>/" in front this keeps the
  // standard QR code at its smallest size (21x21). A custom ID needs the box ticked.
  var SAFE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var STANDARD = /^[2-9A-HJ-NP-Z-]{5}$/;
  var LEN = 5;
  var customBox = form.elements.custom_id;
  defaultHint = 'Exactly 5 characters: capital letters, numbers and hyphens, without O, I, 0 or 1. ' +
    'This keeps the QR code at its smallest size.';
  idMsg.textContent = defaultHint;
  function isCustom() { return customBox.checked; }
  function taken(v) {
    v = v.toUpperCase();
    return existing.some(function (x) { return String(x).toUpperCase() === v; });
  }
  document.getElementById('suggest-id').addEventListener('click', function () {
    var id;
    do {
      id = '';
      for (var i = 0; i < LEN; i++) id += SAFE[Math.floor(Math.random() * SAFE.length)];
    } while (taken(id));
    customBox.checked = false;
    applyMode();
    idInput.value = id;
    checkId();
  });
  customBox.addEventListener('change', function () { applyMode(); checkId(); });
  function applyMode() {
    idInput.maxLength = isCustom() ? 40 : LEN;
    idInput.placeholder = isCustom() ? 'Any ID' : 'e.g. A7K3M';
    if (!isCustom()) idInput.value = idInput.value.toUpperCase().slice(0, LEN);
  }
  idInput.addEventListener('input', function () {
    var pos = idInput.selectionStart;
    var v = idInput.value.replace(/\s+/g, '-');
    idInput.value = isCustom() ? v : v.toUpperCase();
    idInput.setSelectionRange(pos, pos);
    checkId();
  });
  function checkId() {
    if (editing) return true;
    var v = idInput.value.trim();
    var problem = '', note = '';
    if (!v) problem = 'Please enter a mount ID.';
    else if (taken(v)) problem = 'A mount with this ID already exists.';
    else if (isCustom()) {
      if (!/^[A-Za-z0-9_-]+$/.test(v)) problem = 'Use letters, numbers, hyphens and underscores only (it becomes part of the web address).';
      else if (!STANDARD.test(v)) note = 'Custom ID: ' +
        (/[a-z_]/.test(v) ? 'lowercase letters and underscores make the QR code noticeably bigger. ' : '') +
        (v.length > LEN ? 'IDs longer than ' + LEN + ' characters make the QR code bigger. ' : '') +
        'Make sure the QR code still fits your mount.';
    } else {
      var bad = v.replace(/[2-9A-HJ-NP-Z-]/g, '');
      if (bad) problem = 'Not allowed in a standard ID: ' + bad.split('').filter(function (c, i, a) { return a.indexOf(c) === i; }).join(' ') +
        (/[01OI]/.test(bad) ? ' (0, 1, O and I are left out because they look alike)' : '') +
        '. Tick "custom mount ID" below to use it anyway.';
      else if (v.length !== LEN) problem = 'A standard ID is exactly ' + LEN + ' characters (this one has ' + v.length + ').';
    }
    idMsg.textContent = problem || note || defaultHint;
    idMsg.className = problem ? 'hint error' : note ? 'hint warn-text' : 'hint';
    return !problem;
  }

  // ---------- sample rows ----------
  form.elements.n_samples.addEventListener('input', buildRows);
  function setCount(n) { form.elements.n_samples.value = n; buildRows(); }
  function buildRows() {
    var n = Math.max(1, Math.min(50, parseInt(form.elements.n_samples.value, 10) || 1));
    var old = rowsBox.querySelectorAll('.sample-row');
    // keep what has already been typed
    for (var i = old.length; i < n; i++) {
      var div = document.createElement('div');
      div.className = 'sample-row';
      div.innerHTML =
        '<span class="num">' + (i + 1) + '</span>' +
        '<input data-k="id" placeholder="Sample ID" class="mono">' +
        '<input data-k="position" placeholder="Where in the mount (e.g. top left, row 1)">' +
        '<button type="button" class="btn small eb-btn">EarthBank…</button>' +
        '<button type="button" class="icon-btn row-del" title="Remove this sample" aria-label="Remove this sample">&times;</button>' +
        '<div class="eb-tag" hidden></div>';
      rowsBox.appendChild(div);
    }
    for (var j = old.length - 1; j >= n; j--) old[j].remove();
    renumber();
  }
  function renumber() {
    rowsBox.querySelectorAll('.sample-row .num').forEach(function (el, i) { el.textContent = i + 1; });
  }
  function rows() { return rowsBox.querySelectorAll('.sample-row'); }

  // Link a row to an EarthBank sample (or unlink with id = null)
  function linkRow(row, id, name, pkg) {
    var tag = row.querySelector('.eb-tag');
    if (!id) { delete row.dataset.eb; tag.hidden = true; tag.innerHTML = ''; return; }
    row.dataset.eb = id;
    var idInput = row.querySelector('[data-k=id]');
    // New mounts take the EarthBank name; when editing, keep the mount's own sample ID unless it's blank
    if (name && (!editing || !idInput.value.trim())) idInput.value = name;
    tag.innerHTML = 'Linked to EarthBank sample <span class="mono">' + id + '</span>' +
      (pkg ? ' · ' + esc(pkg) : '') +
      ' <button type="button" class="link-btn" data-unlink>Remove link</button>';
    tag.hidden = false;
  }
  rowsBox.addEventListener('click', function (e) {
    var row = e.target.closest('.sample-row');
    if (!row) return;
    if (e.target.closest('[data-unlink]')) linkRow(row, null);
    else if (e.target.closest('.row-del')) {
      if (rows().length <= 1) return;
      row.remove();
      form.elements.n_samples.value = rows().length;
      renumber();
    }
    else if (e.target.closest('.eb-btn')) openPicker(row);
  });

  // ---------- EarthBank picker ----------
  var stepPicker = document.getElementById('step-picker');
  var pickQ = document.getElementById('pick-q'), pickPkg = document.getElementById('pick-pkg');
  var pickStatus = document.getElementById('pick-status'), pickResults = document.getElementById('pick-results');
  var pickManual = document.getElementById('pick-manual');
  var pickUse = document.getElementById('pick-use'), pickBack = document.getElementById('pick-back');
  var eb = null, ebLoading = null, pickFrom = 0, picked = [];
  var LIMIT = 200;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function loadList() {
    if (ebLoading) return ebLoading;
    pickStatus.textContent = 'Loading the EarthBank sample list…';
    ebLoading = fetch(dlg.dataset.earthbankList).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) {
      d.samples.forEach(function (s) { s.push((s[1] + ' ' + (s[3] >= 0 ? d.places[s[3]] : '')).toLowerCase()); });
      var opts = d.packages.map(function (p, i) { return [p[1], i]; })
        .sort(function (a, b) { return a[0].localeCompare(b[0]); });
      pickPkg.insertAdjacentHTML('beforeend', opts.map(function (o) {
        return '<option value="' + o[1] + '">' + esc(o[0]) + '</option>';
      }).join(''));
      eb = d;
      return d;
    }).catch(function () {
      ebLoading = null;
      pickStatus.textContent = 'The EarthBank sample list isn\'t available yet. It is rebuilt automatically ' +
        '(the first time takes about an hour). You can still type an EarthBank sample ID below.';
      pickStatus.className = 'hint error';
    });
    return ebLoading;
  }

  function search() {
    if (!eb) return;
    var words = pickQ.value.toLowerCase().split(/\s+/).filter(Boolean);
    var pkg = pickPkg.value === '' ? null : +pickPkg.value;
    if (!words.length && pkg === null) {
      pickResults.innerHTML = '';
      pickStatus.className = 'hint';
      pickStatus.textContent = eb.samples.length.toLocaleString() + ' public EarthBank samples (list updated ' +
        eb.updated.slice(0, 10) + '). Type a name or choose a data package.';
      return;
    }
    var hits = [], total = 0;
    for (var i = 0; i < eb.samples.length; i++) {
      var s = eb.samples[i];
      if (pkg !== null && s[2] !== pkg) continue;
      var ok = true;
      for (var w = 0; w < words.length; w++) if (s[4].indexOf(words[w]) === -1) { ok = false; break; }
      if (!ok) continue;
      total++;
      if (hits.length < LIMIT) hits.push(s);
    }
    var q = words.join(' ');
    hits.sort(function (a, b) {
      var an = a[1].toLowerCase(), bn = b[1].toLowerCase();
      return (an === q ? 0 : an.indexOf(q) === 0 ? 1 : 2) - (bn === q ? 0 : bn.indexOf(q) === 0 ? 1 : 2) ||
        an.localeCompare(bn, undefined, { numeric: true });
    });
    pickStatus.className = 'hint';
    pickStatus.textContent = total ? (total.toLocaleString() + ' match' + (total === 1 ? '' : 'es') +
      (total > LIMIT ? ', showing the first ' + LIMIT + '. Type more to narrow it down.' : '.')) : 'No matches.';
    pickResults.innerHTML = hits.map(function (s) {
      var on = picked.indexOf(s[0]) !== -1;
      return '<label class="pick-item"><input type="checkbox" value="' + s[0] + '"' + (on ? ' checked' : '') + '>' +
        '<span><span class="mono">' + esc(s[1] || '(no name)') + '</span>' +
        '<small>' + esc([s[3] >= 0 ? eb.places[s[3]] : '', s[2] >= 0 ? eb.packages[s[2]][1] : '', 'ID ' + s[0]]
          .filter(Boolean).join(' · ')) + '</small></span></label>';
    }).join('');
    updateUse();
  }
  var timer;
  pickQ.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 150); });
  pickPkg.addEventListener('change', search);
  pickResults.addEventListener('change', function (e) {
    var id = +e.target.value, k = picked.indexOf(id);
    if (e.target.checked && k === -1) picked.push(id);
    if (!e.target.checked && k !== -1) picked.splice(k, 1);
    updateUse();
  });
  pickManual.addEventListener('input', updateUse);
  function updateUse() {
    var n = picked.length + (/^\d+$/.test(pickManual.value.trim()) ? 1 : 0);
    pickUse.textContent = n ? 'Use selected (' + n + ')' : 'Use selected';
    pickUse.disabled = !n;
  }

  function openPicker(row) {
    var all = Array.prototype.slice.call(rows());
    pickFrom = all.indexOf(row);
    document.getElementById('pick-row').textContent = pickFrom + 1;
    picked = []; pickManual.value = '';
    var typed = row.querySelector('[data-k=id]').value.trim();
    if (typed && !row.dataset.eb) pickQ.value = typed;
    showStep(3);
    pickQ.focus();
    loadList().then(search);
    updateUse();
  }
  pickBack.addEventListener('click', function () { showStep(1); });
  pickUse.addEventListener('click', function () {
    var ids = picked.slice();
    var manual = pickManual.value.trim();
    if (/^\d+$/.test(manual) && ids.indexOf(+manual) === -1) ids.push(+manual);
    var byId = {};
    if (eb) eb.samples.forEach(function (s) { if (ids.indexOf(s[0]) !== -1) byId[s[0]] = s; });
    var need = pickFrom + ids.length;
    if (need > rows().length) setCount(Math.min(50, need));
    var all = rows();
    ids.forEach(function (id, k) {
      var row = all[pickFrom + k];
      if (!row) return;
      var s = byId[id];
      linkRow(row, id, s ? s[1] : null, s && s[2] >= 0 ? eb.packages[s[2]][1] : null);
    });
    showStep(1);
    var first = all[pickFrom];
    if (first) first.scrollIntoView({ block: 'center' });
  });

  // ---------- build the page text ----------
  function q(s) { return JSON.stringify(String(s)); } // safe YAML string
  var MANAGED = ['layout', 'mount_id', 'permalink', 'samples'].concat(FIELDS);
  var ROW_KEYS = ['id', 'position', 'earthbank'];
  function yamlValue(v) {
    return typeof v === 'number' || typeof v === 'boolean' ? String(v) : q(v);
  }
  function buildText(id) {
    var f = form.elements;
    var lines = ['---', 'layout: mount', 'mount_id: ' + q(id), 'permalink: /' + id + '/'];
    if (!editing) {
      var d = new Date();
      lines.push('created: "' + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + '"');
    }
    FIELDS.forEach(function (k) {
      var v = (f[k].value || '').trim();
      if (!v) return;
      lines.push(k + ': ' + (k === 'year' && /^\d{4}$/.test(v) ? v : q(v)));
    });
    lines.push('samples:');
    rows().forEach(function (r, i) {
      var sid = r.querySelector('[data-k=id]').value.trim() || ('Sample ' + (i + 1));
      var pos = r.querySelector('[data-k=position]').value.trim();
      lines.push('  - id: ' + q(sid));
      if (pos) lines.push('    position: ' + q(pos));
      if (r.dataset.eb) lines.push('    earthbank: ' + r.dataset.eb);
      // keep anything else recorded for this sample (e.g. notes)
      var orig = {};
      try { orig = JSON.parse(r.dataset.orig || '{}'); } catch (e) {}
      Object.keys(orig).forEach(function (k) {
        var v = orig[k];
        if (ROW_KEYS.indexOf(k) !== -1 || v == null || v === '' || typeof v === 'object') return;
        lines.push('    ' + k + ': ' + yamlValue(v));
      });
    });
    // When editing, keep any top-level fields this form doesn't know about, exactly as written
    if (editing && editing.text) {
      var block = null, keep = [];
      frontMatter(editing.text).split(/\r?\n/).forEach(function (line) {
        var m = /^([A-Za-z_][\w-]*)\s*:/.exec(line);
        if (m) block = MANAGED.indexOf(m[1]) === -1 ? m[1] : null;
        if (block) keep.push(line);
      });
      lines = lines.concat(keep);
    }
    lines.push('---');
    var notes = (f.notes.value || '').trim();
    lines.push(notes || '');
    return lines.join('\n') + '\n';
  }

  // ---------- saving straight to the repository (when signed in) ----------
  function direct() { return window.GH && GH.canWrite(); }
  function setNextLabel() { nextBtn.textContent = direct() ? (editing ? 'Save' : 'Create mount') : 'Next'; }
  document.addEventListener('gh-auth', setNextLabel);
  function saveDirect(id, path, text) {
    if (editing && !editing.text) {
      idMsg.className = 'hint error';
      idMsg.textContent = 'The current page couldn\'t be loaded from GitHub, so saving could lose its notes. Close this and try again.';
      return;
    }
    nextBtn.disabled = true;
    nextBtn.innerHTML = '<span class="spinner"></span> Saving…';
    (editing ? Promise.resolve(null) : GH.getFile(path)).then(function (exists) {
      if (exists) throw new Error('A mount called ' + id + ' already exists in the repository.');
      return GH.commit([{ path: path, text: text }], (editing ? 'Correct mount ' : 'Add mount ') + id);
    }).then(function () {
      var url = (dlg.dataset.site || '/') + id + '/';
      document.getElementById('done-saved-text').innerHTML = editing
        ? 'The page updates in about a minute; refresh it to see the change.'
        : 'The new page will be at <a href="' + url + '">' + url + '</a> in about a minute. ' +
          'Upload its map and data files there with <strong>Add files</strong>.';
      document.getElementById('done-saved').hidden = false;
      document.getElementById('done-new').hidden = true;
      document.getElementById('done-edit').hidden = true;
      if (!editing) existing.push(id);
      showStep(2);
      ghBtn.hidden = true; backBtn.hidden = true;
      cancelBtn.textContent = 'Close';
    }).catch(function (err) {
      idMsg.className = 'hint error';
      idMsg.textContent = err.message;
      idInput.scrollIntoView({ block: 'center' });
    }).then(function () { nextBtn.disabled = false; setNextLabel(); });
  }

  // ---------- steps ----------
  var cancelBtn = dlg.querySelector('.dialog-foot [data-close]');
  function showStep(n) {
    stepForm.hidden = n !== 1; stepDone.hidden = n !== 2; stepPicker.hidden = n !== 3;
    nextBtn.hidden = n !== 1; backBtn.hidden = n !== 2; ghBtn.hidden = n !== 2 || !repo;
    pickBack.hidden = pickUse.hidden = n !== 3; cancelBtn.hidden = n === 3;
    if (n === 1) { cancelBtn.textContent = 'Cancel'; setNextLabel(); }
  }
  backBtn.addEventListener('click', function () { showStep(1); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!stepPicker.hidden) return; // Enter in the EarthBank search box
    if (!checkId()) { idInput.focus(); return; }
    var id = idInput.value.trim();
    var path = editing ? editing.path : 'mounts/' + id + '/index.md';
    var text = buildText(id);
    document.getElementById('yaml-out').value = text;
    document.getElementById('done-id').textContent = id;
    document.getElementById('done-edit-id').textContent = id;
    document.getElementById('done-path').textContent = path;
    document.getElementById('no-repo-msg').hidden = !!repo;
    document.getElementById('done-saved').hidden = true;
    document.getElementById('done-new').hidden = !!editing;
    document.getElementById('done-edit').hidden = !editing;
    if (direct()) {
      saveDirect(id, path, text);
      return;
    }
    document.getElementById('copy-msg').textContent = '';
    if (repo) {
      ghBtn.href = editing
        ? 'https://github.com/' + repo + '/edit/' + branch + '/' + path
        : 'https://github.com/' + repo + '/new/' + branch +
          '?filename=' + encodeURIComponent(path) + '&value=' + encodeURIComponent(text);
    }
    ghBtn.textContent = editing ? 'Open GitHub editor' : 'Create page on GitHub';
    showStep(2);
  });

  function copyText() {
    var t = document.getElementById('yaml-out');
    return (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject())
      .catch(function () {
        var d = t.closest('details'); if (d) d.open = true;
        t.select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
      });
  }
  document.getElementById('copy-yaml').addEventListener('click', copyText);
  // Editing: copy the new text as the GitHub editor opens
  ghBtn.addEventListener('click', function () {
    if (!editing) return;
    var msg = document.getElementById('copy-msg');
    copyText().then(function () {
      msg.className = 'hint'; msg.textContent = 'Copied. Now paste it over everything in the GitHub editor.';
    }).catch(function () {
      msg.className = 'hint error';
      msg.textContent = 'Couldn\'t copy automatically. Open "Show the page text", copy it, then paste it in GitHub.';
    });
  });
})();
