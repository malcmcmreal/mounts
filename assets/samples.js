// Mineral Split Database list (and the sample list on each drawer page): search, filter, group,
// select samples for the pull list. Data: assets/samples-index.json (_scripts/mount_state.py).
// Index rows: [slug, sample id, vials, collected by, PIDs, mounts, rock type · age, country, lat, lon]
// with vials [catalogue, mineral, split, amount, position]. With data-drawer="17" on the script tag,
// only samples with vials in drawer 17 are listed, with just those vials.
(function () {
  var me = document.currentScript, base = me.dataset.base || '/', drawer = me.dataset.drawer || '';
  var tbody = document.getElementById('split-rows'), count = document.getElementById('split-count');
  var q = document.getElementById('split-q'), selM = document.getElementById('split-mineral'),
    selP = document.getElementById('split-prep'), mounted = document.getElementById('split-mounted'),
    selG = document.getElementById('split-group'), selJ = document.getElementById('split-project');
  var qLo = document.getElementById('qty-lo'), qHi = document.getElementById('qty-hi'), qUn = document.getElementById('qty-unrated'),
    qOut = document.getElementById('qty-out'), qFill = document.getElementById('qty-fill');
  function amtOn() { return qLo && (+qLo.value > 0 || +qHi.value < 5 || !qUn.checked); }
  var more = document.getElementById('split-more'), allBox = document.getElementById('split-all');
  var addBtn = document.getElementById('split-add');
  var all = [], hits = [], shown = 0, PAGE = 100;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var SHORT = { Apatite: 'Ap', Zircon: 'Zr', Titanite: 'Ti' }, TONE = { Apatite: 'ap', Zircon: 'zr', Titanite: 'ti' };
  function drawerOf(cat) { var m = /^(\d+)/.exec(cat || ''); return m ? String(+m[1]) : ''; }
  function chip(v) {
    var parts = v[1].split(' + '), m = parts.map(function (x) { return SHORT[x] || x; }).join('+');
    var tones = parts.map(function (x) { return TONE[x] || 'other'; });
    return '<span class="vchip m-' + tones[0] + (tones[1] ? ' m2-' + tones[1] : '') + (v[2] === 'Concentrate' ? ' conc' : '') + '" title="' +
      esc(v[1] + (v[2] ? ' ' + v[2].toLowerCase() : '') + (v[3] !== '' && v[3] != null ? ' · amount ' + v[3] + (v[3] === 'missing' ? '' : '/5') : '')) + '">' +
      esc(m) + (v[2] ? ' ' + esc(v[2].replace('Concentrate', 'conc').replace('Fraction', 'frac').toLowerCase()) : '') +
      (v[0] ? '<span class="mono">' + esc(v[0]) + '</span>' : '') + '</span>';
  }
  function row(s) {
    var on = window.PullList && PullList.has(s[0]);
    return '<tr><td class="pick"><input type="checkbox" data-slug="' + esc(s[0]) + '"' + (on ? ' checked' : '') + ' aria-label="Add ' + esc(s[1]) + ' to the pull list"></td>' +
      '<td><a class="mono" href="' + base + 's/' + encodeURIComponent(s[0]) + '/">' + esc(s[1]) + '</a>' + (s[6] ? '<div class="small muted">' + esc(s[6]) + '</div>' : '') + '</td>' +
      '<td><div class="vial-chips">' + s._v.map(chip).join('') + '</div></td>' +
      '<td class="small">' + esc(s[7]) + '</td>' +
      '<td class="small">' + esc(s[3]) + '</td>' +
      '<td>' + s[5].map(function (m) { return '<a class="mono small" href="' + base + encodeURIComponent(m) + '/">' + esc(m) + '</a>'; }).join(' ') + '</td></tr>';
  }
  function norm(s) { return String(s).toLowerCase(); }
  function groupKey(s) {
    var g = selG ? selG.value : '';
    if (g === 'project') return s[10] || 'No project';
    if (g === 'country') return s[7] || 'Country not known';
    if (g === 'collector') return s[3] || 'Collector not known';
    if (g === 'rock') return (s[6].split(' · ')[0]) || 'Rock type not known';
    if (g === 'mineral') {
      var ms = {};
      s._v.forEach(function (v) { ms[v[1].split(' + ')[0] || 'Other'] = 1; });
      return Object.keys(ms).sort().join(' + ') || 'No vials';
    }
    if (g === 'drawer') return 'Drawer ' + (s._v.length ? drawerOf(s._v[0][0]) : '?');
    return '';
  }
  // Does a vial match the Mineral and Split filters? (also used by the drawer grid)
  function vialOk(v) {
    var m = selM.value, p = selP.value;
    if (amtOn()) {
      var lo = +qLo.value, hi = +qHi.value;
      if (typeof v[3] === 'number' ? v[3] < lo || v[3] > hi : !qUn.checked || v[3] === 'missing') return false;
    }
    return (!m || v[1].split(' + ').indexOf(m) !== -1 || (m === 'Other' && !/^(Apatite|Zircon|Titanite)( \+ |$)/.test(v[1]))) && (!p || v[2] === p);
  }
  function filterQuery() {
    var ps = [];
    if (q.value) ps.push('q=' + encodeURIComponent(q.value));
    if (selM.value) ps.push('mineral=' + encodeURIComponent(selM.value));
    if (selP.value) ps.push('split=' + encodeURIComponent(selP.value));
    if (selJ && selJ.value) ps.push('project=' + encodeURIComponent(selJ.value));
    if (mounted && mounted.checked) ps.push('mounted=1');
    if (amtOn()) ps.push('amount=' + qLo.value + '-' + qHi.value + (qUn.checked ? '' : '&unrated=0'));
    return ps;
  }
  function apply() {
    var words = norm(q.value).split(/\s+/).filter(Boolean), m = selM.value, p = selP.value, mo = mounted && mounted.checked, pj = selJ ? selJ.value : '';
    hits = all.filter(function (s) {
      if (mo && !s[5].length) return false;
      if (pj && (pj === '-' ? s[10] : s[10] !== pj)) return false;
      if ((m || p || amtOn()) && !s._v.some(vialOk)) return false;
      return words.every(function (w) { return s._t.indexOf(w) !== -1; });
    });
    if (selG && selG.value) {
      hits.forEach(function (s) { s._g = groupKey(s); });
      var last = function (g) { return /^No |not known$|\?$/.test(g) ? 1 : 0; };
      hits.sort(function (a, b) { return last(a._g) - last(b._g) || a._g.localeCompare(b._g, undefined, { numeric: true }) || a._o - b._o; });
    } else hits.sort(function (a, b) { return a._o - b._o; });
    shown = 0; tbody.innerHTML = ''; page();
    if (!drawer) try {
      var ps = filterQuery();
      if (selG && selG.value) ps.push('group=' + encodeURIComponent(selG.value));
      history.replaceState(null, '', ps.length ? '?' + ps.join('&') : location.pathname);
    } catch (e) {}
    var reset = document.getElementById('split-reset');
    if (reset) reset.hidden = !(filterQuery().length || (selG && selG.value));
    hits.vialOk = vialOk;
    hits.filtered = filterQuery().length > 0;
    hits.query = filterQuery().join('&');
    document.dispatchEvent(new CustomEvent('splits-filtered', { detail: hits }));
  }
  function page() {
    var next = hits.slice(shown, shown + PAGE), html = '', prev = shown ? hits[shown - 1]._g : null;
    next.forEach(function (s) {
      if (selG && selG.value && s._g !== prev) {
        var n = hits.filter(function (x) { return x._g === s._g; }).length;
        html += '<tr class="group-row"><th colspan="6">' + esc(s._g) + ' <span class="muted small">' + n + ' sample' + (n === 1 ? '' : 's') + '</span></th></tr>';
        prev = s._g;
      }
      html += row(s);
    });
    tbody.insertAdjacentHTML('beforeend', html);
    shown += next.length;
    var vials = 0; hits.forEach(function (s) { var u = {}; s._v.forEach(function (v) { u[v[0] || Math.random()] = 1; }); vials += Object.keys(u).length; });
    count.textContent = hits.length.toLocaleString() + ' sample' + (hits.length === 1 ? '' : 's') + ', ' + vials.toLocaleString() + ' vial' + (vials === 1 ? '' : 's') +
      (hits.length > shown ? ' · showing ' + shown.toLocaleString() : '');
    more.hidden = shown >= hits.length;
    syncPicks();
  }
  function syncPicks() {
    if (!window.PullList) return;
    var boxes = tbody.querySelectorAll('input[data-slug]');
    boxes.forEach(function (b) { b.checked = PullList.has(b.dataset.slug); });
    if (allBox) {
      var n = hits.filter(function (s) { return PullList.has(s[0]); }).length;
      allBox.checked = hits.length > 0 && n === hits.length;
      allBox.indeterminate = n > 0 && n < hits.length;
      allBox.title = allBox.checked ? 'Take all ' + hits.length + ' listed samples off the pull list' : 'Add all ' + hits.length + ' listed samples to the pull list';
    }
  }
  tbody.addEventListener('change', function (e) {
    var b = e.target.closest('input[data-slug]');
    if (b && window.PullList) PullList.toggle(b.dataset.slug, b.checked);
  });
  if (allBox) allBox.addEventListener('change', function () {
    if (!window.PullList) return;
    var slugs = hits.map(function (s) { return s[0]; });
    if (allBox.checked) PullList.add(slugs); else PullList.remove(slugs);
  });
  if (window.PullList) PullList.onChange(syncPicks);
  more.addEventListener('click', page);
  var resetBtn = document.getElementById('split-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    q.value = ''; selM.value = ''; selP.value = '';
    if (selJ) selJ.value = ''; if (selG) selG.value = ''; if (mounted) mounted.checked = false;
    if (qLo) { qLo.value = 0; qHi.value = 5; qUn.checked = true; qty(); }
    apply(); q.focus();
  });
  function qty(e) {
    if (+qLo.value > +qHi.value) { if (e && e.target === qLo) qHi.value = qLo.value; else qLo.value = qHi.value; }
    qOut.textContent = qLo.value === qHi.value ? qLo.value : qLo.value + '–' + qHi.value;
    qFill.style.left = (qLo.value * 20) + '%'; qFill.style.right = ((5 - qHi.value) * 20) + '%';
  }
  if (qLo) {
    [qLo, qHi].forEach(function (el) { el.addEventListener('input', function (e) { qty(e); clearTimeout(t); t = setTimeout(apply, 120); }); });
    qUn.addEventListener('change', apply);
    qty();
  }
  var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 120); });
  [selM, selP, mounted, selG, selJ].forEach(function (el) { if (el) el.addEventListener('change', apply); });

  fetch(me.dataset.index, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    all = d.samples;
    if (drawer) {
      all = all.filter(function (s) { return s[2].some(function (v) { return drawerOf(v[0]) === drawer; }); });
      all.forEach(function (s) { s._v = s[2].filter(function (v) { return drawerOf(v[0]) === drawer; }); });
    } else all.forEach(function (s) { s._v = s[2]; });
    var minerals = {}, preps = {};
    all.forEach(function (s) {
      s._t = norm([s[1], s[3], s[4], s[5].join(' '), s[6] || '', s[7] || '', s[10] || ''].concat(s._v.map(function (v) { return v.slice(0, 3).join(' '); })).join(' '));
      s._v.forEach(function (v) {
        v[1].split(' + ').forEach(function (x) { if (x) minerals[/^(Apatite|Zircon|Titanite)$/.test(x) ? x : 'Other'] = 1; });
        if (v[2]) preps[v[2]] = (preps[v[2]] || 0) + 1;
      });
    });
    ['Apatite', 'Zircon', 'Titanite', 'Other'].filter(function (x) { return minerals[x]; }).forEach(function (x) { selM.add(new Option(x, x)); });
    Object.keys(preps).sort(function (a, b) { return preps[b] - preps[a]; }).forEach(function (x) { selP.add(new Option(x, x)); });
    if (drawer) {   // walking order within the drawer: by position
      var key = function (s) { var v = s._v[0] || ['']; var m = /^\d+([A-Z])(\d+)/.exec(v[0]); return m ? m[1] + ('0' + m[2]).slice(-2) : 'z'; };
      all.sort(function (a, b) { return key(a).localeCompare(key(b)); });
    } else all.sort(function (a, b) { return a[1].localeCompare(b[1], undefined, { numeric: true }); });
    all.forEach(function (s, i) { s._o = i; });
    if (selJ) {
      var pjs = {}, none = 0;
      all.forEach(function (s) { if (s[10]) pjs[s[10]] = (pjs[s[10]] || 0) + 1; else none++; });
      Object.keys(pjs).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (x) { selJ.add(new Option(x + ' (' + pjs[x] + ')', x)); });
      if (Object.keys(pjs).length) selJ.add(new Option('No project (' + none + ')', '-'));
      selJ.closest('label').hidden = !Object.keys(pjs).length;
    }
    function param(k) { var r = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search); return r ? decodeURIComponent(r[1].replace(/\+/g, ' ')) : ''; }
    if (param('q')) q.value = param('q');
    if (selG && param('group') && selG.querySelector('option[value="' + param('group') + '"]')) selG.value = param('group');
    function pick(sel, v) { if (sel && v && sel.querySelector('option[value="' + v.replace(/"/g, '') + '"]')) sel.value = v; }
    pick(selM, param('mineral')); pick(selP, param('split'));
    if (mounted && param('mounted')) mounted.checked = true;
    var am = /^(\d)-(\d)$/.exec(param('amount'));
    if (qLo && am) { qLo.value = am[1]; qHi.value = am[2]; qty(); }
    if (qLo && param('unrated') === '0') qUn.checked = false;
    if (selJ && param('project')) { if (!selJ.querySelector('option[value="' + param('project').replace(/"/g, '') + '"]')) selJ.add(new Option(param('project'), param('project'))); selJ.value = param('project'); }
    apply();
    document.dispatchEvent(new CustomEvent('splits-loaded', { detail: { all: d.samples, listed: all } }));
  }).catch(function () { count.textContent = 'The sample list isn\'t available yet. It is made when the site is built.'; });
})();
