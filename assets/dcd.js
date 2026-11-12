// Mount page: edit a .dcd grain coordinate file (comma-separated stage points).
// Each point line has its name in the 5th column, e.g. GR001_G01, GR001_G01b … GR001_G01f:
// a parent grain (G01) followed by sub-grains (letters). Lines that aren't grain points
// (fiducials such as RecMark P1, P2) are always kept.
// Options: remove the last N sub-grains of every grain, or keep parent grains only;
// save as a new file (default) or replace the original.
(function () {
  var me = document.currentScript;
  var mountId = me.dataset.mount, existing = [];
  try { existing = JSON.parse(me.dataset.existing || '[]'); } catch (e) {}
  var NAME = /^(.*G\d+)([a-z]?)$/;

  var dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML =
    '<form method="dialog" novalidate>' +
    '<div class="dialog-head"><h2>Edit <span class="mono" id="dcd-name"></span></h2>' +
    '<button type="button" class="icon-btn" data-close aria-label="Close">&times;</button></div>' +
    '<div class="dialog-body" id="dcd-body">' +
    '<p class="small" id="dcd-info">Loading…</p>' +
    '<fieldset class="dl-set"><legend>Sub-grains</legend>' +
    '<label class="check"><input type="radio" name="mode" value="some" checked> Remove ' +
    '<input type="number" name="n" min="1" value="2" class="dcd-n"> sub-grains from each grain (the last ones: f, then e…)</label>' +
    '<label class="check"><input type="radio" name="mode" value="parents"> Keep parent grains only</label>' +
    '</fieldset>' +
    '<label class="check"><input type="checkbox" name="renumber" checked> Renumber the points without gaps (columns 6 and 9)</label>' +
    '<fieldset class="dl-set"><legend>Save</legend>' +
    '<label class="check"><input type="radio" name="save" value="new" checked> Upload as a new file</label>' +
    '<label id="dcd-newname">File name <input name="fname" class="mono"></label>' +
    '<label class="check"><input type="radio" name="save" value="replace"> Replace this file</label>' +
    '</fieldset>' +
    '<p class="small" id="dcd-summary"></p>' +
    '<p class="hint" id="dcd-signin" hidden>Sign in with GitHub (top right) to save.</p>' +
    '<p class="hint error" id="dcd-error"></p>' +
    '</div>' +
    '<div class="dialog-body" id="dcd-done" hidden><div class="saved"><span aria-hidden="true">✓</span>' +
    '<div><strong>Saved.</strong> <span id="dcd-done-text"></span> It appears on the page in about a minute.</div></div></div>' +
    '<div class="dialog-foot"><button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="submit" class="btn primary" id="dcd-go">Save</button></div>' +
    '</form>';
  document.body.appendChild(dlg);
  var form = dlg.querySelector('form'), f = form.elements;
  var info = dlg.querySelector('#dcd-info'), sum = dlg.querySelector('#dcd-summary'), err = dlg.querySelector('#dcd-error');
  var go = dlg.querySelector('#dcd-go');
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });

  var file = null;   // { path, name, eol, endsWithEol, lines: [{ text, cols, grain, sub }], maxSubs }

  function parse(text) {
    var eol = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    var raw = text.split(eol), ends = raw.length && raw[raw.length - 1] === '';
    if (ends) raw.pop();
    var counts = {}, lines = raw.map(function (t) {
      var cols = t.split(','), m = cols.length > 4 ? NAME.exec(cols[4].trim()) : null;
      var point = m && cols[3] && cols[3].trim() !== 'RecMark';
      if (point && m[2]) counts[m[1]] = (counts[m[1]] || 0) + 1;
      return { text: t, cols: cols, grain: point ? m[1] : null, sub: point ? m[2] : null };
    });
    var maxSubs = 0, grains = {};
    lines.forEach(function (l) { if (l.grain) grains[l.grain] = 1; });
    Object.keys(counts).forEach(function (g) { maxSubs = Math.max(maxSubs, counts[g]); });
    return { eol: eol, ends: ends, lines: lines, maxSubs: maxSubs, grains: Object.keys(grains).length,
      points: lines.filter(function (l) { return l.grain; }).length };
  }

  // Which lines stay, given the options
  function result() {
    var parents = f.mode.value === 'parents', n = Math.max(1, Math.floor(+f.n.value || 1));
    var subsOf = {};
    file.lines.forEach(function (l) { if (l.grain && l.sub) (subsOf[l.grain] = subsOf[l.grain] || []).push(l.sub); });
    Object.keys(subsOf).forEach(function (g) { subsOf[g].sort(); });
    var out = [], k = 0, removed = 0;
    file.lines.forEach(function (l) {
      if (l.grain && l.sub) {
        var subs = subsOf[l.grain], keepCount = parents ? 0 : Math.max(0, subs.length - n);
        if (subs.indexOf(l.sub) >= keepCount) { removed++; return; }
      }
      if (l.grain && f.renumber.checked) {
        k++;
        var c = l.cols.slice();
        if (c.length > 5) c[5] = String(k);
        if (c.length > 8) c[8] = String(k);
        out.push(c.join(','));
      } else out.push(l.text);
    });
    return { text: out.join(file.eol) + (file.ends ? file.eol : ''), removed: removed, kept: file.points - removed, n: n, parents: parents };
  }
  function suggestName() {
    var base = file.name.replace(/\.dcd$/i, ''), r = result(), left = file.maxSubs - (r.parents ? file.maxSubs : r.n);
    var tag = r.parents || left <= 0 ? 'ParentGrains' : (left + 1) + '_SubGrains';
    var name = /\d+_SubGrains|ParentGrains?/.test(base) ? base.replace(/\d+_SubGrains|ParentGrains?/, tag) : base + '_' + tag;
    return name + '.dcd';
  }
  var nameTouched = false;
  function update() {
    if (!file) return;
    var r = result();
    if (!nameTouched) f.fname.value = suggestName();
    dlg.querySelector('#dcd-newname').hidden = f.save.value !== 'new';
    sum.textContent = 'Keeps ' + r.kept + ' of ' + file.points + ' points (removes ' + r.removed + ').';
    var signedIn = window.GH && GH.canWrite();
    dlg.querySelector('#dcd-signin').hidden = signedIn;
    go.disabled = !signedIn || !r.removed;
  }
  form.addEventListener('input', function (e) { if (e.target.name === 'fname') nameTouched = true; update(); });
  form.addEventListener('change', update);
  document.addEventListener('gh-auth', update);

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dcd-edit]');
    if (!b) return;
    file = null; nameTouched = false; err.textContent = ''; sum.textContent = '';
    form.reset();
    dlg.querySelector('#dcd-body').hidden = false; dlg.querySelector('#dcd-done').hidden = true; go.hidden = false;
    dlg.querySelector('.dialog-foot [data-close]').textContent = 'Cancel';
    var path = b.dataset.dcdEdit, name = path.split('/').pop();
    dlg.querySelector('#dcd-name').textContent = name;
    info.textContent = 'Loading…'; go.disabled = true;
    dlg.showModal();
    fetch(b.dataset.url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Couldn\'t load the file.');
      return r.text();
    }).then(function (t) {
      file = parse(t); file.path = path; file.name = name;
      if (!file.points) throw new Error('No grain points found (names like GR001_G01, GR001_G01b in the 5th column).');
      info.textContent = file.grains + ' grains, ' + file.points + ' points' +
        (file.maxSubs ? ', up to ' + file.maxSubs + ' sub-grains per grain.' : ', no sub-grains.');
      f.n.max = Math.max(1, file.maxSubs);
      f.n.value = Math.min(2, Math.max(1, file.maxSubs));
      update();
    }).catch(function (x) { info.textContent = ''; err.textContent = x.message; });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!file || !(window.GH && GH.canWrite())) return;
    var r = result(), target;
    if (f.save.value === 'new') {
      var nm = f.fname.value.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
      if (!/\.dcd$/i.test(nm)) nm += '.dcd';
      if (nm === file.name || existing.indexOf(nm) !== -1) { err.textContent = 'A file called ' + nm + ' already exists. Choose another name, or pick Replace this file.'; return; }
      target = file.path.replace(/[^/]+$/, nm);
    } else target = file.path;
    err.textContent = '';
    go.disabled = true; go.innerHTML = '<span class="spinner"></span> Saving…';
    var what = r.parents ? 'parent grains only' : r.n + ' sub-grain' + (r.n === 1 ? '' : 's') + ' removed per grain';
    var fname = target.split('/').pop();
    GH.commit([{ path: target, text: r.text }], (target === file.path ? 'Edit ' + fname + ' in ' : 'Add ' + fname + ' to ') + mountId + ' (' + what + ')')
      .then(function () {
        if (existing.indexOf(fname) === -1) existing.push(fname);
        dlg.querySelector('#dcd-done-text').textContent = (target === file.path ? 'Replaced ' : 'Uploaded ') + fname + ' with ' + r.kept + ' points (' + what + ').';
        dlg.querySelector('#dcd-body').hidden = true; dlg.querySelector('#dcd-done').hidden = false; go.hidden = true;
        dlg.querySelector('.dialog-foot [data-close]').textContent = 'Close';
      })
      .catch(function (x) { err.textContent = x.message; })
      .then(function () { go.disabled = false; go.textContent = 'Save'; });
  });
})();
