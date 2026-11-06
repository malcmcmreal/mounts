// Home page: change details of several selected mounts at once, and/or add the same note to each.
// Writes one history entry per mount (type: details, plus a note entry), all in a single commit.
(function () {
  var dlg = document.getElementById('bulk-dialog');
  var openBtn = document.getElementById('pick-edit');
  if (!dlg || !openBtn) return;
  var form = document.getElementById('bulk-form');
  var f = form.elements;
  var err = document.getElementById('bulk-error');
  var go = document.getElementById('bulk-go');
  var body = document.getElementById('bulk-body'), done = document.getElementById('bulk-done');
  var FIELDS = ['project', 'year', 'created_by', 'mount_format', 'minerals', 'polish', 'etch', 'coating', 'storage'];

  function q(s) { return JSON.stringify(String(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function val(n) { return (f[n].value || '').trim(); }
  function picked() {
    return Array.prototype.map.call(document.querySelectorAll('.mount-row .pick:checked'),
      function (i) { return i.closest('.mount-row'); });
  }
  function canWrite() { return window.GH && GH.canWrite(); }
  function updateSignin() {
    document.getElementById('bulk-signin').hidden = canWrite();
    go.disabled = !canWrite();
  }
  document.addEventListener('gh-auth', updateSignin);

  // Under each field: the current value if all selected mounts share it, otherwise "Varies"
  function showCurrent(rows) {
    dlg.querySelectorAll('[data-cur]').forEach(function (el) {
      var vals = rows.map(function (r) { return r.dataset[el.dataset.cur] || ''; });
      var uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
      el.textContent = uniq.length > 1 ? 'Now: varies' : uniq[0] ? 'Now: ' + uniq[0] : '';
    });
  }

  openBtn.addEventListener('click', function () {
    var rows = picked();
    if (!rows.length) return;
    form.reset();
    var d = new Date();
    f.date.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    try { f.by.value = localStorage.getItem('mounts.by') || (window.GH && GH.user && (GH.user.name || GH.user.login)) || ''; } catch (e) {}
    document.getElementById('bulk-which').textContent = rows.length + ' mount' + (rows.length === 1 ? '' : 's') + ': ' +
      rows.map(function (r) { return r.dataset.id; }).join(', ');
    showCurrent(rows);
    err.textContent = '';
    body.hidden = false; done.hidden = true; go.hidden = false;
    dlg.querySelector('.dialog-foot [data-close]').textContent = 'Cancel';
    updateSignin();
    dlg.showModal();
  });
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!canWrite()) { updateSignin(); return; }
    var rows = picked();
    var set = FIELDS.filter(function (k) { return val(k); });
    var note = val('note');
    if (!set.length && !note) { err.textContent = 'Fill in at least one field or a note.'; return; }
    if (val('year') && !/^\d{4}$/.test(val('year'))) { err.textContent = 'Year made should be a four-digit year.'; return; }
    err.textContent = '';
    try { if (val('by')) localStorage.setItem('mounts.by', val('by')); } catch (x) {}

    var now = new Date();
    var time = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var stamp = val('date').replace(/-/g, '') + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    var head = ['date: ' + q(val('date') + ' ' + time)];
    if (val('by')) head.push('by: ' + q(val('by')));

    var files = [];
    rows.forEach(function (r) {
      var dir = '_data/log/' + r.dataset.id + '/';
      if (set.length) {
        var lines = head.concat(['type: details', 'set:']);
        set.forEach(function (k) { lines.push('  ' + k + ': ' + q(val(k))); });
        files.push({ path: dir + stamp + '-details.yml', text: lines.join('\n') + '\n' });
      }
      if (note) {
        files.push({ path: dir + stamp + '-note.yml', text: head.concat(['type: note', 'note: ' + q(note)]).join('\n') + '\n' });
      }
    });

    go.disabled = true;
    go.innerHTML = '<span class="spinner"></span> Saving…';
    var ids = rows.map(function (r) { return r.dataset.id; });
    var msg = 'History: ' + (ids.length > 4 ? ids.length + ' mounts' : ids.join(', ')) + ' (bulk edit)';
    GH.commit(files, msg).then(function () {
      var what = [];
      if (set.length) what.push('details');
      if (note) what.push('a note');
      document.getElementById('bulk-done-text').textContent =
        'Added ' + what.join(' and ') + ' to ' + ids.length + ' mount' + (ids.length === 1 ? '' : 's') + '.';
      body.hidden = true; done.hidden = false; go.hidden = true;
      dlg.querySelector('.dialog-foot [data-close]').textContent = 'Close';
    }).catch(function (x) {
      err.textContent = x.message;
    }).then(function () { go.disabled = false; go.textContent = 'Save'; });
  });
})();
