// Tag many samples with a project at once (pull list page and sample map). Rewrites the project
// line of each samples/<slug>.md, all in one commit. ProjectTag.open(slugs, projects)
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML = '<form method="dialog" novalidate><div class="dialog-head"><h2>Set project</h2><button type="button" class="icon-btn" data-close aria-label="Close">&times;</button></div>' +
    '<div class="dialog-body" id="pt-body"><p id="pt-what"></p>' +
    '<label>Project <input name="project" list="pt-projects" autocomplete="off" placeholder="e.g. GRACE"></label><datalist id="pt-projects"></datalist>' +
    '<p class="hint">Replaces any project these samples already have. Leave it empty to take the project off them.</p>' +
    '<p class="hint" id="pt-signin" hidden>Sign in with GitHub (top right) to save.</p><p class="hint error" id="pt-error"></p></div>' +
    '<div class="dialog-body" id="pt-done" hidden><div class="saved"><span aria-hidden="true">✓</span><div><strong>Saved.</strong> <span id="pt-done-text"></span> It appears on the site in a few minutes, after the rebuild.</div></div></div>' +
    '<div class="dialog-foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary" id="pt-go">Save</button></div></form>';
  function ready() { document.body.appendChild(dlg); }
  if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready);
  var form = dlg.querySelector('form'), go = dlg.querySelector('#pt-go'), err = dlg.querySelector('#pt-error'), slugs = [];
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
  function can() { return window.GH && GH.canWrite(); }
  function upd() { dlg.querySelector('#pt-signin').hidden = can(); go.disabled = !can(); }
  document.addEventListener('gh-auth', upd);

  function setLine(text, project) {
    var m = /^---\s*\n([\s\S]*?)\n---/.exec(text);
    if (!m) throw new Error('unexpected file layout');
    var head = m[1].split('\n').filter(function (l) { return !/^project:/.test(l); });
    var at = head.findIndex(function (l) { return /^collected_by:/.test(l); });
    head.splice(at === -1 ? head.length : at + 1, 0, 'project: ' + JSON.stringify(project));
    return '---\n' + head.join('\n') + '\n---' + text.slice(m[0].length);
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can()) { upd(); return; }
    var project = form.elements.project.value.trim(), done = 0, files = [];
    err.textContent = ''; go.disabled = true;
    var queue = slugs.slice();
    function worker() {
      var slug = queue.shift();
      if (!slug) return Promise.resolve();
      var path = 'samples/' + slug + '.md';
      return GH.getFile(path).then(function (f) {
        if (f) files.push({ path: path, text: setLine(f.text, project), inline: true });
        done++; go.innerHTML = '<span class="spinner"></span> Reading ' + done + ' / ' + slugs.length;
      }).then(worker);
    }
    var ws = []; for (var i = 0; i < 6; i++) ws.push(worker());
    Promise.all(ws).then(function () {
      if (!files.length) throw new Error('None of these samples could be read.');
      go.innerHTML = '<span class="spinner"></span> Saving…';
      return GH.commit(files, (project ? 'Set project "' + project + '" on ' : 'Remove project from ') + files.length + ' sample' + (files.length === 1 ? '' : 's'));
    }).then(function () {
      dlg.querySelector('#pt-done-text').innerHTML = (project ? 'Tagged ' + files.length + ' sample' + (files.length === 1 ? '' : 's') + ' with <strong>' + esc(project) + '</strong>.' :
        'Took the project off ' + files.length + ' sample' + (files.length === 1 ? '' : 's') + '.');
      dlg.querySelector('#pt-body').hidden = true; dlg.querySelector('#pt-done').hidden = false; go.hidden = true;
      dlg.querySelector('.dialog-foot [data-close]').textContent = 'Close';
    }).catch(function (x) { err.textContent = x.message; }).then(function () { go.disabled = false; go.textContent = 'Save'; });
  });
  window.ProjectTag = {
    open: function (list, projects) {
      slugs = list.slice(); form.reset();
      dlg.querySelector('#pt-what').innerHTML = 'Set the project for <strong>' + slugs.length + '</strong> sample' + (slugs.length === 1 ? '' : 's') + '.';
      dlg.querySelector('#pt-projects').innerHTML = (projects || []).map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
      dlg.querySelector('#pt-body').hidden = false; dlg.querySelector('#pt-done').hidden = true; go.hidden = false;
      dlg.querySelector('.dialog-foot [data-close]').textContent = 'Cancel';
      upd(); dlg.showModal(); form.elements.project.focus();
    }
  };
})();
