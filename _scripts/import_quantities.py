"""Add the hand-checked apatite quantities (Detailed_info_Ap_Combined.xlsx, sheet "Merged") to the
vials on the sample pages.

    python3 _scripts/import_quantities.py Detailed_info_Ap_Combined.xlsx

Each apatite concentrate and fraction vial checked by eye was given a rating from 0 (empty) to
5 (full), or "missing" when the vial wasn't there. The rating is stored on the vial as "qty".
Vials are matched by catalogue number; when the sheet rates one vial twice (under two spellings of
the sample name), the row whose sample name matches the page is used.
"""
import glob, json, os, re, sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cnorm(c):
    m = re.fullmatch(r"(\d+)([A-Z])(\d+)", str(c or "").upper().replace(" ", ""))
    return f"{int(m.group(1))}{m.group(2)}{int(m.group(3)):02d}" if m else None


def skey(s):
    return "".join((x.lstrip("0") or "0") if x.isdigit() else x for x in re.findall(r"[a-z]+|\d+", str(s).lower()))


def main():
    import openpyxl
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    rows = list(wb["Merged"].iter_rows(values_only=True))
    head = list(rows[0])
    rated = {}
    for r in rows[1:]:
        d = dict(zip(head, r))
        for vid, qt in (("Ap Conc Vial ID", "Ap Conc Quantity"), ("Ap Frac Vial ID", "Ap Frac Quantity")):
            c, q = cnorm(d.get(vid)), d.get(qt)
            if not c or q in (None, ""):
                continue
            if isinstance(q, str):
                q = "missing" if q.strip().lower() == "missing" else None
            elif isinstance(q, (int, float)) and 0 <= q <= 5:
                q = int(q) if float(q).is_integer() else q
            else:
                q = None
            if q is not None:
                rated.setdefault(c, []).append((str(d.get("Sample ID") or "").strip(), q))
    updated = vials = 0
    for path in glob.glob(os.path.join(ROOT, "samples", "*.md")):
        with open(path, encoding="utf-8") as f:
            src = f.read()
        fm = yaml.load(src.split("---")[1], Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
        sid, changed, out = fm["sample_id"], False, []
        for line in src.split("\n"):
            m = re.match(r"  - (\{.*\})$", line)
            if m:
                v = json.loads(m.group(1))
                hits = rated.get(cnorm(v.get("catalogue")))
                if hits:
                    best = next((q for n, q in hits if n.lower() == sid.lower()), None)
                    if best is None:
                        best = next((q for n, q in hits if skey(n) == skey(sid)), hits[0][1])
                    if v.get("qty") != best:
                        v["qty"] = best
                        changed = True
                    vials += 1
                    line = "  - {" + ", ".join(json.dumps(k) + ": " + json.dumps(x, ensure_ascii=False) for k, x in v.items()) + "}"
            out.append(line)
        if changed:
            with open(path, "w", encoding="utf-8") as f:
                f.write("\n".join(out))
            updated += 1
    print(f"{len(rated)} vials rated in the sheet, {vials} found on the site, {updated} sample pages updated")


if __name__ == "__main__":
    main()
