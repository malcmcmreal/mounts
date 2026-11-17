"""Tag sample pages with a project from a sheet (Detailed_info_Ap_Combined.xlsx, sheet "Merged",
column "Project").

    python3 _scripts/import_projects.py Detailed_info_Ap_Combined.xlsx [--dry-run]

Rows are matched to sample pages by their apatite vial catalogue numbers (Ap Conc / Ap Frac Vial
ID, then the Catalog Numbers list), and by sample name when no vial matches. Only the "project"
line of each page's front matter changes. Rows with no project are left alone.
"""
import glob, json, os, re, sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cnorm(c):
    m = re.fullmatch(r"(\d+)([A-Z])(\d+)", str(c or "").upper().replace(" ", ""))
    return f"{int(m.group(1))}{m.group(2)}{int(m.group(3)):02d}" if m else None


def skey(s):
    return "".join((x.lstrip("0") or "0") if x.isdigit() else x for x in re.findall(r"[a-z]+|\d+", str(s).lower()))


def catalogue_list(s):
    """'26E30, 26E31' or '29J26-29J28' → normalised catalogue numbers."""
    out = []
    for part in re.split(r"[,;/&\s]+(?![^-]*$)|,\s*", str(s or "")):
        part = part.strip().upper()
        m = re.fullmatch(r"(\d+)([A-Z])(\d+)\s*-\s*(?:(\d+)([A-Z]))?(\d+)", part)
        if m and (not m.group(5) or m.group(5) == m.group(2)):
            for n in range(int(m.group(3)), int(m.group(6)) + 1):
                out.append(f"{int(m.group(1))}{m.group(2)}{n:02d}")
        elif cnorm(part):
            out.append(cnorm(part))
    return out


def set_project(text, project):
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    head = [l for l in m.group(1).split("\n") if not l.startswith("project:")]
    at = next((i for i, l in enumerate(head) if l.startswith("collected_by:")), len(head) - 1)
    head.insert(at + 1, "project: " + json.dumps(project, ensure_ascii=False))
    return "---\n" + "\n".join(head) + "\n---" + text[m.end():]


def main():
    import openpyxl
    dry = "--dry-run" in sys.argv
    loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
    by_vial, by_key, pages = {}, {}, {}
    for path in glob.glob(os.path.join(ROOT, "samples", "*.md")):
        slug = os.path.basename(path)[:-3]
        text = open(path, encoding="utf-8").read()
        d = yaml.load(re.match(r"^---\s*\n(.*?)\n---", text, re.S).group(1), Loader=loader) or {}
        pages[slug] = (path, text, str(d.get("sample_id") or slug), str(d.get("project") or ""))
        by_key.setdefault(skey(d.get("sample_id") or slug), set()).add(slug)
        for v in d.get("vials") or []:
            c = cnorm(v.get("catalogue"))
            if c:
                by_vial.setdefault(c, set()).add(slug)
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    rows = list(wb["Merged"].iter_rows(values_only=True))
    head = list(rows[0])
    want, unmatched, how = {}, [], {"vial": 0, "name": 0}
    for r in rows[1:]:
        d = dict(zip(head, r))
        project = str(d.get("Project") or "").strip()
        if not project:
            continue
        sid = str(d.get("Sample ID") or "").strip()
        cats = [c for c in (cnorm(d.get("Ap Conc Vial ID")), cnorm(d.get("Ap Frac Vial ID"))) if c] or catalogue_list(d.get("Catalog Numbers?"))
        hit = set()
        for c in cats:
            hit |= by_vial.get(c, set())
        if len(hit) > 1:   # a vial shared by two spellings of the name: keep the one whose name matches
            hit = {s for s in hit if skey(pages[s][2]) == skey(sid)} or hit
        if hit:
            how["vial"] += 1
        else:
            hit = by_key.get(skey(sid), set())
            if hit:
                how["name"] += 1
        if not hit:
            unmatched.append((sid, ", ".join(cats)))
            continue
        for s in hit:
            want[s] = project
    changed = 0
    for slug, project in sorted(want.items()):
        path, text, sid, cur = pages[slug]
        if cur == project:
            continue
        changed += 1
        if not dry:
            with open(path, "w", encoding="utf-8") as f:
                f.write(set_project(text, project))
    print(f"{len(want)} sample pages tagged ({how['vial']} rows matched by vial, {how['name']} by name), {changed} changed")
    if unmatched:
        print(f"{len(unmatched)} rows not found on the site:")
        for sid, cats in unmatched:
            print(f"  {sid}  {cats}")


if __name__ == "__main__":
    main()
