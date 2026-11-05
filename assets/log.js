// Mount page: "Add to history" dialog. Writes a small dated entry file
// (_data/log/<MOUNT>/<date>-<type>.yml) and opens GitHub with it pre-filled.
// The site works out the mount's current state from these entries when it builds.
(function () {
  var dlg = document.getElementById('log-dialog');
  if (!dlg) return;
  var form = document.getElementById('log-form');
  var f = form.elements;
  var repo = dlg.dataset.repo, branch = dlg.dataset.branch || 'main';
  var state = JSON.parse(document.getElementById('mount-state').textContent);
  var mountId = state.mount_id;
  var samples = state.samples || [];
  var current = state.fields || {};
  var stepForm = document.getElementById('log-step-form'), stepDone = document.getElementById('log-step-done');
  var nextBtn = document.getElementById('log-next'), backBtn = document.getElementById('log-back');
  var ghBtn = document.getElementById('log-github'), errBox = document.getElementById('log-error');
  var NEW = '__new__';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function q(s) { return JSON.stringify(String(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function val(name) { return (f[name].value || '').trim(); }
  function tab() { return form.querySelector('input[name=type]:checked').value; }

  // ---------- open ----------
  // Buttons: data-add-entry="sample" | "details" | "hires" | "note"
  // (optionally data-sample="<ID>" or data-file="<image name>")
  var images = state.images || [], hires = state.hires || {};
  document.querySelectorAll('[data-add-entry]').forEach(function (b) {
    b.addEventListener('click', function () { open(b.dataset.addEntry || 'sample', b.dataset.sample, b.dataset.file); });
  });
  function open(which, sampleId, fileName) {
    form.reset();
    dlg.querySelector('.dialog-foot [data-close]').textContent = 'Cancel';
    f.sample_pick.innerHTML = samples.map(function (s, i) {
      return '<option value="' + i + '">' + esc(s.id) + (s.earthbank ? ' · EarthBank ' + s.earthbank : ' · not linked') + '</option>';
    }).join('') + '<option value="' + NEW + '">+ New sample…</option>';
    var pick = 0;
    for (var i = 0; i < samples.length; i++) if (!samples[i].earthbank) { pick = i; break; }
    if (sampleId) samples.forEach(function (s, k) { if (String(s.id) === sampleId) pick = k; });
    f.sample_pick.value = samples.length ? String(pick) : NEW;
    f.hires_file.innerHTML = images.length ? images.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + (hires[n] ? ' · has a link' : '') + '</option>';
    }).join('') : '<option value="">No images uploaded yet</option>';
    if (fileName) f.hires_file.value = fileName;
    form.querySelector('input[name=type][value="' + which + '"]').checked = true;
    var d = new Date();
    f.date.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    try { f.by.value = localStorage.getItem('mounts.by') || ''; } catch (e) {}
    if (!f.by.value && window.GH && GH.user) f.by.value = GH.user.name;
    setNextLabel();
    showTab(); sampleChanged(); whatChanged(); hiresChanged(); showStep(1);
    dlg.showModal();
  }
  window.openMountHistory = open;
  dlg.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { dlg.close(); });
  });

  // ---------- tabs ----------
  document.getElementById('log-types').addEventListener('change', showTab);
  function showTab() {
    var t = tab();
    form.querySelectorAll('fieldset[data-for]').forEach(function (fs) { fs.hidden = fs.dataset.for !== t; });
    document.getElementById('log-note-label').innerHTML = t === 'note'
      ? 'Note' : 'Comment <span class="muted">(optional)</span>';
    f.note.rows = t === 'note' ? 5 : 2;
    errBox.textContent = '';
    if (t === 'sample') loadList().then(search);
  }

  // ---------- Edit / link sample ----------
  var chosen = null;
  function picked() { return f.sample_pick.value === NEW ? null : samples[+f.sample_pick.value]; }
  f.sample_pick.addEventListener('change', sampleChanged);
  function sampleChanged() {
    var s = picked();
    f.sample_id.value = s ? s.id : '';
    f.position.value = s ? (s.position || '') : '';
    f.sample_id.placeholder = s ? '' : 'e.g. MM26-04';
    document.getElementById('log-current-link').textContent = s && s.earthbank
      ? '· currently linked to sample ' + s.earthbank + '. Pick another to re-link.'
      : '· not linked yet';
    document.getElementById('log-unlink-row').hidden = !(s && s.earthbank);
    f.unlink.checked = false; document.getElementById('log-eb').hidden = false;
    document.getElementById('log-rename-hint').hidden = true;
    qBox.value = s ? s.id : '';
    chosen = null; f.earthbank.value = '';
    if (eb) search();
  }
  f.sample_id.addEventListener('input', function () {
    var s = picked();
    document.getElementById('log-rename-hint').hidden = !(s && val('sample_id') && val('sample_id') !== String(s.id));
  });
  f.unlink.addEventListener('change', function () { document.getElementById('log-eb').hidden = f.unlink.checked; });

  // EarthBank search (same list as the New mount form)
  var eb = null, ebLoading = null;
  var qBox = document.getElementById('log-q'), status = document.getElementById('log-eb-status');
  var results = document.getElementById('log-eb-results');
  function loadList() {
    if (ebLoading) return ebLoading;
    status.textContent = 'Loading the EarthBank sample list…';
    ebLoading = fetch(dlg.dataset.earthbankList).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) {
      d.samples.forEach(function (s) { s.push((s[1] + ' ' + (s[3] >= 0 ? d.places[s[3]] : '')).toLowerCase()); });
      eb = d;
    }).catch(function () {
      ebLoading = null;
      status.textContent = 'The EarthBank sample list isn\'t available right now. Type the EarthBank sample ID below instead.';
    });
    return ebLoading;
  }
  function search() {
    if (!eb) return;
    var words = qBox.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { results.innerHTML = ''; status.textContent = 'Type a sample name or place.'; return; }
    var hits = [], total = 0;
    for (var i = 0; i < eb.samples.length; i++) {
      var s = eb.samples[i], ok = true;
      for (var w = 0; w < words.length; w++) if (s[4].indexOf(words[w]) === -1) { ok = false; break; }
      if (!ok) continue;
      total++;
      if (hits.length < 100) hits.push(s);
    }
    var qq = words.join(' ');
    hits.sort(function (a, b) {
      var an = a[1].toLowerCase(), bn = b[1].toLowerCase();
      return (an === qq ? 0 : an.indexOf(qq) === 0 ? 1 : 2) - (bn === qq ? 0 : bn.indexOf(qq) === 0 ? 1 : 2) ||
        an.localeCompare(bn, undefined, { numeric: true });
    });
    status.textContent = total ? total.toLocaleString() + ' match' + (total === 1 ? '' : 'es') +
      (total > 100 ? ', showing the first 100.' : '.') : 'No matches. Try part of the name, or a place.';
    results.innerHTML = hits.map(function (s) {
      return '<label class="pick-item"><input type="radio" name="eb_pick" value="' + s[0] + '"' + (chosen === s[0] ? ' checked' : '') + '>' +
        '<span><span class="mono">' + esc(s[1] || '(no name)') + '</span><small>' +
        esc([s[3] >= 0 ? eb.places[s[3]] : '', s[2] >= 0 ? eb.packages[s[2]][1] : '', 'ID ' + s[0]].filter(Boolean).join(' · ')) +
        '</small></span></label>';
    }).join('');
  }
  var timer;
  qBox.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 150); });
  results.addEventListener('change', function (e) { chosen = +e.target.value; f.earthbank.value = chosen; });

  // ---------- Hi-res link ----------
  f.hires_file.addEventListener('change', hiresChanged);
  f.hires_remove.addEventListener('change', function () { document.getElementById('log-hires-fields').hidden = f.hires_remove.checked; });
  function hiresChanged() {
    var h = hires[f.hires_file.value];
    document.getElementById('log-hires-current').textContent = h ? 'Current link: ' + h.url : 'No hi-res link yet.';
    document.getElementById('log-hires-remove-row').hidden = !h;
    f.hires_remove.checked = false; document.getElementById('log-hires-fields').hidden = false;
    f.hires_url.value = ''; f.hires_label.value = h && h.label ? h.label : '';
  }

  // ---------- Mount details ----------
  f.what.addEventListener('change', whatChanged);
  f.field.addEventListener('change', function () { f.value.value = current[f.field.value] != null ? current[f.field.value] : ''; });
  function whatChanged() {
    var w = f.what.value;
    form.querySelectorAll('[data-what]').forEach(function (el) { el.hidden = el.dataset.what.split(' ').indexOf(w) === -1; });
    var ph = { polish: 'e.g. 1 µm diamond, 5 min', etch: 'e.g. 5.5 M HNO₃, 20 s at 21 °C', coat: 'e.g. Carbon, ~20 nm', other: 'What was done' };
    if (ph[w]) f.detail.placeholder = ph[w];
    if (w === 'detail') f.value.value = current[f.field.value] != null ? current[f.field.value] : '';
    errBox.textContent = '';
  }

  // ---------- build the entry ----------
  function buildEntry() {
    var t = tab();
    var now = new Date();
    var lines = ['date: ' + q((val('date') || '') + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()))];
    if (val('by')) lines.push('by: ' + q(val('by')));
    var problem = '', kind = t;
    if (t === 'sample') {
      var s = picked(), id = val('sample_id'), ebId = val('earthbank');
      if (ebId && !/^\d+$/.test(ebId)) problem = 'An EarthBank sample ID is a number.';
      lines.push('type: sample');
      if (!s) {
        if (!id) problem = 'Enter the new sample\'s ID.';
        else if (samples.some(function (x) { return String(x.id) === id; })) problem = 'A sample with that ID is already in the mount.';
        lines.push('sample: ' + q(id), 'new: true');
        if (val('position')) lines.push('position: ' + q(val('position')));
      } else {
        var changed = false;
        lines.push('sample: ' + q(s.id));
        if (!id) problem = 'The sample ID can\'t be empty.';
        if (id && id !== String(s.id)) {
          if (samples.some(function (x) { return String(x.id) === id; })) problem = 'Another sample already has that ID.';
          lines.push('id: ' + q(id)); changed = true;
        }
        if (val('position') !== (s.position || '')) { lines.push('position: ' + q(val('position'))); changed = true; }
        if (f.unlink.checked) { lines.push('unlink: true'); changed = true; }
        if (ebId && !f.unlink.checked && +ebId !== s.earthbank) changed = true;
        if (!changed && !(ebId && !f.unlink.checked) && !problem) problem = 'Nothing has changed for this sample.';
      }
      if (ebId && !f.unlink.checked) lines.push('earthbank: ' + ebId);
    } else if (t === 'details') {
      var w = f.what.value;
      if (['polish', 'etch', 'coat', 'other'].indexOf(w) !== -1) {
        kind = 'prep';
        if (!val('detail') && w === 'other') problem = 'Describe what was done.';
        lines.push('type: prep', 'step: ' + w);
        if (val('detail')) lines.push('detail: ' + q(val('detail')));
      } else if (w === 'analysis') {
        kind = 'analysis';
        if (!val('technique')) problem = 'Enter the technique.';
        lines.push('type: analysis', 'technique: ' + q(val('technique')));
        ['instrument', 'samples', 'link'].forEach(function (k) { if (val(k)) lines.push(k + ': ' + q(val(k))); });
      } else if (w === 'location') {
        kind = 'location';
        if (!val('storage')) problem = 'Enter the new location.';
        lines.push('type: location', 'storage: ' + q(val('storage')));
      } else {
        kind = 'detail';
        if (!val('value')) problem = 'Enter the correct value.';
        lines.push('type: detail', 'field: ' + f.field.value, 'value: ' + q(val('value')));
      }
    } else if (t === 'hires') {
      if (!val('hires_file')) problem = 'Upload the map image first (Add files), then add its hi-res link.';
      lines.push('type: hires', 'file: ' + q(val('hires_file')));
      if (f.hires_remove.checked) lines.push('url: ""');
      else {
        if (!/^https?:\/\/\S+$/i.test(val('hires_url'))) problem = 'Paste the full download link, starting with https://';
        lines.push('url: ' + q(val('hires_url')));
        if (val('hires_label')) lines.push('label: ' + q(val('hires_label')));
      }
    } else {
      if (!val('note')) problem = 'Write the note.';
      lines.push('type: note');
    }
    if (val('note')) lines.push('note: ' + q(val('note')));
    var stamp = val('date').replace(/-/g, '') + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    return { problem: problem, kind: kind, text: lines.join('\n') + '\n',
             path: '_data/log/' + mountId + '/' + stamp + '-' + kind + '.yml' };
  }

  // ---------- steps ----------
  function direct() { return window.GH && GH.canWrite(); }
  function setNextLabel() { nextBtn.textContent = direct() ? 'Save' : 'Next'; }
  document.addEventListener('gh-auth', setNextLabel);
  function showStep(n) {
    stepForm.hidden = n !== 1; stepDone.hidden = n !== 2;
    nextBtn.hidden = n !== 1; backBtn.hidden = n !== 2; ghBtn.hidden = n !== 2;
  }
  backBtn.addEventListener('click', function () { showStep(1); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (document.activeElement === qBox) return; // Enter in the search box
    var entry = buildEntry();
    if (entry.problem) { errBox.textContent = entry.problem; return; }
    errBox.textContent = '';
    try { if (val('by')) localStorage.setItem('mounts.by', val('by')); } catch (err) {}
    document.getElementById('log-out').value = entry.text;
    if (direct()) {
      nextBtn.disabled = true;
      nextBtn.innerHTML = '<span class="spinner"></span> Saving…';
      GH.commit([{ path: entry.path, text: entry.text }], 'History: ' + mountId + ' (' + entry.kind + ')')
        .then(function () {
          document.getElementById('log-saved').hidden = false;
          document.getElementById('log-gh').hidden = true;
          showStep(2);
          ghBtn.hidden = true; backBtn.hidden = true;
          dlg.querySelector('.dialog-foot [data-close]').textContent = 'Close';
        })
        .catch(function (err) { errBox.textContent = err.message; })
        .then(function () { nextBtn.disabled = false; setNextLabel(); });
      return;
    }
    document.getElementById('log-saved').hidden = true;
    document.getElementById('log-gh').hidden = false;
    ghBtn.href = 'https://github.com/' + repo + '/new/' + branch + '?filename=' + encodeURIComponent(entry.path) +
      '&value=' + encodeURIComponent(entry.text) +
      '&message=' + encodeURIComponent('History: ' + mountId + ' (' + entry.kind + ')');
    showStep(2);
  });

  // ---------- history list ----------
  var more = document.getElementById('history-more');
  if (more) {
    var label = more.textContent;
    more.addEventListener('click', function () {
      var rest = document.querySelectorAll('#history [data-more]');
      var show = rest[0] && rest[0].hidden;
      rest.forEach(function (li) { li.hidden = !show; });
      more.textContent = show ? 'Show fewer' : label;
    });
  }
})();
