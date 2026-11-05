# Setting up "Sign in with GitHub"

Once this is set up, anyone you add to the repository can sign in on the catalogue and save
straight from the site: new mounts, history entries, notes and file uploads, with no trips to GitHub.

It takes about 15 minutes, once. There are three parts:

- **A.** a tiny sign-in service on Cloudflare (free)
- **B.** a GitHub App that lets the site write to this repository
- **C.** connecting the two

You need the address from part A for part B, and the codes from part B for part C, so do them in order.

---

## A. Create the sign-in service (Cloudflare)

1. Go to **dash.cloudflare.com** and sign up (the free plan is plenty).
2. In the left menu open **Compute (Workers)** → **Workers & Pages**, then click **Create**.
3. Choose **Start with Hello World!**. Name it `mounts-signin`, then click **Deploy**.
4. Click **Edit code**. Delete everything in the editor, then paste in the whole of
   [`_signin/worker.js`](worker.js) from this repository. Click **Deploy**.
5. Note the Worker's address, shown at the top. It looks like
   `https://mounts-signin.YOURNAME.workers.dev`.

## B. Create the GitHub App

1. On GitHub, click your profile picture → **Settings** → **Developer settings** (bottom of the left menu)
   → **GitHub Apps** → **New GitHub App**.
2. Fill in:
   - **GitHub App name:** something unique, e.g. `Mount catalogue sign-in (malcmcmreal)`.
     People see this name the first time they sign in.
   - **Homepage URL:** `https://mnts.au`
   - **Callback URL:** your Worker address from A5 with `/callback` on the end, e.g.
     `https://mounts-signin.YOURNAME.workers.dev/callback`
   - **Expire user authorization tokens:** untick. People then stay signed in until they sign out.
   - **Webhook → Active:** untick.
   - **Permissions → Repository permissions → Contents:** choose **Read and write**.
     Leave everything else as it is.
   - **Where can this GitHub App be installed?** **Only on this account**.
3. Click **Create GitHub App**.
4. On the app's page:
   - Copy the **Client ID**.
   - Click **Generate a new client secret** and copy the secret. GitHub only shows it once.
5. In the app's left menu click **Install App** → **Install** → **Only select repositories** → choose
   **mounts** → **Install**.

## C. Connect them

1. Back in Cloudflare, open the `mounts-signin` Worker → **Settings** → **Variables and Secrets** → **Add**:

   | Type   | Name                   | Value                               |
   |--------|------------------------|-------------------------------------|
   | Text   | `GITHUB_CLIENT_ID`     | the Client ID from B4               |
   | Secret | `GITHUB_CLIENT_SECRET` | the client secret from B4           |
   | Text   | `ALLOWED_ORIGINS`      | `https://mnts.au,https://malcmcmreal.github.io` |

   Click **Deploy**. Both addresses are listed so sign-in works whichever one someone opens.
2. In this repository, open `_config.yml` and set `auth_url` to the Worker address, e.g.
   `auth_url: "https://mounts-signin.YOURNAME.workers.dev"`. Commit.

After a minute or two, a **Sign in with GitHub** button appears at the top right of the catalogue.

---

## Letting other people edit

1. In the repository, go to **Settings** → **Collaborators** → **Add people**. Each person needs a free
   GitHub account.
2. They accept the email invitation, then click **Sign in with GitHub** on the catalogue. The first time,
   GitHub asks them to authorise the app.

People who aren't collaborators can still sign in, but they're shown as "view only" and can't save.
Anyone can browse the catalogue without signing in.

## What the sign-in can do

- **What can be changed:** files in this repository only, and only for people who already have write
  access to it. It can't touch anything else on anyone's GitHub account.
- **What the service keeps:** nothing. It swaps GitHub's one-time code for a sign-in and passes it
  back to the catalogue page.
- **Where the sign-in lives:** in that person's browser until they click **Sign out**.
- **Taking access away:** remove someone as a collaborator, or they can revoke the app at
  GitHub → Settings → Applications → **Authorized GitHub Apps**.
