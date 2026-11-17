"""Add rock type, stratigraphic/crystalline age, sample type, cuttings/core, depth, surface
elevation and (where missing) latitude/longitude from the fission track database
(AP_DBASE.xlsx or ALL_DBASE.xlsx, same columns) to the sample pages made by import_minsplits.py.

    python3 _scripts/import_apdbase.py AP_DBASE.xlsx [--new MU_Minsplit_DB.xlsx]

Sample numbers are matched loosely (8410-028 = 8410-28, 89AJB01 = 89AJB-01). When two sample
pages match the same number, the one whose vial numbers agree with the database is used.
Only the rock_type and strat_age lines of each page are written; nothing else changes.

With --new, samples in the database that have no page yet get one, if they have vial numbers
that no other page holds, that weren't checked and found missing (_scripts/missing_vials.csv),
that aren't marked "No" in the mineral split sheet and that no other database sample claims.
Vial minerals and splits come from the mineral split sheet's rows for those vial numbers
(rows that had no sample number), otherwise from the database's mineral list.
"""
import collections, glob, json, os, re, sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def text(v):
    return "" if v is None else str(v).strip()


def skey(s):
    toks = re.findall(r"[A-Za-z]+|\d+", s.lower())
    return "".join((x.lstrip("0") or "0") if x.isdigit() else x for x in toks)


def nkey(s):
    """Stricter than skey: keeps separators, drops leading zeros (S1-06 = S1-6, but not S-16)."""
    return re.sub(r"(?<!\d)0+(?=\d)", "", s.strip().lower())


def cnorm(c):
    m = re.fullmatch(r"(\d+)([A-Z])(\d+)", c.upper())
    return f"{int(m.group(1))}{m.group(2)}{int(m.group(3)):02d}" if m else c.upper()


def cats(s):
    out = []
    for part in re.split(r"[,;&/]|\band\b", s or ""):
        part = part.strip().upper().replace(" ", "")
        if not part:
            continue
        m = re.fullmatch(r"(\d+[A-Z])(\d+)-(?:(\d+[A-Z]))?(\d+)", part)
        if m and (not m.group(3) or m.group(3) == m.group(1)) and 0 < int(m.group(4)) - int(m.group(2)) < 40:
            out += [f"{m.group(1)}{n:02d}" for n in range(int(m.group(2)), int(m.group(4)) + 1)]
            continue
        m = re.fullmatch(r"(\d+[A-Z]\d+)-(\d+[A-Z]\d+)", part)
        out += [m.group(1), m.group(2)] if m else [part]
    return {cnorm(c) for c in out}


def join(values):
    out = []
    for v in values:
        if v and v not in out:
            out.append(v)
    return " / ".join(out)


STATES = {"VIC": "Vic", "QLD": "Qld", "TAS": "Tas", "NSW": "NSW", "SA": "SA", "WA": "WA", "NT": "NT", "ACT": "ACT"}
MIN = {"Ap": "Apatite", "Zi": "Zircon", "Zr": "Zircon", "Sp": "Titanite"}


def add_new(ap, pages, minsplit):
    import csv
    import openpyxl
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from import_minsplits import page, slug, split_label
    wb = openpyxl.load_workbook(minsplit, read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    head = [text(h) for h in rows[0]]
    by_cat = collections.defaultdict(list)
    for r in rows[1:]:
        d = dict(zip(head, r))
        if text(d.get("Catalogue Number")):
            by_cat[cnorm(text(d["Catalogue Number"]).replace(" ", ""))].append(d)
    with open(os.path.join(ROOT, "_scripts", "missing_vials.csv"), encoding="utf-8") as f:
        missing = {cnorm(r["Catalogue Number"]) for r in csv.DictReader(f)}
    held = {cnorm((v.get("catalogue") or "").replace(" ", "")) for ps in pages.values() for _, _, fm in ps for v in fm.get("vials") or []}
    claims = collections.Counter(c for recs in ap.values() for c in set().union(*(cats(text(r.get("Catalog Numbers?"))) for r in recs)))
    made = []
    for key, recs in ap.items():
        if key in pages:
            continue
        cs = sorted(set().union(*(cats(text(r.get("Catalog Numbers?"))) for r in recs)))
        good = [c for c in cs if re.fullmatch(r"\d+[A-Z]\d{2}", c) and c not in missing and c not in held and claims[c] == 1
                and not any(text(x.get("Drawer?")).lower() == "no" for x in by_cat.get(c, []))]
        if not good:
            continue
        r0 = recs[0]
        sid = text(r0["SAMPLE NUMBER"])
        listed = [MIN.get(m.strip(), m.strip()) for m in re.split(r"[,/]", text(r0.get("Mineral Splits"))) if m.strip()]
        old = [x for c in good for x in by_cat.get(c, [])]
        vials = []
        for i, c in enumerate(good):
            rows_c = by_cat.get(c, [])
            if rows_c:
                mineral, prep = split_label(text(rows_c[0].get("Mineral Split")))
            else:
                mineral = listed[i] if len(listed) == len(good) else (listed[0] if len(listed) == 1 else "")
                prep = ""
            vials.append({"catalogue": c, "mineral": mineral, "prep": prep})
        lat, lon = r0.get("Lat °"), r0.get("Long °")
        ok = isinstance(lat, (int, float)) and isinstance(lon, (int, float))
        region = next((text(x.get("Location")) for x in old if text(x.get("Location"))), "") or \
            "-".join(x for x in (text(r0.get("Country")), STATES.get(text(r0.get("State")).upper(), text(r0.get("State")))) if x)
        rec = {"igsn": "", "pids": [p for p in [text(r0.get("REGISTERED NUMBER"))] if p and p != sid],
               "collected_by": next((text(x.get("Collected by")) for x in old if text(x.get("Collected by"))), ""),
               "notes": next((text(x.get("Sample Notes")).replace("\r\n", "\n") for x in old if text(x.get("Sample Notes"))), "") or text(r0.get("Comments:")),
               "vials": vials, "region": region,
               "lat": round(-lat if text(r0.get("Lat (S)")).upper() == "S" else lat, 5) if ok else None,
               "lon": round(-lon if text(r0.get("Long (E)")).upper() == "W" else lon, 5) if ok else None}
        path = os.path.join(ROOT, "samples", slug(sid) + ".md")
        if os.path.exists(path):
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(page(sid, rec))
        with open(path, encoding="utf-8") as f:
            src = f.read()
        pages[key].append((path, src, yaml.safe_load(src.split("---")[1])))
        made.append(sid)
    print(f"{len(made)} new sample pages from the database: {', '.join(made)}")


def main():
    import openpyxl
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    head = list(rows[0])
    ap = collections.defaultdict(list)
    for r in rows[1:]:
        d = dict(zip(head, r))
        if text(d.get("SAMPLE NUMBER")):
            ap[skey(text(d["SAMPLE NUMBER"]))].append(d)

    pages = collections.defaultdict(list)
    for path in glob.glob(os.path.join(ROOT, "samples", "*.md")):
        with open(path, encoding="utf-8") as f:
            src = f.read()
        fm = yaml.load(src.split("---")[1], Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
        pages[skey(fm["sample_id"])].append((path, src, fm))

    if "--new" in sys.argv:
        add_new(ap, pages, sys.argv[sys.argv.index("--new") + 1])

    updated = 0
    for key, recs in ap.items():
        cands = pages.get(key, [])
        if len(cands) > 1:
            # several pages match loosely: those sharing a vial number or with the same name
            want = set().union(*(cats(text(r.get("Catalog Numbers?"))) for r in recs))
            names = {nkey(text(r["SAMPLE NUMBER"])) for r in recs}
            cands = [c for c in cands if want & {cnorm(v.get("catalogue") or "") for v in c[2].get("vials") or []}
                     or nkey(text(c[2].get("sample_id"))) in names]
        for path, src, fm in cands:
            if len(cands) == 1 and len(pages.get(key, [])) == 1:
                mine = recs
            else:
                # loosely-equal names (S-16, S1-06; GO-1, GO-01) can be different samples: use the
                # records that share this page's vial numbers, or that have the same name and no vial numbers
                vs = {cnorm(v.get("catalogue") or "") for v in fm.get("vials") or []}
                mine = [r for r in recs if cats(text(r.get("Catalog Numbers?"))) & vs] or \
                    [r for r in recs if nkey(text(r["SAMPLE NUMBER"])) == nkey(text(fm.get("sample_id")))
                     and not cats(text(r.get("Catalog Numbers?")))]
            if mine:
                updated += write_geo(path, src, mine)
    print(f"{len(ap)} samples in the database, {updated} sample pages given rock type / age")


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def write_geo(path, src, recs):
    """Rock type, stratigraphic age and the sampling details (sample type, cuttings/core, depth,
    surface elevation). Latitude and longitude are filled in only where the page has none."""
    first = lambda col: next((text(r.get(col)) for r in recs if text(r.get(col))), "")
    vals = {"rock_type": join(text(r.get("Rock Type")) for r in recs),
            "strat_age": join(text(r.get("Stratigraphic/Crystalline Age")) for r in recs),
            "sample_type": first("Sample Type"), "cuttings_core": first("Cuttings/Core"),
            "depth_m": next((num(r.get("Sample Depth(m)")) for r in recs if num(r.get("Sample Depth(m)")) is not None), None),
            "elevation_m": next((num(r.get("Surface Elev. (m)")) for r in recs if num(r.get("Surface Elev. (m)")) is not None), None)}
    for k in ("depth_m", "elevation_m"):
        if vals[k] is not None and vals[k].is_integer():
            vals[k] = int(vals[k])
    if not any(v not in ("", None) for v in vals.values()):
        return 0
    lines = [l for l in src.split("\n") if not l.startswith(tuple(k + ":" for k in vals))]
    lat_i = next(i for i, l in enumerate(lines) if l.startswith("lat:"))
    lon_i = next(i for i, l in enumerate(lines) if l.startswith("lon:"))
    if lines[lat_i].strip() == "lat: null" or lines[lon_i].strip() == "lon: null":
        r = next((r for r in recs if num(r.get("Lat °")) is not None and num(r.get("Long °")) is not None), None)
        if r:
            la, lo = num(r["Lat °"]), num(r["Long °"])
            la = -la if text(r.get("Lat (S)")).upper() == "S" else la
            lo = -lo if text(r.get("Long (E)")).upper() == "W" else lo
            lines[lat_i], lines[lon_i] = "lat: " + json.dumps(round(la, 5)), "lon: " + json.dumps(round(lo, 5))
    lines[lon_i + 1:lon_i + 1] = [k + ": " + json.dumps(v, ensure_ascii=False) for k, v in vals.items()]
    new = "\n".join(lines)
    if new == src:
        return 0
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    return 1


if __name__ == "__main__":
    main()
