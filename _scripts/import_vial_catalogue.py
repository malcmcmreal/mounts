"""Add vials from the Australian vial catalogue (Australian_Vial_Catalogue.xlsx) to the sample pages.

    python3 _scripts/import_vial_catalogue.py Australian_Vial_Catalogue.xlsx

- Vials not yet on the site are added: to the sample's page when it has one, otherwise to a new
  page. Vial positions now held by a different sample are left alone (the lab check decided those).
- "Andy's Notes" are kept on the matching vial as its note.
- "Quality (0-5)" fills a vial's amount only where it has none: the hand-checked sheet
  (import_quantities.py) stays the reference where both rate a vial.
"""
import glob, json, os, re, sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_minsplits import page, slug, split_label  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGION = {"Malawi": "Africa-Malawi", "NSW": "Australia-NSW", "South Australia": "Australia-SA"}


def text(v):
    return "" if v is None else str(v).strip()


def cnorm(c):
    m = re.fullmatch(r"(\d+)([A-Z])(\d+)", str(c or "").upper().replace(" ", ""))
    return f"{int(m.group(1))}{m.group(2)}{int(m.group(3)):02d}" if m else None


def tok(n):
    return tuple((x.lstrip("0") or "0") if x.isdigit() else x for x in re.findall(r"[a-z]+|\d+", str(n).lower()))


def vline(v):
    return "  - {" + ", ".join(json.dumps(k) + ": " + json.dumps(x, ensure_ascii=False) for k, x in v.items()) + "}"


def main():
    import openpyxl
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    head = list(rows[0])
    sheet = [dict(zip(head, r)) for r in rows[1:] if r and r[0]]

    pages, held = {}, {}
    for path in glob.glob(os.path.join(ROOT, "samples", "*.md")):
        with open(path, encoding="utf-8") as f:
            src = f.read()
        fm = yaml.load(src.split("---")[1], Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
        pages[path] = fm
        for v in fm.get("vials") or []:
            c = cnorm(v.get("catalogue"))
            if c:
                held[c] = path
    by_name = {}
    for path, fm in pages.items():
        by_name.setdefault(text(fm["sample_id"]).lower(), path)
        by_name.setdefault(tok(fm["sample_id"]), path)

    edits = {}       # path -> list of (catalogue, changes dict) for existing vials
    adds = {}        # path or new sample id -> list of new vials
    newinfo = {}
    for a in sheet:
        c, sid = cnorm(a.get("Location ID")), text(a.get("Sample ID"))
        if not c or not sid:
            continue
        q = a.get("Quality (0-5)")
        q = int(q) if isinstance(q, (int, float)) and 0 <= q <= 5 else None
        note = text(a.get("Andy's Notes"))
        if c in held:
            if tok(pages[held[c]]["sample_id"]) == tok(sid):
                edits.setdefault(held[c], []).append((c, q, note))
            continue
        mineral, prep = split_label(text(a.get("Mineral Split")))
        v = {"catalogue": c, "mineral": mineral, "prep": prep}
        if q is not None:
            v["qty"] = q
        if note:
            v["note"] = note
        target = by_name.get(sid.lower()) or by_name.get(tok(sid)) or sid
        adds.setdefault(target, []).append(v)
        held[c] = target
        if target == sid:
            newinfo.setdefault(sid, a)

    changed = 0
    for path in set(edits) | {t for t in adds if t in pages}:
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        ed = {c: (q, n) for c, q, n in edits.get(path, [])}
        out = []
        for line in lines:
            m = re.match(r"  - (\{.*\})$", line)
            if m:
                v = json.loads(m.group(1))
                c = cnorm(v.get("catalogue"))
                if c in ed:
                    q, n = ed[c]
                    if q is not None and "qty" not in v:
                        v["qty"] = q
                    if n and not v.get("note"):
                        v["note"] = n
                    line = vline(v)
            out.append(line)
        if path in adds:
            if "vials: []" in out:
                out[out.index("vials: []")] = "vials:"
            end = len(out) - 1 - out[::-1].index("---")
            out[end:end] = [vline(v) for v in sorted(adds[path], key=lambda v: v["catalogue"])]
        new = "\n".join(out)
        if new != "\n".join(lines):
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
            changed += 1
    made = 0
    for sid, a in newinfo.items():
        path = os.path.join(ROOT, "samples", slug(sid) + ".md")
        rec = {"igsn": "", "pids": [], "collected_by": text(a.get("Collected by")),
               "notes": text(a.get("Sample Notes")).replace("\r\n", "\n"),
               "vials": sorted(adds[sid], key=lambda v: v["catalogue"]),
               "region": REGION.get(text(a.get("Location")), text(a.get("Location"))), "lat": None, "lon": None}
        with open(path, "w", encoding="utf-8") as f:
            f.write(page(sid, rec))
        made += 1
    print(f"{len(sheet)} vials in the sheet; {sum(len(v) for v in adds.values())} vials added; "
          f"{changed} pages updated, {made} new pages")


if __name__ == "__main__":
    main()
