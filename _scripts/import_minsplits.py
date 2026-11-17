"""One-off import of the MU mineral split spreadsheet (MU_Minsplit_DB.xlsx) into sample pages.

    python3 _scripts/import_minsplits.py MU_Minsplit_DB.xlsx

Writes samples/<slug>.md, one page per sample number, with its vials (catalogue number,
mineral, fraction/concentrate…), the spreadsheet's region (Location column) and, when the
sample notes give them, latitude and longitude. The irradiation number is left out on
purpose: it belongs to the mount or slide. EarthBank coordinates, when the sample is in
EarthBank, are matched at build time (_scripts/mount_state.py) and take precedence.
Rows marked "No" in the Drawer? column are left out: that separate is no longer in the drawer
(its vial position has usually been reused), and a sample with only such rows gets no page
(an existing page for it is deleted). Existing sample pages are left alone unless --overwrite is given.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MINERAL = {"Ap": "Apatite", "Zi": "Zircon", "Zr": "Zircon", "Sp": "Titanite"}
PREP = {"Frac": "Fraction", "Conc": "Concentrate", "Mag": "Magnetic", "Non Mag": "Non-magnetic"}


def slug(s):
    return re.sub(r"[^A-Za-z0-9.-]+", "_", s).strip("_")


def split_label(label):
    """'Ap Conc' → ('Apatite', 'Concentrate'); 'Zi,Sp Conc' → ('Zircon + Titanite', 'Concentrate')."""
    label = (label or "").strip()
    if not label:
        return "", ""
    if label == "Ap Frac+Ap Conc":
        return "Apatite", "Fraction + concentrate"
    prep = ""
    for k in sorted(PREP, key=len, reverse=True):
        if label.endswith(" " + k):
            prep, label = PREP[k], label[: -len(k) - 1]
            break
    parts = [p.strip() for p in re.split(r"[,+]", label) if p.strip()]
    if parts and all(p in MINERAL for p in parts):
        return " + ".join(MINERAL[p] for p in parts), prep
    return label, prep


DEG = r"""(~?\s*\d{1,3}(?:\.\d+)?)\s*°\s*(?:(\d{1,2}(?:\.\d+)?)\s*[’'′`]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:[”"″]|[’'′]{2})\s*)?([NSEW])?"""
LABEL = r"(?:\b(lat(?:itude)?|long(?:itude)?)\.?\s*:?\s*)?"


def coords(notes, region):
    """Latitude and longitude written in the notes, e.g. 25°08’29”S 150°12’51”E, 150°40.53’E 22°54.77’S,
    Lat 20.619° Long 141.006°E. Values marked N/S/E/W or Lat/Long are used first; for Australian
    samples, an unmarked pair with minutes (30°56’6.4” 138°20’32.4”) is read as S and E."""
    aus = (region or "").startswith("Australia")
    toks = []
    for m in re.finditer(LABEL + DEG, notes or "", re.I):
        label, d, mi, se, hemi = m.group(1), m.group(2), m.group(3), m.group(4), (m.group(5) or "").upper()
        v = float(d.replace("~", "").strip()) + float(mi or 0) / 60 + float(se or 0) / 3600
        kind = "lat" if hemi in ("N", "S") or (label or "").lower().startswith("lat") else \
               "lon" if hemi in ("E", "W") or (label or "").lower().startswith("lon") else None
        toks.append((kind, v, hemi, mi is not None))
    def finish(lat, lon):
        return (round(lat, 5), round(lon, 5)) if lat is not None and lon is not None else (None, None)
    lat = lon = None
    for kind, v, hemi, _ in toks:   # marked values
        if kind == "lat" and lat is None and v <= 90:
            lat = -v if hemi == "S" or (not hemi and aus) else v
        elif kind == "lon" and lon is None and v <= 180:
            lon = -v if hemi == "W" else v
    if lat is not None and lon is not None:
        return finish(lat, lon)
    if aus:                          # unmarked pair with minutes, read as S then E
        un = [t for t in toks if t[0] is None and t[3]]
        for a, b in zip(un, un[1:]):
            if a[1] <= 45 and 110 <= b[1] <= 160:
                return finish(-a[1], b[1])
    return None, None


def text(v):
    return "" if v is None else str(v).strip()


def page(sid, rec):
    q = lambda v: json.dumps(v, ensure_ascii=False)
    lines = ["---", "layout: sample", "sample_id: " + q(sid), "permalink: " + q("/s/" + slug(sid) + "/"),
             "igsn: " + q(rec["igsn"]), "associated_pids: " + q(rec["pids"]),
             "collected_by: " + q(rec["collected_by"]), "notes: " + q(rec["notes"]),
             "region: " + q(rec["region"]), "lat: " + q(rec["lat"]), "lon: " + q(rec["lon"])]
    if rec["vials"]:
        lines.append("vials:")
        lines += ["  - {" + ", ".join(q(k) + ": " + q(x) for k, x in v.items()) + "}" for v in rec["vials"]]
    else:
        lines.append("vials: []")
    lines += ["---", ""]
    return "\n".join(lines)


def uniq(xs):
    out = []
    for x in xs:
        if x and x not in out:
            out.append(x)
    return out


def main():
    import openpyxl
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    overwrite = "--overwrite" in sys.argv
    wb = openpyxl.load_workbook(args[0], read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    head = [text(h) for h in rows[0]]
    col = {h: i for i, h in enumerate(head)}
    samples, skipped, gone = {}, 0, set()
    for r in rows[1:]:
        sid = text(r[col["Sample Number"]])
        if not sid:
            skipped += 1
            continue
        if text(r[col["Drawer?"]]).lower() == "no":
            gone.add(sid)
            continue
        rec = samples.setdefault(sid, {"rows": []})
        rec["rows"].append(r)
    os.makedirs(os.path.join(ROOT, "samples"), exist_ok=True)
    written = 0
    for sid, rec in samples.items():
        rs = rec["rows"]
        get = lambda name: [text(r[col[name]]) for r in rs]
        pids = uniq(p.strip() for v in get("Registered Number") for p in v.split(","))
        vials = []
        for r in rs:
            cat = text(r[col["Catalogue Number"]])
            label = text(r[col["Mineral Split"]])
            if not cat and not label:
                continue
            mineral, prep = split_label(label)
            v = {"catalogue": cat, "mineral": mineral, "prep": prep}
            if v not in vials:
                vials.append(v)
        out = {"igsn": "", "pids": pids, "collected_by": ", ".join(uniq(get("Collected by"))),
               "notes": "\n\n".join(uniq(n.replace("\r\n", "\n").strip() for n in get("Sample Notes"))),
               "vials": vials, "region": ", ".join(uniq(get("Location")))}
        out["lat"], out["lon"] = coords(out["notes"], out["region"])
        path = os.path.join(ROOT, "samples", slug(sid) + ".md")
        if os.path.exists(path) and not overwrite:
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(page(sid, out))
        written += 1
    removed = 0
    for sid in gone - set(samples):
        path = os.path.join(ROOT, "samples", slug(sid) + ".md")
        if os.path.exists(path):
            os.remove(path)
            removed += 1
    print(f"{len(samples)} samples, {written} pages written, {skipped} rows without a sample number skipped, "
          f"{len(gone)} samples had vials no longer in the drawer, {removed} pages removed")


if __name__ == "__main__":
    main()
