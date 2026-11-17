// Mineral split records: "Edit" on a sample's page and "+ New sample" on the Mineral Split Database page.
// Writes samples/<slug>.md (front matter only, one JSON value per key) in a single commit.
(function () {
  var me = document.currentScript;
  var dataEl = document.getElementById('sample-data');
  var editBtn = document.getElementById('sample-edit-btn'), newBtn = document.getElementById('sample-new-btn');
  if (!editBtn && !newBtn) return;
  var PREPS = ['Concentrate', 'Fraction', 'Magnetic', 'Non-magnetic', 'Fraction + concentrate', ''];

  var dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML =
    '<form method="dialog" novalidate>' +
    '<div class="dialog-head"><h2 id="se-title">Edit sample</h2>' +
    '<button type="button" class="icon-btn" data-close aria-label="Close">&times;</button></div>' +
    '<div class="dialog-body" id="se-body">' +
    '<label>Sample number * <input name="sample_id" class="mono" autocomplete="off"><small class="hint" id="se-id-msg"></small></label>' +
    '<div class="row"><label class="grow">IGSN of the parent rock sample <input name="igsn" class="mono"></label></div>' +
    '<label>Associated PIDs <small class="muted">(registered numbers etc., separated by commas)</small> <input name="pids" class="mono"></label>' +
    '<label>Collected by <input name="collected_by"></label>' +
    '<label>Region <input name="region" placeholder="e.g. Australia-Tas"></label>' +
    '<div class="row"><label class="grow">Rock type <input name="rock_type"></label>' +
    '<label class="grow">Stratigraphic / crystalline age <input name="strat_age"></label></div>' +
    '<div class="row"><label class="grow">Sample type <input name="sample_type" list="se-stypes" placeholder="Outcrop, Subsurface…"></label>' +
    '<label class="grow">Cuttings / core <input name="cuttings_core" list="se-cc"></label></div>' +
    '<div class="row"><label class="grow">Sample depth from (m) <input name="depth_m" class="mono" inputmode="decimal"></label>' +
    '<label class="grow">to (m) <input name="depth_max_m" class="mono" inputmode="decimal" placeholder="optional"></label>' +
    '<label class="grow">Surface elevation (m) <input name="elevation_m" class="mono" inputmode="decimal"></label></div>' +
    '<datalist id="se-stypes"><option value="Outcrop"><option value="Subsurface"></datalist>' +
    '<datalist id="se-cc"><option value="Core"><option value="Cuttings"><option value="Sidewall core"></datalist>' +
    '<div class="row"><label class="grow">Latitude <input name="lat" class="mono" inputmode="decimal" placeholder="-41.8"></label>' +
    '<label class="grow">Longitude <input name="lon" class="mono" inputmode="decimal" placeholder="145.4"></label></div>' +
    '<p class="hint">Decimal degrees, south and west negative. Used for the map when EarthBank has no location.</p>' +
    '<label>Sample and separation notes <textarea name="notes" rows="4"></textarea></label>' +
    '<fieldset class="dl-set"><legend>Vials</legend>' +
    '<div class="vial-rows" id="se-vials"></div>' +
    '<button type="button" class="btn small" id="se-add">+ Add vial</button>' +
    '</fieldset>' +
    '<datalist id="se-minerals"><option value="Apatite"><option value="Zircon"><option value="Titanite"><option value="Apatite + Zircon">' +
    '<option value="Epidote"><option value="Allanite"><option value="Garnet"><option value="Monazite"><option value="Other"></datalist>' +
    '<p class="hint" id="se-signin" hidden>Sign in with GitHub (top right) to save.</p>' +
    '<p class="hint error" id="se-error"></p>' +
    '</div>' +
    '<div class="dialog-body" id="se-done" hidden><div class="saved"><span aria-hidden="true">✓</span>' +
    '<div><strong>Saved.</strong> <span id="se-done-text"></span> It appears on the site in about a minute.</div></div></div>' +
    '<div class="dialog-foot"><button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="submit" class="btn primary" id="se-go">Save</button></div>' +
    '</form>';
  document.body.appendChild(dlg);
  var form = dlg.querySelector('form'), f = form.elements, box = dlg.querySelector('#se-vials');
  var err = dlg.querySelector('#se-error'), go = dlg.querySelector('#se-go'), idMsg = dlg.querySelector('#se-id-msg');
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });

  var current = null;   // the record being edited, or null for a new sample
  var index = null;     // slugs already taken (new samples)

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slug(s) { return s.replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^_+|_+$/g, ''); }
  function addVial(v) {
    v = v || {};
    var div = document.createElement('div');
    div.className = 'vial-row';
    div.innerHTML = '<input data-k="catalogue" class="mono" placeholder="Catalogue number" value="' + esc(v.catalogue) + '">' +
      '<input data-k="mineral" list="se-minerals" placeholder="Mineral" value="' + esc(v.mineral) + '">' +
      '<select data-k="prep">' + PREPS.concat(v.prep && PREPS.indexOf(v.prep) === -1 ? [v.prep] : []).map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === (v.prep || '') ? ' selected' : '') + '>' + (p || '—') + '</option>';
      }).join('') + '</select>' +
      '<button type="button" class="icon-btn" data-del title="Remove this vial" aria-label="Remove this vial">&times;</button>';
    box.appendChild(div);
  }
  box.addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (b) b.closest('.vial-row').remove(); });
  dlg.querySelector('#se-add').addEventListener('click', function () { addVial(); box.lastChild.querySelector('input').focus(); });

  function num(v, max) {
    v = String(v).trim();
    if (!v) return null;
    var n = +v;
    return isNaN(n) || Math.abs(n) > max ? undefined : n;
  }
  function signedIn() { return window.GH && GH.canWrite(); }
  function updateSignin() { dlg.querySelector('#se-signin').hidden = signedIn(); go.disabled = !signedIn(); }
  document.addEventListener('gh-auth', updateSignin);

  function open(rec) {
    current = rec; form.reset(); box.innerHTML = ''; err.textContent = ''; idMsg.textContent = '';
    dlg.querySelector('#se-title').textContent = rec ? 'Edit sample ' + rec.sample_id : 'New sample';
    dlg.querySelector('#se-body').hidden = false; dlg.querySelector('#se-done').hidden = true; go.hidden = false;
    dlg.querySelector('.dialog-foot [data-close]').textContent = 'Cancel';
    f.sample_id.readOnly = !!rec;
    if (rec) {
      f.sample_id.value = rec.sample_id || '';
      idMsg.textContent = 'The sample number can\'t be changed here, because links point to it.';
      f.igsn.value = rec.igsn || '';
      f.pids.value = (rec.associated_pids || []).join(', ');
      f.collected_by.value = rec.collected_by || '';
      f.notes.value = rec.notes || '';
      f.region.value = rec.region || '';
      f.rock_type.value = rec.rock_type || '';
      f.strat_age.value = rec.strat_age || '';
      f.sample_type.value = rec.sample_type || '';
      f.cuttings_core.value = rec.cuttings_core || '';
      f.depth_m.value = rec.depth_m == null ? '' : rec.depth_m;
      f.depth_max_m.value = rec.depth_max_m == null ? '' : rec.depth_max_m;
      f.elevation_m.value = rec.elevation_m == null ? '' : rec.elevation_m;
      f.lat.value = rec.lat == null ? '' : rec.lat;
      f.lon.value = rec.lon == null ? '' : rec.lon;
      (rec.vials || []).forEach(addVial);
    }
    if (!box.children.length) addVial();
    updateSignin();
    dlg.showModal();
    if (!rec) {
      f.sample_id.focus();
      if (!index && me.dataset.index) fetch(me.dataset.index).then(function (r) { return r.json(); }).then(function (d) {
        index = {}; d.samples.forEach(function (s) { index[s[0].toLowerCase()] = s[1]; });
      }).catch(function () {});
    }
  }
  if (editBtn) editBtn.addEventListener('click', function () { open(JSON.parse(dataEl.textContent)); });
  if (newBtn) newBtn.addEventListener('click', function () { open(null); });

  f.sample_id.addEventListener('input', function () {
    if (current) return;
    var s = slug(f.sample_id.value.trim());
    idMsg.textContent = s && index && index[s.toLowerCase()] ? 'Sample ' + index[s.toLowerCase()] + ' already exists. Open its page to add vials.' :
      s ? 'Its page will be /s/' + s : '';
  });

  function build(rec) {
    var q = function (v) { return JSON.stringify(v); };
    var lines = ['---', 'layout: sample', 'sample_id: ' + q(rec.sample_id), 'permalink: ' + q('/s/' + slug(rec.sample_id) + '/'),
      'igsn: ' + q(rec.igsn), 'associated_pids: ' + q(rec.associated_pids), 'collected_by: ' + q(rec.collected_by), 'notes: ' + q(rec.notes),
      'region: ' + q(rec.region), 'lat: ' + q(rec.lat), 'lon: ' + q(rec.lon),
      'rock_type: ' + q(rec.rock_type), 'strat_age: ' + q(rec.strat_age), 'sample_type: ' + q(rec.sample_type),
      'cuttings_core: ' + q(rec.cuttings_core), 'depth_m: ' + q(rec.depth_m), 'depth_max_m: ' + q(rec.depth_max_m), 'elevation_m: ' + q(rec.elevation_m)];
    if (rec.vials.length) { lines.push('vials:'); rec.vials.forEach(function (v) {
      lines.push('  - {' + Object.keys(v).map(function (k) { return q(k) + ': ' + q(v[k]); }).join(', ') + '}');
    }); }
    else lines.push('vials: []');
    return lines.concat(['---', '']).join('\n');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!signedIn()) { updateSignin(); return; }
    var sid = f.sample_id.value.trim(), s = slug(sid);
    if (!sid || !s) { err.textContent = 'Enter the sample number.'; return; }
    if (!current && index && index[s.toLowerCase()]) { err.textContent = 'Sample ' + index[s.toLowerCase()] + ' already exists.'; return; }
    var vials = Array.prototype.map.call(box.querySelectorAll('.vial-row'), function (r) {
      var v = {};
      ['catalogue', 'mineral', 'prep'].forEach(function (k) { v[k] = r.querySelector('[data-k=' + k + ']').value.trim(); });
      return v;
    }).filter(function (v) { return v.catalogue || v.mineral; });
    var rec = { sample_id: sid, igsn: f.igsn.value.trim(),
      associated_pids: f.pids.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      collected_by: f.collected_by.value.trim(), notes: f.notes.value.replace(/\r\n/g, '\n').trim(), vials: vials,
      region: f.region.value.trim(), rock_type: f.rock_type.value.trim(), strat_age: f.strat_age.value.trim(),
      sample_type: f.sample_type.value.trim(), cuttings_core: f.cuttings_core.value.trim(),
      depth_m: num(f.depth_m.value, 20000), depth_max_m: num(f.depth_max_m.value, 20000), elevation_m: num(f.elevation_m.value, 9000), lat: num(f.lat.value, 90), lon: num(f.lon.value, 180) };
    if (rec.lat === undefined || rec.lon === undefined) { err.textContent = 'Latitude and longitude must be numbers in decimal degrees.'; return; }
    if (rec.depth_m === undefined || rec.depth_max_m === undefined || rec.elevation_m === undefined) { err.textContent = 'Depth and elevation must be numbers in metres.'; return; }
    if ((rec.lat === null) !== (rec.lon === null)) { err.textContent = 'Enter both latitude and longitude, or neither.'; return; }
    var path = current ? current.path : 'samples/' + s + '.md';
    err.textContent = '';
    go.disabled = true; go.innerHTML = '<span class="spinner"></span> Saving…';
    var check = current ? Promise.resolve(null) : GH.getFile(path).catch(function () { return null; });
    check.then(function (existing) {
      if (existing) throw new Error('Sample ' + sid + ' already exists.');
      return GH.commit([{ path: path, text: build(rec) }], (current ? 'Edit' : 'Add') + ' sample ' + sid);
    }).then(function () {
      dlg.querySelector('#se-done-text').innerHTML = (current ? 'Updated' : 'Added') + ' sample <span class="mono">' + esc(sid) + '</span> with ' +
        vials.length + ' vial' + (vials.length === 1 ? '' : 's') + '.' +
        (current ? '' : ' Its page: <a href="' + esc((document.querySelector('.site-title') || {}).getAttribute ? document.querySelector('.site-title').getAttribute('href') : '/') + 's/' + esc(s) + '/">mnts.au/s/' + esc(s) + '</a>.');
      dlg.querySelector('#se-body').hidden = true; dlg.querySelector('#se-done').hidden = false; go.hidden = true;
      dlg.querySelector('.dialog-foot [data-close]').textContent = 'Close';
      if (index) index[s.toLowerCase()] = sid;
    }).catch(function (x) { err.textContent = x.message; })
      .then(function () { go.disabled = false; go.textContent = 'Save'; });
  });
})();
