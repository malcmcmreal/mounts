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
        '<input data-k="position" placeholder="Where in the mount (e.g. top left, row 1)">';
      rowsBox.appendChild(div);
    }
    for (var j = old.length - 1; j >= n; j--) old[j].remove();
  }

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
    });
    lines.push('---');
    var notes = (f.notes.value || '').trim();
    lines.push(notes || '');
    return lines.join('\n') + '\n';
  }

  // ---------- steps ----------
  function showStep(n) {
    stepForm.hidden = n !== 1; stepDone.hidden = n !== 2;
    nextBtn.hidden = n !== 1; backBtn.hidden = n !== 2; ghBtn.hidden = n !== 2 || !repo;
  }
  backBtn.addEventListener('click', function () { showStep(1); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
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
