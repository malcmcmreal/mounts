// "Sign in with GitHub" for the catalogue, and saving straight to the repository.
//
// When _config.yml has an auth_url (the sign-in service), people can sign in with GitHub.
// Anyone with write access to the repository can then save from the site. Without it,
// or when signed out, the forms fall back to opening GitHub as before.
//
// window.GH:
//   GH.enabled             sign-in is configured
//   GH.canWrite()          signed in with write access
//   GH.user                { login, name, avatar_url } or null
//   GH.signIn(), GH.signOut()
//   GH.commit(files, message)   files: [{ path, text } or { path, base64 }] → one commit
//   GH.getFile(path)       → { text, sha } (or null if it doesn't exist)
//   document event "gh-auth" fires when the sign-in state changes
(function () {
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; };
  var AUTH = meta('mounts-auth').replace(/\/$/, '');
  var REPO = meta('mounts-repo'), BRANCH = meta('mounts-branch') || 'main';
  var API = 'https://api.github.com';
  var KEY = 'mounts.github';

  var GH = window.GH = { enabled: !!(AUTH && REPO), user: null, write: false, repo: REPO, branch: BRANCH };

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} }
  var saved = load();
  function token() { return saved && saved.token; }

  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: Object.assign({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token(),
        'X-GitHub-Api-Version': '2022-11-28'
      }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 401) { GH.signOut(); throw new Error('Your GitHub sign-in has expired. Please sign in again.'); }
      if (r.status === 404 && opts.allow404) return null;
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.message || ('GitHub error ' + r.status));
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }

  GH.canWrite = function () { return !!(GH.enabled && token() && GH.write); };

  function changed() { document.dispatchEvent(new CustomEvent('gh-auth')); render(); }

  // Check who is signed in and whether they can write to the repository
  function refresh() {
    if (!token()) { GH.user = null; GH.write = false; changed(); return Promise.resolve(); }
    return Promise.all([api('/user'), api('/repos/' + REPO)]).then(function (res) {
      GH.user = { login: res[0].login, name: res[0].name || res[0].login, avatar_url: res[0].avatar_url };
      GH.write = !!(res[1].permissions && (res[1].permissions.push || res[1].permissions.admin));
      save({ token: token(), user: GH.user, write: GH.write });
      changed();
    }).catch(function () { changed(); });
  }

  GH.signIn = function () {
    return new Promise(function (resolve, reject) {
      var w = 520, h = 680;
      var pop = window.open(AUTH + '/login?origin=' + encodeURIComponent(location.origin), 'mounts-signin',
        'width=' + w + ',height=' + h + ',left=' + (screen.width - w) / 2 + ',top=' + (screen.height - h) / 3);
      if (!pop) { reject(new Error('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.')); return; }
      var authOrigin = new URL(AUTH).origin;
      function onMsg(e) {
        if (e.origin !== authOrigin || !e.data || e.data.type !== 'mounts-signin') return;
        window.removeEventListener('message', onMsg);
        saved = { token: e.data.token };
        save(saved);
        refresh().then(resolve);
      }
      window.addEventListener('message', onMsg);
    });
  };
  GH.signOut = function () { saved = null; save(null); GH.user = null; GH.write = false; changed(); };

  // ---------- reading and writing ----------
  function utf8ToBase64(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  GH.getFile = function (path) {
    return api('/repos/' + REPO + '/contents/' + encodeURI(path) + '?ref=' + BRANCH, { allow404: true })
      .then(function (d) { return d ? { text: base64ToUtf8(d.content || ''), sha: d.sha } : null; });
  };

  // All files in one commit, so the site rebuilds once
  GH.commit = function (files, message, retried) {
    var ref = '/repos/' + REPO + '/git/refs/heads/' + BRANCH;
    var head;
    return api('/repos/' + REPO + '/git/ref/heads/' + BRANCH).then(function (r) {
      head = r.object.sha;
      return api('/repos/' + REPO + '/git/commits/' + head);
    }).then(function (c) {
      return Promise.all(files.map(function (f) {
        return api('/repos/' + REPO + '/git/blobs', { method: 'POST',
          body: { content: f.base64 != null ? f.base64 : utf8ToBase64(f.text), encoding: 'base64' } })
          .then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
      })).then(function (tree) {
        return api('/repos/' + REPO + '/git/trees', { method: 'POST', body: { base_tree: c.tree.sha, tree: tree } });
      });
    }).then(function (t) {
      var who = GH.user ? '\n\nSaved from the catalogue by ' + GH.user.name + ' (@' + GH.user.login + ')' : '';
      return api('/repos/' + REPO + '/git/commits', { method: 'POST',
        body: { message: message + who, tree: t.sha, parents: [head] } });
    }).then(function (c) {
      return api(ref, { method: 'PATCH', body: { sha: c.sha } }).then(function () { return c.sha; });
    }).catch(function (e) {
      // Someone else saved at the same moment: try once more on top of their change
      if (e.status === 422 && !retried) return GH.commit(files, message, true);
      if (e.status === 403 || e.status === 404) {
        throw new Error('GitHub didn\'t allow the save. Ask the catalogue owner to add you as a collaborator on the repository.');
      }
      throw e;
    });
  };
  GH.toBase64 = utf8ToBase64;

  // ---------- header control ----------
  var box;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render() {
    if (!GH.enabled) return;
    box = box || document.getElementById('gh-auth');
    if (!box) return;
    if (!token()) {
      box.innerHTML = '<button type="button" class="btn small" data-gh="in">Sign in with GitHub</button>';
    } else {
      var u = GH.user || (saved && saved.user) || { name: 'Signed in' };
      box.innerHTML = '<details class="menu"><summary class="gh-user">' +
        (u.avatar_url ? '<img src="' + esc(u.avatar_url) + '&s=48" alt="">' : '') +
        '<span>' + esc(u.name) + '</span>' + (GH.write || !GH.user ? '' : ' <span class="tag">view only</span>') +
        '</summary><div class="menu-list">' +
        (GH.write || !GH.user ? '<p class="menu-note">Changes you make are saved straight to the catalogue.</p>'
          : '<p class="menu-note">You can\'t save changes yet. Ask the catalogue owner to add you as a collaborator.</p>') +
        '<button type="button" data-gh="out">Sign out</button></div></details>';
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-gh]');
    if (!b) return;
    if (b.dataset.gh === 'out') GH.signOut();
    else GH.signIn().catch(function (err) { alert(err.message); });
  });

  if (GH.enabled) {
    if (saved && saved.user) { GH.user = saved.user; GH.write = !!saved.write; }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(); refresh(); });
    else { render(); refresh(); }
  }
})();
