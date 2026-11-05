// "New mount" form: builds the mount's page file and opens GitHub with it pre-filled.
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
  var defaultHint = idMsg.textContent;
  var rowsBox = document.getElementById('sample-rows');
  var stepForm = document.getElementById('step-form');
  var stepDone = document.getElementById('step-done');
  var nextBtn = document.getElementById('next-btn');
  var backBtn = document.getElementById('back-btn');
  var ghBtn = document.getElementById('github-btn');

  // ---------- open / close ----------
  openBtn.addEventListener('click', function () {
    if (!form.elements.year.value) form.elements.year.value = new Date().getFullYear();
    buildRows();
    showStep(1);
    dlg.showModal();
    idInput.focus();
  });
  dlg.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { dlg.close(); });
  });

  // ---------- mount ID ----------
  var SAFE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I lookalikes
  document.getElementById('suggest-id').addEventListener('click', function () {
    var id;
    do {
      id = '';
      for (var i = 0; i < 4; i++) id += SAFE[Math.floor(Math.random() * SAFE.length)];
    } while (existing.indexOf(id) !== -1);
    idInput.value = id;
    checkId();
  });
  idInput.addEventListener('input', function () {
    var pos = idInput.selectionStart;
    idInput.value = idInput.value.toUpperCase().replace(/\s+/g, '-');
    idInput.setSelectionRange(pos, pos);
    checkId();
  });
  function checkId() {
    var v = idInput.value.trim();
    var problem = '';
    if (!v) problem = 'Please enter a mount ID.';
    else if (!/^[A-Z0-9-]+$/.test(v)) problem = 'Only capital letters, numbers and hyphens are allowed.';
    else if (existing.indexOf(v) !== -1) problem = 'A mount with this ID already exists.';
    idMsg.textContent = problem || (v.length > 6
      ? 'OK, but IDs longer than about 6 characters make the QR code bigger.'
      : defaultHint);
    idMsg.className = problem ? 'hint error' : 'hint';
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
        '<div class="eb-tag" hidden></div>';
      rowsBox.appendChild(div);
    }
    for (var j = old.length - 1; j >= n; j--) old[j].remove();
  }
  function rows() { return rowsBox.querySelectorAll('.sample-row'); }

  // Link a row to an EarthBank sample (or unlink with id = null)
  function linkRow(row, id, name, pkg) {
    var tag = row.querySelector('.eb-tag');
    if (!id) { delete row.dataset.eb; tag.hidden = true; tag.innerHTML = ''; return; }
    row.dataset.eb = id;
    var idInput = row.querySelector('[data-k=id]');
    if (name) idInput.value = name;
    tag.innerHTML = 'Linked to EarthBank sample <span class="mono">' + id + '</span>' +
      (pkg ? ' · ' + esc(pkg) : '') +
      ' <button type="button" class="link-btn" data-unlink>Remove link</button>';
    tag.hidden = false;
  }
  rowsBox.addEventListener('click', function (e) {
    var row = e.target.closest('.sample-row');
    if (!row) return;
    if (e.target.closest('[data-unlink]')) linkRow(row, null);
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
  function buildText(id) {
    var f = form.elements;
    var lines = ['---', 'layout: mount', 'mount_id: ' + q(id), 'permalink: /' + id + '/'];
    var fields = ['year', 'created_by', 'affiliation', 'mount_format', 'resin', 'minerals',
                  'polish', 'etch', 'coating', 'storage'];
    fields.forEach(function (k) {
      var v = (f[k].value || '').trim();
      if (!v) return;
      lines.push(k + ': ' + (k === 'year' && /^\d{4}$/.test(v) ? v : q(v)));
    });
    lines.push('samples:');
    rowsBox.querySelectorAll('.sample-row').forEach(function (r, i) {
      var sid = r.querySelector('[data-k=id]').value.trim() || ('Sample ' + (i + 1));
      var pos = r.querySelector('[data-k=position]').value.trim();
      lines.push('  - id: ' + q(sid));
      if (pos) lines.push('    position: ' + q(pos));
      if (r.dataset.eb) lines.push('    earthbank: ' + r.dataset.eb);
    });
    lines.push('---');
    var notes = (f.notes.value || '').trim();
    lines.push(notes || '');
    return lines.join('\n') + '\n';
  }

  // ---------- steps ----------
  var cancelBtn = dlg.querySelector('.dialog-foot [data-close]');
  function showStep(n) {
    stepForm.hidden = n !== 1; stepDone.hidden = n !== 2; stepPicker.hidden = n !== 3;
    nextBtn.hidden = n !== 1; backBtn.hidden = n !== 2; ghBtn.hidden = n !== 2 || !repo;
    pickBack.hidden = pickUse.hidden = n !== 3; cancelBtn.hidden = n === 3;
  }
  backBtn.addEventListener('click', function () { showStep(1); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!stepPicker.hidden) return; // Enter in the EarthBank search box
    if (!checkId()) { idInput.focus(); return; }
    var id = idInput.value.trim();
    var path = 'mounts/' + id + '/index.md';
    var text = buildText(id);
    document.getElementById('yaml-out').value = text;
    document.getElementById('done-id').textContent = id;
    document.getElementById('done-path').textContent = path;
    document.getElementById('no-repo-msg').hidden = !!repo;
    if (repo) {
      ghBtn.href = 'https://github.com/' + repo + '/new/' + branch +
        '?filename=' + encodeURIComponent(path) + '&value=' + encodeURIComponent(text);
    }
    showStep(2);
  });

  document.getElementById('copy-yaml').addEventListener('click', function () {
    var t = document.getElementById('yaml-out');
    t.select();
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject())
      .catch(function () { document.execCommand('copy'); });
  });
})();
