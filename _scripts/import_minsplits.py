"""One-off import of the MU mineral split spreadsheet (MU_Minsplit_DB.xlsx) into sample pages.

    python3 _scripts/import_minsplits.py MU_Minsplit_DB.xlsx

Writes samples/<slug>.md, one page per sample number, with its vials (catalogue number,
mineral, fraction/concentrate…). Location and irradiation number are left out on purpose:
location belongs to the parent sample in EarthBank, irradiation to the mount or slide.
Existing sample pages are left alone unless --overwrite is given.
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


def text(v):
    return "" if v is None else str(v).strip()


def page(sid, rec):
    q = lambda v: json.dumps(v, ensure_ascii=False)
    lines = ["---", "layout: sample", "sample_id: " + q(sid), "permalink: " + q("/samples/" + slug(sid) + "/"),
             "igsn: " + q(rec["igsn"]), "associated_pids: " + q(rec["pids"]),
             "collected_by: " + q(rec["collected_by"]), "notes: " + q(rec["notes"])]
    if rec["vials"]:
        lines.append("vials:")
        lines += ["  - " + q(v) for v in rec["vials"]]
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
    samples, skipped = {}, 0
    for r in rows[1:]:
        sid = text(r[col["Sample Number"]])
        if not sid:
            skipped += 1
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
               "vials": vials}
        path = os.path.join(ROOT, "samples", slug(sid) + ".md")
        if os.path.exists(path) and not overwrite:
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(page(sid, out))
        written += 1
    print(f"{len(samples)} samples, {written} pages written, {skipped} rows without a sample number skipped")


if __name__ == "__main__":
    main()
