// Mineral Split Database page: searchable list of samples and their vials,
// from assets/samples-index.json (written by _scripts/mount_state.py when the site is built).
// Index rows: [slug, sample id, [[catalogue, mineral, split], …], collected by, PIDs, [mounts]]
(function () {
  var me = document.currentScript, base = me.dataset.base || '/';
  var tbody = document.getElementById('split-rows'), count = document.getElementById('split-count');
  var q = document.getElementById('split-q'), selM = document.getElementById('split-mineral'),
    selP = document.getElementById('split-prep'), mounted = document.getElementById('split-mounted');
  var more = document.getElementById('split-more');
  var all = [], hits = [], shown = 0, PAGE = 100;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var SHORT = { Apatite: 'Ap', Zircon: 'Zr', Titanite: 'Ttn' };
  function chip(v) {
    var m = v[1].split(' + ').map(function (x) { return SHORT[x] || x; }).join('+');
    return '<span class="vchip' + (v[2] === 'Concentrate' ? ' conc' : '') + '" title="' + esc(v[1] + (v[2] ? ' ' + v[2].toLowerCase() : '')) + '">' +
      esc(m) + (v[2] ? ' ' + esc(v[2].replace('Concentrate', 'conc').replace('Fraction', 'frac').toLowerCase()) : '') +
      (v[0] ? '<span class="mono">' + esc(v[0]) + '</span>' : '') + '</span>';
  }
  function row(s) {
    return '<tr><td><a class="mono" href="' + base + 'samples/' + encodeURIComponent(s[0]) + '/">' + esc(s[1]) + '</a></td>' +
      '<td><div class="vial-chips">' + s[2].map(chip).join('') + '</div></td>' +
      '<td class="small">' + esc(s[3]) + '</td>' +
      '<td>' + s[5].map(function (m) { return '<a class="mono small" href="' + base + encodeURIComponent(m) + '/">' + esc(m) + '</a>'; }).join(' ') + '</td></tr>';
  }
  function norm(s) { return String(s).toLowerCase(); }
  function apply() {
    var words = norm(q.value).split(/\s+/).filter(Boolean), m = selM.value, p = selP.value, mo = mounted.checked;
    hits = all.filter(function (s) {
      if (mo && !s[5].length) return false;
      if (m || p) {
        var ok = s[2].some(function (v) {
          return (!m || v[1].split(' + ').indexOf(m) !== -1 || (m === 'Other' && !/^(Apatite|Zircon|Titanite)( \+ |$)/.test(v[1]))) && (!p || v[2] === p);
        });
        if (!ok) return false;
      }
      return words.every(function (w) { return s._t.indexOf(w) !== -1; });
    });
    shown = 0; tbody.innerHTML = ''; page();
    try { history.replaceState(null, '', q.value ? '?q=' + encodeURIComponent(q.value) : location.pathname); } catch (e) {}
  }
  function page() {
    var next = hits.slice(shown, shown + PAGE);
    tbody.insertAdjacentHTML('beforeend', next.map(row).join(''));
    shown += next.length;
    var vials = 0; hits.forEach(function (s) { vials += s[2].length; });
    count.textContent = hits.length.toLocaleString() + ' sample' + (hits.length === 1 ? '' : 's') + ', ' + vials.toLocaleString() + ' vials' +
      (hits.length > shown ? ' · showing ' + shown.toLocaleString() : '');
    more.hidden = shown >= hits.length;
  }
  more.addEventListener('click', page);
  var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 120); });
  [selM, selP, mounted].forEach(function (el) { el.addEventListener('change', apply); });

  fetch(me.dataset.index, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    all = d.samples;
    var minerals = {}, preps = {};
    all.forEach(function (s) {
      s._t = norm([s[1], s[3], s[4], s[5].join(' ')].concat(s[2].map(function (v) { return v.join(' '); })).join(' '));
      s[2].forEach(function (v) {
        v[1].split(' + ').forEach(function (x) { if (x) minerals[/^(Apatite|Zircon|Titanite)$/.test(x) ? x : 'Other'] = 1; });
        if (v[2]) preps[v[2]] = (preps[v[2]] || 0) + 1;
      });
    });
    ['Apatite', 'Zircon', 'Titanite', 'Other'].filter(function (x) { return minerals[x]; }).forEach(function (x) { selM.add(new Option(x, x)); });
    Object.keys(preps).sort(function (a, b) { return preps[b] - preps[a]; }).forEach(function (x) { selP.add(new Option(x, x)); });
    all.sort(function (a, b) { return a[1].localeCompare(b[1], undefined, { numeric: true }); });
    var m = /[?&]q=([^&]*)/.exec(location.search);
    if (m) q.value = decodeURIComponent(m[1].replace(/\+/g, ' '));
    apply();
  }).catch(function () { count.textContent = 'The sample list isn\'t available yet. It is made when the site is built.'; });
})();
