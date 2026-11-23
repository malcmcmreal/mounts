// Mount page: edit a .dcd or TrackWorks .csv grain coordinate file (comma-separated stage points).
// .csv: COORDINATION section (fiducials) and GRAIN section, rows name,X,Y,Z.
// Each point line has its name in the 5th column, e.g. GR001_G01, GR001_G01b … GR001_G01f:
// a parent grain (G01) followed by sub-grains (letters). Lines that aren't grain points
// (fiducials such as RecMark P1, P2) are always kept.
// Options: remove the last N sub-grains of every grain, or keep parent grains only;
// save as a new file (default) or replace the original.
// "+ Create" uses the same window to write a new file in another instrument's format
// from any .dcd/.csv here: GStar (.csv, Y before X, First/Second/Third then GRAIN)
// or ESL (.csv, X,Y,Z,Name,Type with RefMark and Spot rows).
(function () {
  var me = document.currentScript;
  var mountId = me.dataset.mount, existing = [];
  try { existing = JSON.parse(me.dataset.existing || '[]'); } catch (e) {}
  var NAME = /^(.*?\d+)([a-z]?)$/;
  // Coordinate file groups (.dcd / .csv / other) start collapsed; one you open stays open next time
  document.querySelectorAll('#grain-files details.file-group').forEach(function (d) {
    var k = 'grain-group-open:' + d.dataset.group;
    try { if (localStorage.getItem(k)) d.open = true; } catch (e) {}
    d.addEventListener('toggle', function () { try { d.open ? localStorage.setItem(k, '1') : localStorage.removeItem(k); } catch (e) {} });
  });   // GR001_G01b, GR006_Grain01b … → grain + sub-grain letter

  var dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML =
    '<form method="dialog" novalidate>' +
    '<div class="dialog-head"><h2><span id="dcd-verb">Edit</span> <span class="mono" id="dcd-name"></span></h2>' +
    '<button type="button" class="icon-btn" data-close aria-label="Close">&times;</button></div>' +
    '<div class="dialog-body" id="dcd-body">' +
    '<div id="dcd-create" hidden>' +
    '<label>From file <select name="src"></select></label>' +
    '<fieldset class="dl-set"><legend>Format</legend>' +
    '<label class="check"><input type="radio" name="fmt" value="gstar" checked> GStar coordinate file (.csv; columns Y, X, Z)</label>' +
    '<label class="check"><input type="radio" name="fmt" value="esl"> ESL coordinate file (.csv; columns X, Y, Z, Name, Type)</label>' +
    '</fieldset>' +
    '<label>Point names start with <input name="prefix" class="mono" size="12"></label>' +
    '<p class="hint" id="dcd-example"></p>' +
    '</div>' +
    '<p class="small" id="dcd-info">Loading…</p>' +
    '<fieldset class="dl-set"><legend>Sub-grains</legend>' +
    '<label class="check"><input type="radio" name="mode" value="some" checked> Remove ' +
    '<input type="number" name="n" min="1" value="2" class="dcd-n"> sub-grains from each grain (the last ones: f, then e…)</label>' +
    '<label class="check"><input type="radio" name="mode" value="parents"> Keep parent grains only</label>' +
    '<label class="check"><input type="radio" name="mode" value="all"> Keep all sub-grains</label>' +
    '</fieldset>' +
    '<label class="check"><input type="checkbox" name="swap"> Swap XY (on every point, fiducials included)</label>' +
    '<label class="check"><input type="checkbox" name="renumber" checked> Renumber the points without gaps (columns 6 and 9)</label>' +
    '<fieldset class="dl-set" id="dcd-save"><legend>Save</legend>' +
    '<label class="check"><input type="radio" name="save" value="new" checked> Upload as a new file</label>' +
    '<label id="dcd-newname">File name <input name="fname" class="mono"></label>' +
    '<label class="check" id="dcd-replace"><input type="radio" name="save" value="replace"> Replace this file</label>' +
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

  function numXY(cols) { return cols.length > 1 && cols[0].trim() !== '' && !isNaN(+cols[0]) && !isNaN(+cols[1]); }
  function parse(text, csv) {
    var eol = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    var raw = text.split(eol), ends = raw.length && raw[raw.length - 1] === '';
    if (ends) raw.pop();
    var counts = {}, sec = null, lines = raw.map(function (t) {
      var cols = t.split(','), m, point, xy, fid = false;
      if (csv) {                                       // name,X,Y,Z rows inside sections
        var head = (cols[0] || '').trim().toUpperCase();
        if (head === 'COORDINATION' || head === 'GRAIN') { sec = head; return { text: t, cols: cols }; }
        if (cols.every(function (c) { return !c.trim(); })) sec = null;
        m = sec === 'GRAIN' ? NAME.exec(cols[0].trim()) : null;
        point = !!m;
        // X and Y are columns 2 and 3
        xy = (sec === 'GRAIN' || sec === 'COORDINATION') && cols.length > 2 && cols[1].trim() !== '' && !isNaN(+cols[1]) && !isNaN(+cols[2]) ? 1 : -1;
        var fid = sec === 'COORDINATION' && xy >= 0;
      } else {
        m = cols.length > 4 ? NAME.exec(cols[4].trim()) : null;
        point = m && cols[3] && cols[3].trim() !== 'RecMark';
        xy = numXY(cols) ? 0 : -1;
        fid = xy >= 0 && cols[3] && cols[3].trim() === 'RecMark';
      }
      if (point && m[2]) counts[m[1]] = (counts[m[1]] || 0) + 1;
      return { text: t, cols: cols, grain: point ? m[1] : null, sub: point ? m[2] : null, xy: xy, fid: !!fid && !point };
    });
    var maxSubs = 0, grains = {};
    lines.forEach(function (l) { if (l.grain) grains[l.grain] = 1; });
    Object.keys(counts).forEach(function (g) { maxSubs = Math.max(maxSubs, counts[g]); });
    return { eol: eol, ends: ends, lines: lines, maxSubs: maxSubs, grains: Object.keys(grains).length,
      points: lines.filter(function (l) { return l.grain; }).length };
  }

  // Which lines stay, given the options
  function result() {
    var parents = f.mode.value === 'parents', keepAll = f.mode.value === 'all', n = Math.max(1, Math.floor(+f.n.value || 1));
    var swap = f.swap.checked;
    var subsOf = {};
    file.lines.forEach(function (l) { if (l.grain && l.sub) (subsOf[l.grain] = subsOf[l.grain] || []).push(l.sub); });
    Object.keys(subsOf).forEach(function (g) { subsOf[g].sort(); });
    var out = [], kept = [], k = 0, removed = 0;
    file.lines.forEach(function (l) {
      if (l.grain && l.sub && !keepAll) {
        var subs = subsOf[l.grain], keepCount = parents ? 0 : Math.max(0, subs.length - n);
        if (subs.indexOf(l.sub) >= keepCount) { removed++; return; }
      }
      var c = l.cols.slice(), changed = false;
      if (l.grain && f.renumber.checked && !keepAll && !file.csv) {
        k++;
        if (c.length > 5) c[5] = String(k);
        if (c.length > 8) c[8] = String(k);
        changed = true;
      }
      if (swap && l.xy >= 0) {
        var t = c[l.xy]; c[l.xy] = c[l.xy + 1]; c[l.xy + 1] = t; changed = true;
      }
      out.push(changed ? c.join(',') : l.text);
      if ((l.grain || l.fid) && l.xy >= 0) kept.push({ l: l, x: c[l.xy].trim(), y: c[l.xy + 1].trim(), z: (c[l.xy + 2] || '').trim() });
    });
    if (create) out = convert(kept);
    return { text: create ? out : out.join(file.eol) + (file.ends ? file.eol : ''), removed: removed, kept: file.points - removed, n: n,
      parents: parents, keepAll: keepAll, swap: swap };
  }
  var create = false, ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  // GR001_G01b, Grain01b, OKU-7-G01b → G01b
  function shortName(l) { var m = /(\d+)$/.exec(l.grain); return 'G' + (m ? ('0' + +m[1]).slice(-Math.max(2, String(+m[1]).length)) : l.grain) + (l.sub || ''); }
  function convert(kept) {
    var px = f.prefix.value.trim(), out, fi = 0;
    var fids = kept.filter(function (p) { return p.l.fid; }), pts = kept.filter(function (p) { return !p.l.fid; });
    if (f.fmt.value === 'gstar') {
      out = ['Y,X,Z,'];
      fids.forEach(function (p, i) { out.push([p.y, p.x, p.z, ORD[i] || 'Ref' + (i + 1)].join(',')); });
      out.push(',,,', 'Y,X,Z,GRAIN');
      pts.forEach(function (p) { out.push([p.y, p.x, p.z, px + shortName(p.l)].join(',')); });
      return out.join('\r\n');
    }
    out = ['X,Y,Z,Name,Type'];
    fids.forEach(function (p, i) { out.push([p.x, p.y, p.z, mountId + '_Ref_' + (i + 1), 'RefMark'].join(',')); });
    pts.forEach(function (p) { out.push([p.x, p.y, p.z, px + shortName(p.l), 'Spot'].join(',')); });
    return out.join('\r\n') + '\r\n';
  }
  function suggestName() {
    var base = file.name.replace(/\.(dcd|csv)$/i, '').replace(/_XYswap$/i, ''), r = result(), name = base;
    if (!r.keepAll) {
      var left = file.maxSubs - (r.parents ? file.maxSubs : r.n);
      var tag = r.parents || left <= 0 ? 'ParentGrains' : (left + 1) + '_SubGrains';
      name = /\d+_SubGrains|ParentGrains?/.test(base) ? base.replace(/\d+_SubGrains|ParentGrains?/, tag) : base + '_' + tag;
    }
    // swapping a file that was already swapped turns it back
    var wasSwapped = /_XYswap\.(dcd|csv)$/i.test(file.name);
    if (r.swap !== wasSwapped) name += '_XYswap';
    if (create) return (f.fmt.value === 'gstar' ? 'GStar_' : 'ESL_') + name + '.csv';
    return name + file.ext;
  }
  var nameTouched = false;
  function update() {
    if (!file) return;
    var r = result();
    if (!nameTouched) f.fname.value = suggestName();
    dlg.querySelector('#dcd-newname').hidden = f.save.value !== 'new';
    sum.textContent = 'Keeps ' + r.kept + ' of ' + file.points + ' points (removes ' + r.removed + ')' + (r.swap ? '; X and Y swapped.' : '.');
    f.renumber.disabled = r.keepAll;
    f.renumber.closest('label').classList.toggle('off', !!(file.csv || create));
    if (create) {
      var px = f.prefix.value.trim(), g = f.fmt.value === 'gstar';
      dlg.querySelector('#dcd-example').textContent = 'e.g. ' + (g ? 'First, Second, Third, then ' + px + 'G01, ' + px + 'G01b …'
        : mountId + '_Ref_1 … (RefMark), then ' + px + 'G01, ' + px + 'G01b … (Spot)');
    }
    var signedIn = window.GH && GH.canWrite();
    dlg.querySelector('#dcd-signin').hidden = signedIn;
    go.disabled = !signedIn || !(create || r.removed || r.swap);
  }
  form.addEventListener('input', function (e) { if (e.target.name === 'fname') nameTouched = true; if (e.target.name !== 'src') update(); });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'fmt') { f.prefix.value = f.fmt.value === 'gstar' ? mountId + '-' : mountId + '_'; update(); }
    if (e.target.name === 'src') { var o = f.src.selectedOptions[0]; load(o.value, o.dataset.url, true); }
  });
  form.addEventListener('change', update);
  document.addEventListener('gh-auth', update);

  function open(isCreate) {
    create = isCreate; file = null; nameTouched = false; err.textContent = ''; sum.textContent = '';
    form.reset();
    dlg.querySelector('#dcd-body').hidden = false; dlg.querySelector('#dcd-done').hidden = true; go.hidden = false;
    dlg.querySelector('.dialog-foot [data-close]').textContent = 'Cancel';
    dlg.querySelector('#dcd-verb').textContent = create ? 'Create a coordinate file' : 'Edit';
    dlg.querySelector('#dcd-create').hidden = !create;
    dlg.querySelector('#dcd-replace').classList.toggle('off', create);
    f.save[0].closest('label').classList.toggle('off', create);
    dlg.querySelector('#dcd-save legend').textContent = create ? 'File name' : 'Save';
    f.save.value = 'new';
    f.prefix.value = mountId + '-';
    if (create) f.mode.value = 'all';
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-grain-create]');
    if (c) {
      open(true);
      dlg.querySelector('#dcd-name').textContent = '';
      var picked = document.querySelector('input[name="grain-show"]:checked');
      f.src.innerHTML = '';
      document.querySelectorAll('#grain-files [data-dcd-edit]').forEach(function (b) {
        var o = document.createElement('option'), nm = b.dataset.dcdEdit.split('/').pop();
        o.value = b.dataset.dcdEdit; o.dataset.url = b.dataset.url; o.textContent = nm;
        if (picked && picked.value === nm) o.selected = true;
        f.src.appendChild(o);
      });
      if (!f.src.options.length) { info.textContent = ''; err.textContent = 'There is no .csv or .dcd file here to start from.'; dlg.showModal(); return; }
      dlg.showModal();
      var o = f.src.selectedOptions[0];
      load(o.value, o.dataset.url, true);
      return;
    }
    var b = e.target.closest('[data-dcd-edit]');
    if (!b) return;
    open(false);
    dlg.querySelector('#dcd-name').textContent = b.dataset.dcdEdit.split('/').pop();
    dlg.showModal();
    load(b.dataset.dcdEdit, b.dataset.url, false);
  });
  function load(path, url, isCreate) {
    var name = path.split('/').pop();
    file = null; err.textContent = ''; sum.textContent = '';
    info.textContent = 'Loading…'; go.disabled = true;
    fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Couldn\'t load the file.');
      return r.text();
    }).then(function (t) {
      var csv = /\.csv$/i.test(name);
      file = parse(t, csv); file.path = path; file.name = name; file.csv = csv; file.ext = csv ? '.csv' : '.dcd';
      if (!file.points) throw new Error(csv ? 'No grain points found (a GRAIN section with names like G01, G01b).'
        : 'No grain points found (names like GR001_G01 or GR001_G01b in the 5th column).');
      info.textContent = file.grains + ' grains, ' + file.points + ' points' +
        (file.maxSubs ? ', up to ' + file.maxSubs + ' sub-grains per grain.' : ', no sub-grains.');
      f.n.max = Math.max(1, file.maxSubs);
      f.n.value = Math.min(2, Math.max(1, file.maxSubs));
      update();
    }).catch(function (x) { info.textContent = ''; err.textContent = x.message; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!file || !(window.GH && GH.canWrite())) return;
    var r = result(), target, ext = create ? '.csv' : file.ext;
    if (create || f.save.value === 'new') {
      var nm = f.fname.value.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
      if (!new RegExp('\\' + ext + '$', 'i').test(nm)) nm += ext;
      if (nm === file.name || existing.indexOf(nm) !== -1) { err.textContent = 'A file called ' + nm + ' already exists. Choose another name, or pick Replace this file.'; return; }
      target = file.path.replace(/[^/]+$/, nm);
    } else target = file.path;
    err.textContent = '';
    go.disabled = true; go.innerHTML = '<span class="spinner"></span> Saving…';
    var what = [r.keepAll ? '' : r.parents ? 'parent grains only' : r.n + ' sub-grain' + (r.n === 1 ? '' : 's') + ' removed per grain',
      r.swap ? 'X and Y swapped' : ''].filter(Boolean).join(', ');
    if (create) what = (f.fmt.value === 'gstar' ? 'GStar' : 'ESL') + ' format from ' + file.name + (what ? ', ' + what : '');
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
