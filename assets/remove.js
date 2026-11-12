// Mount page: remove an uploaded photo or file.
// Signed in: deletes it straight from the repository and records it in the mount's history.
// Signed out: opens GitHub's delete page for the file.
(function () {
  var me = document.currentScript;
  var repo = me.dataset.repo, branch = me.dataset.branch || 'main', mountId = me.dataset.mount;
  if (!repo) return;
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-remove-file]');
    if (!b) return;
    e.preventDefault();
    var path = b.dataset.removeFile, name = path.split('/').pop();
    if (!(window.GH && GH.canWrite())) {
      window.open('https://github.com/' + repo + '/delete/' + branch + '/' + path.split('/').map(encodeURIComponent).join('/'), '_blank', 'noopener');
      return;
    }
    if (!window.confirm('Delete ' + name + ' from ' + mountId + '?\n\nIt can still be recovered from the repository history on GitHub.')) return;
    var now = new Date(), by = '';
    try { by = localStorage.getItem('mounts.by') || ''; } catch (x) {}
    if (!by && GH.user) by = GH.user.name || GH.user.login;
    var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var stamp = date.replace(/-/g, '') + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    var entry = 'date: "' + date + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '"\n' +
      (by ? 'by: ' + JSON.stringify(by) + '\n' : '') + 'type: file\nremoved: ' + JSON.stringify(name) + '\n';
    b.disabled = true; b.textContent = 'Deleting…';
    GH.commit([{ path: path, remove: true },
      { path: '_data/log/' + mountId + '/' + stamp + '-file.yml', text: entry }], 'Delete ' + name + ' from ' + mountId)
      .then(function () {
        var item = b.closest('figure, li');
        if (item) { item.classList.add('removed'); item.title = 'Deleted; the page updates in about a minute.'; }
        b.textContent = 'Deleted';
      })
      .catch(function (err) { b.disabled = false; b.textContent = 'Delete'; window.alert(err.message); });
  });
})();
