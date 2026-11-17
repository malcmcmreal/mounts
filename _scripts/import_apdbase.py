"""Add rock type and stratigraphic/crystalline age from the apatite database (AP_DBASE.xlsx)
to the sample pages made by import_minsplits.py.

    python3 _scripts/import_apdbase.py AP_DBASE.xlsx

Sample numbers are matched loosely (8410-028 = 8410-28, 89AJB01 = 89AJB-01). When two sample
pages match the same number, the one whose vial numbers agree with the database is used.
Only the rock_type and strat_age lines of each page are written; nothing else changes.
"""
import collections, glob, json, os, re, sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def text(v):
    return "" if v is None else str(v).strip()


def skey(s):
    toks = re.findall(r"[A-Za-z]+|\d+", s.lower())
    return "".join((x.lstrip("0") or "0") if x.isdigit() else x for x in toks)


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

    updated = 0
    for key, recs in ap.items():
        cands = pages.get(key, [])
        if len(cands) > 1:
            want = set().union(*(cats(text(r.get("Catalog Numbers?"))) for r in recs))
            cands = [c for c in cands if want & {cnorm(v.get("catalogue") or "") for v in c[2].get("vials") or []}]
        if len(cands) != 1:
            continue
        path, src, fm = cands[0]
        rock = join(text(r.get("Rock Type")) for r in recs)
        age = join(text(r.get("Stratigraphic/Crystalline Age")) for r in recs)
        if not rock and not age:
            continue
        lines = [l for l in src.split("\n") if not l.startswith(("rock_type:", "strat_age:"))]
        at = next(i for i, l in enumerate(lines) if l.startswith("lon:")) + 1
        lines[at:at] = ["rock_type: " + json.dumps(rock, ensure_ascii=False), "strat_age: " + json.dumps(age, ensure_ascii=False)]
        new = "\n".join(lines)
        if new != src:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
            updated += 1
    print(f"{len(ap)} samples in the database, {updated} sample pages given rock type / age")


if __name__ == "__main__":
    main()
