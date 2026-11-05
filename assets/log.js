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
  var stepForm = document.getElementById('log-step-form'), stepDone = document.getElementById('log-step-done');
  var nextBtn = document.getElementById('log-next'), backBtn = document.getElementById('log-back');
  var ghBtn = document.getElementById('log-github'), errBox = document.getElementById('log-error');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function q(s) { return JSON.stringify(String(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function type() { return form.querySelector('input[name=type]:checked').value; }

  // ---------- open ----------
  document.querySelectorAll('[data-add-entry]').forEach(function (b) {
    b.addEventListener('click', function () {
      form.reset();
      var opts = samples.map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.id) + (s.earthbank ? ' · EarthBank ' + s.earthbank : '') + '</option>';
      }).join('');
      f.link_sample.innerHTML = opts; f.remove_sample.innerHTML = opts;
      // start on the first sample that isn't linked yet
      for (var i = 0; i < samples.length; i++) if (!samples[i].earthbank) { f.link_sample.selectedIndex = i; break; }
      var d = new Date();
      f.date.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      try { f.by.value = localStorage.getItem('mounts.by') || ''; } catch (e) {}
      chosen = null;
      showType(); sampleChanged(); showStep(1);
      dlg.showModal();
    });
  });
  dlg.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { dlg.close(); });
  });

  // ---------- entry types ----------
  document.getElementById('log-types').addEventListener('change', showType);
  function showType() {
    var t = type();
    form.querySelectorAll('fieldset[data-for]').forEach(function (fs) { fs.hidden = fs.dataset.for !== t; });
    document.getElementById('log-note-opt').textContent = t === 'note' ? '' : '(optional)';
    errBox.textContent = '';
    if (t === 'link') { loadList().then(search); }
  }

  // ---------- EarthBank search (same list as the New mount form) ----------
  var eb = null, ebLoading = null, chosen = null;
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
      status.textContent = 'The EarthBank sample list isn\'t available yet. Type the EarthBank sample ID below instead.';
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
      (total > 100 ? ', showing the first 100.' : '.') : 'No matches.';
    results.innerHTML = hits.map(function (s) {
      return '<label class="pick-item"><input type="radio" name="eb_pick" value="' + s[0] + '"' + (chosen === s[0] ? ' checked' : '') + '>' +
        '<span><span class="mono">' + esc(s[1] || '(no name)') + '</span><small>' +
        esc([s[3] >= 0 ? eb.places[s[3]] : '', s[2] >= 0 ? eb.packages[s[2]][1] : '', 'ID ' + s[0]].filter(Boolean).join(' · ')) +
        '</small></span></label>';
    }).join('');
  }
  var timer;
  qBox.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 150); });
  results.addEventListener('change', function (e) {
    chosen = +e.target.value;
    f.earthbank.value = chosen;
  });
  f.link_sample.addEventListener('change', sampleChanged);
  function sampleChanged() {
    var s = samples[f.link_sample.selectedIndex] || {};
    document.getElementById('log-current-link').textContent = s.earthbank
      ? 'Currently linked to EarthBank sample ' + s.earthbank + '. Pick another to re-link it.'
      : 'Not linked to EarthBank yet.';
    qBox.value = s.id || '';
    chosen = null; f.earthbank.value = '';
    if (eb) search();
  }
  f.unlink.addEventListener('change', function () { document.getElementById('log-eb').hidden = f.unlink.checked; });

  // ---------- build the entry ----------
  function val(name) { return (f[name].value || '').trim(); }
  function buildEntry() {
    var t = type();
    var now = new Date();
    var date = (val('date') || '') + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var lines = ['date: ' + q(date)];
    if (val('by')) lines.push('by: ' + q(val('by')));
    var problem = '';
    if (t === 'link') {
      if (!samples.length) problem = 'This mount has no samples yet.';
      lines.push('type: ' + (f.unlink.checked ? 'unlink' : 'link'));
      lines.push('sample: ' + q(val('link_sample')));
      if (!f.unlink.checked) {
        if (!/^\d+$/.test(val('earthbank'))) problem = 'Choose an EarthBank sample, or type its ID.';
        lines.push('earthbank: ' + val('earthbank'));
      }
    } else if (t === 'prep') {
      lines.push('type: prep', 'step: ' + f.step.value);
      if (!val('detail') && f.step.value === 'other') problem = 'Describe what was done.';
      if (val('detail')) lines.push('detail: ' + q(val('detail')));
    } else if (t === 'analysis') {
      if (!val('technique')) problem = 'Enter the technique.';
      lines.push('type: analysis', 'technique: ' + q(val('technique')));
      ['instrument', 'samples', 'link'].forEach(function (k) { if (val(k)) lines.push(k + ': ' + q(val(k))); });
    } else if (t === 'location') {
      if (!val('storage')) problem = 'Enter the new location.';
      lines.push('type: location', 'storage: ' + q(val('storage')));
    } else if (t === 'add-sample') {
      var id = val('new_sample');
      if (!id) problem = 'Enter the sample ID.';
      else if (samples.some(function (s) { return String(s.id) === id; })) problem = 'That sample is already in the mount.';
      lines.push('type: add-sample', 'sample: ' + q(id));
      if (val('position')) lines.push('position: ' + q(val('position')));
    } else if (t === 'remove-sample') {
      if (!samples.length) problem = 'This mount has no samples.';
      lines.push('type: remove-sample', 'sample: ' + q(val('remove_sample')));
    } else if (t === 'note') {
      if (!val('note')) problem = 'Write the note.';
      lines.push('type: note');
    }
    if (val('note')) lines.push('note: ' + q(val('note')));
    var stamp = val('date').replace(/-/g, '') + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    var kind = t === 'link' && f.unlink.checked ? 'unlink' : t;
    return { problem: problem, kind: kind, text: lines.join('\n') + '\n',
             path: '_data/log/' + mountId + '/' + stamp + '-' + kind + '.yml' };
  }

  // ---------- steps ----------
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
