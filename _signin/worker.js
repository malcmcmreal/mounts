// Sign-in service for the Sample Mount Catalogue ("Sign in with GitHub").
//
// GitHub only hands out sign-in tokens to a server that knows the app's secret,
// so this tiny service does that one step. It runs free on Cloudflare Workers.
// It stores nothing: it swaps GitHub's one-time code for a token and passes the
// token straight back to the catalogue page that asked for it.
//
// Settings (Cloudflare → this Worker → Settings → Variables and Secrets):
//   GITHUB_CLIENT_ID      the GitHub App's Client ID
//   GITHUB_CLIENT_SECRET  the GitHub App's client secret (add it as a Secret)
//   ALLOWED_ORIGINS       site addresses allowed to sign in, comma-separated,
//                         e.g. https://malcmcmreal.github.io,https://xtl.au

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

    // 1. The catalogue opens /login in a pop-up; send the person on to GitHub.
    if (url.pathname === "/login") {
      const origin = (url.searchParams.get("origin") || "").replace(/\/$/, "");
      if (!allowed.includes(origin)) return page("This site isn't allowed to use this sign-in service.", 403);
      if (!env.GITHUB_CLIENT_ID) return page("The sign-in service isn't set up yet (no GITHUB_CLIENT_ID).", 500);
      const state = crypto.randomUUID();
      const gh = new URL("https://github.com/login/oauth/authorize");
      gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      gh.searchParams.set("redirect_uri", url.origin + "/callback");
      gh.searchParams.set("state", state);
      return new Response(null, {
        status: 302,
        headers: {
          Location: gh.toString(),
          "Set-Cookie": `mounts_oauth=${state}|${encodeURIComponent(origin)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
          "Cache-Control": "no-store",
        },
      });
    }

    // 2. GitHub sends the person back here with a one-time code.
    if (url.pathname === "/callback") {
      const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)mounts_oauth=([^;]+)/);
      const [state, rawOrigin] = cookie ? cookie[1].split("|") : [];
      const origin = rawOrigin ? decodeURIComponent(rawOrigin) : "";
      if (!state || state !== url.searchParams.get("state") || !allowed.includes(origin)) {
        return page("Sign-in expired or didn't match. Close this window and try again.", 400);
      }
      if (url.searchParams.get("error")) return page("Sign-in was cancelled. You can close this window.", 400);

      // 3. Swap the code for a token (this is the step that needs the secret).
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "mounts-signin" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: url.searchParams.get("code"),
          redirect_uri: url.origin + "/callback",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.access_token) {
        return page("GitHub didn't accept the sign-in" + (data.error_description ? `: ${data.error_description}` : ".") +
          " Close this window and try again.", 400);
      }

      // 4. Hand the token to the catalogue window that opened this pop-up, and only to that site.
      const msg = JSON.stringify({ type: "mounts-signin", token: data.access_token }).replace(/</g, "\\u003c");
      const html = `<!doctype html><meta charset="utf-8"><title>Signed in</title>
<body style="font:16px system-ui;background:#1e1e1e;color:#e8e8ea;padding:2rem">
<p>Signed in. You can close this window.</p>
<script>
  if (window.opener) { window.opener.postMessage(${msg}, ${JSON.stringify(origin)}); window.close(); }
</script></body>`;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": "mounts_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
          "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
        },
      });
    }

    return page("Sign-in service for the Sample Mount Catalogue. Nothing to see here.", 200);
  },
};

function page(text, status) {
  const safe = text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return new Response(`<!doctype html><meta charset="utf-8"><title>Sign in</title>
<body style="font:16px system-ui;background:#1e1e1e;color:#e8e8ea;padding:2rem"><p>${safe}</p></body>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
