# Sample Mount Catalogue

A website that gives every epoxy sample mount its own page, with a QR code that links to it. Each page holds the mount's details, its samples, map images and data files. The home page lists every mount and has a **New mount** button for adding more.

Everything here is free: GitHub stores the files and GitHub Pages turns them into a website.

> **Note:** On a free GitHub account the website and its files are **public**, so anyone with the link can see them. Don't upload anything that shouldn't be public, such as confidential sample locations.

---

## Part 1: Put the site online (about 10 minutes, once)

### 1. Create a repository
A "repository" (repo) is just a folder on GitHub.

1. Log in at github.com.
2. Click the **+** at the top right, then **New repository**.
3. **Repository name:** type `mounts` (or any short name, all lowercase).
4. Choose **Public**.
5. Leave everything else as it is and click **Create repository**.

### 2. Upload the files
1. On the new repo page, click the link **uploading an existing file**. (If you don't see it, click **Add file → Upload files**.)
2. Unzip the zip file on your computer.
3. Open the unzipped folder, select **everything inside it** (Ctrl+A on Windows, Cmd+A on Mac) and drag it onto the GitHub page. Make sure the folders starting with `_` are included.
4. Wait until all the files are listed, then click the green **Commit changes** button at the bottom.

### 3. Turn on the website
1. In your repo, click **Settings** (the top menu, far right).
2. In the left menu, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose `main` and `/ (root)`, then click **Save**.
5. Wait 1–2 minutes and refresh the page. A box appears at the top saying **"Your site is live at https://YOURNAME.github.io/mounts/"**. Click it.

You should see the catalogue with one example mount, **DEMO**. Click it to see what a mount page looks like.

---

## Part 2: Add a mount (each time you make one)

1. Go to your site's home page and click **+ New mount**.
2. Fill in the form. Only the **Mount ID** is required. Click **Suggest one** to get a short random ID that is not already used.
3. Click **Next**, then **Create page on GitHub**. GitHub opens in a new tab with the page already written.
4. On GitHub, click the green **Commit changes…** button (top right), then **Commit changes** in the pop-up.
5. After 1–2 minutes, refresh your site. The new mount appears in the list.

You need to be logged in to GitHub for step 4. Anyone else looking at the site can browse it but can't add or change anything.

### Add the map and data files
1. Open the mount's page on your site and click **Add files**.
2. Drag in the files: map images (JPG or PNG), CSV files, text files, PDFs and so on.
3. Click **Commit changes**. After 1–2 minutes the page shows them automatically: images in **Maps and images**, everything else in **Data files**. CSV and TXT files get a **Preview** button.

Tips for files:
- **Images:** JPG or PNG. Browsers can't show TIFF files; convert them first. Keep each image under about 5 MB so it loads on phones (GitHub's upload limit is 25 MB per file).
- **File names:** use letters, numbers, hyphens and underscores only, with no spaces, e.g. `map_reflected.jpg`, `grain_data.csv`.
- Don't upload `.md` or `.html` files into a mount folder. The site would try to turn them into pages.

### Change a mount's details
On the mount's page, click **Edit details**. GitHub shows the page's text file. Change what you need between the `---` lines (keep the quote marks), then click **Commit changes**. You can write free notes underneath the second `---` line.

### Delete a file or a mount
On GitHub, open the `mounts` folder and click into the mount's folder. Then click the file, open the **⋯** menu (top right) and choose **Delete file**. A mount disappears once its folder has no files left.

---

## Part 3: QR codes

Each mount page shows a QR code with a **Download QR (SVG)** button. SVG files stay sharp at any size, so they're good for printing small.

At first the QR codes contain the long github.io address, which makes them fairly large (29×29 squares). Once you have your own short domain:

1. Point the domain at the site (Part 4 below).
2. In the repo, open `_config.yml`, click the pencil ✏️ icon, change `qr_base: ""` to `qr_base: "HTTP://XTL.AU"` (your domain, **in capitals**), and commit.
3. The QR codes then shrink to the smallest size, 21×21 squares, for IDs up to about 8 characters.

**Don't print QR codes onto mounts until your final domain is set up**, so they never depend on the github.io address.

The site generates standard QR codes, which every phone camera reads. Micro QR codes are smaller, but most phone cameras can't scan them. Test both on your phones before embedding a batch.

---

## Part 4: Using your own domain later

1. In the repo, open `_config.yml`, set `qr_base` (see Part 3) and commit.
2. Go to **Settings → Pages → Custom domain**, type your domain (e.g. `xtl.au`) and click **Save**.
3. At the company you bought the domain from, add the DNS records GitHub asks for:
   - For a bare domain like `xtl.au`: four **A** records pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`.
   - For a subdomain like `m.xtl.au`: one **CNAME** record, `m` → `YOURNAME.github.io`.
4. Back in **Settings → Pages**, tick **Enforce HTTPS** once it's available (this can take up to an hour).

Mount pages then live at `xtl.au/A7K3`, and the old github.io links redirect there automatically.

---

## If something looks wrong

- **The site has no styling (plain black text):** open `_config.yml` and add a line `baseurl: "/mounts"` (your repo name), then commit.
- **A new mount doesn't appear:** wait a few minutes. To check progress, click the **Actions** tab in the repo. A red ✗ means the build failed, usually because of a typo between the `---` lines of a mount's file, such as a missing quote mark. Click the failed run to see which file it was.
- **Mount IDs:** use capital letters, numbers and hyphens only. Don't rename a mount's folder after printing its QR code, because the folder name is part of the address.

## What's in this folder (for reference)

| File / folder | What it does |
|---|---|
| `_config.yml` | Site settings: title, default affiliation, QR address |
| `index.html` | The home page and mount list |
| `mounts/` | One folder per mount, containing `index.md` (the details) plus its images and data |
| `_layouts/` | Page templates; no need to touch these |
| `_includes/` | The New mount form |
| `assets/` | Styling and scripts |
