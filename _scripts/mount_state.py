#!/usr/bin/env python3
"""Work out each mount's current state from its original page plus its timeline entries.

A mount's page file (mounts/<ID>/index.md) is written once, when the mount is created.
Everything that happens later is a separate dated entry file in _data/log/<ID>/, e.g.

    date: "2027-02-02 14:30"
    by: "M. McMillan"
    type: sample            # sample | prep | analysis | location | detail | details | hires | layout | note
    sample: "EX-002"        # sample entries: the sample's current ID
    id: "MM26-02"           #   optional new ID (rename); new: true adds a sample
    earthbank: 748265       #   optional EarthBank link (unlink: true removes it)
    note: "optional free text"

This script (run before the site is built) applies the entries in date order and writes
_data/mountstate.json: the current samples and details for each mount, plus its timeline.
"""
import glob
import json
import os
import re

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREP_FIELDS = {"polish": "polish", "etch": "etch", "coat": "coating"}


def text(v):
    return "" if v is None else str(v).strip()


def front_matter(path):
    with open(path, encoding="utf-8") as f:
        t = f.read()
    m = re.match(r"^---\s*\n(.*?)\n---", t, re.S)
    return (yaml.safe_load(m.group(1)) or {}) if m else {}


def load_entries(mount_id):
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, "_data", "log", mount_id, "*.yml"))):
        try:
            with open(path, encoding="utf-8") as f:
                e = yaml.safe_load(f) or {}
        except Exception as err:  # a broken entry shouldn't stop the site building
            print(f"skipping {path}: {err}")
            continue
        if not isinstance(e, dict):
            continue
        e["date"] = text(e.get("date")).replace("T", " ")[:16]
        e["_file"] = os.path.relpath(path, ROOT)
        out.append(e)
    out.sort(key=lambda e: (e["date"], e["_file"]))
    return out


DETAIL_FIELDS = ["project", "year", "created_by", "affiliation", "mount_format", "resin", "minerals",
                 "polish", "etch", "coating", "storage", "irradiation", "irr_glass", "irr_notes"]
DETAIL_LABELS = {"project": "Project", "year": "Year made", "created_by": "Made by", "affiliation": "Affiliation",
                 "mount_format": "Mount format", "resin": "Resin / epoxy", "minerals": "Minerals",
                 "polish": "Polish", "etch": "Etching", "coating": "Coating", "storage": "Stored at",
                 "irradiation": "Irradiation batch", "irr_glass": "Standard glass", "irr_notes": "Irradiation notes"}


def describe(e):
    """One-line summary for the timeline."""
    t, s = e.get("type"), text(e.get("sample"))
    if t == "sample":
        new_id = text(e.get("id"))
        if e.get("new"):
            parts = [f"Sample {new_id or s} added"]
        else:
            parts = [f"{s} renamed to {new_id}" if new_id and new_id != s else s]
        if text(e.get("position")):
            parts.append(f"position: {text(e.get('position'))}")
        if e.get("separates") is not None:
            parts.append(f"separates: {text(e.get('separates'))}" if text(e.get("separates")) else "separates location cleared")
        if e.get("earthbank"):
            parts.append(f"linked to EarthBank sample {e.get('earthbank')}")
        if e.get("unlink"):
            parts.append("EarthBank link removed")
        return "; ".join(parts)
    if t == "link":
        return f"{s} linked to EarthBank sample {e.get('earthbank')}"
    if t == "unlink":
        return f"{s} unlinked from EarthBank"
    if t == "add-sample":
        pos = text(e.get("position"))
        return f"Sample {s} added" + (f" ({pos})" if pos else "")
    if t == "remove-sample":
        return f"Sample {s} removed"
    if t == "prep":
        step = {"polish": "Polished", "etch": "Etched", "coat": "Coated"}.get(
            text(e.get("step")).lower(), "Preparation")
        d = text(e.get("detail"))
        return f"{step}: {d}" if d else step
    if t == "analysis":
        bits = [text(e.get("technique")) or "Analysis", text(e.get("instrument"))]
        line = ", ".join(b for b in bits if b)
        if text(e.get("samples")):
            line += f" — {text(e.get('samples'))}"
        return line
    if t == "location":
        return f"Moved to {text(e.get('storage'))}"
    if t == "detail":
        f = text(e.get("field"))
        return f"{DETAIL_LABELS.get(f, f)} set to {text(e.get('value'))}"
    if t == "details":
        changes = e.get("set") if isinstance(e.get("set"), dict) else {}
        return "; ".join(f"{DETAIL_LABELS.get(k, k)} set to {text(v)}" for k, v in changes.items()
                         if k in DETAIL_FIELDS) or "Details updated"
    if t == "hires" and not text(e.get("file")):
        what = text(e.get("label")) or text(e.get("url"))
        return f"Download link removed: {what}" if e.get("remove") else f"Download link added: {what}"
    if t == "hires":
        f = text(e.get("file"))
        return f"Hi-res link removed for {f}" if not text(e.get("url")) else f"Hi-res download linked for {f}"
    if t == "file":
        return f"File deleted: {text(e.get('removed'))}"
    if t == "layout":
        return "Mount layout drawn" if e.get("_first_layout") else "Mount layout updated"
    if t == "note":
        return "Note added"
    return t or "Entry"


def read_grains(mount_dir, default=None):
    """Grain coordinate file (mounts/<ID>/grains/*.csv or *.dcd, TrackWorks export): a COORDINATION section
    with the three fiducials (First, Second, Third) and a GRAIN section (G01, G02…), as name,X,Y,Z
    in stage coordinates (µm); GStar (Y,X,Z,name) and ESL (X,Y,Z,Name,Type) exports are read too. Every file with both sections is listed, newest upload first;
    the page shows the newest unless the viewer picks another."""
    import csv, subprocess
    found = []
    paths = [p for p in glob.glob(os.path.join(mount_dir, "grains", "*")) if p.lower().endswith((".csv", ".dcd"))]
    for path in sorted(paths):
        fids, points, section, cols = [], [], None, None
        try:
            with open(path, encoding="utf-8-sig", errors="replace") as fh:
                for row in csv.reader(fh):
                    row = [c.strip() for c in row]
                    if not row or not row[0]:
                        section = None if not any(row) else section
                        continue
                    head = row[0].upper()
                    up = [c.upper() for c in row]
                    # GStar ("Y,X,Z," then "Y,X,Z,GRAIN") and ESL ("X,Y,Z,Name,Type") headers
                    if len(up) >= 3 and up[0] in ("X", "Y") and up[1] in ("X", "Y") and up[0] != up[1]:
                        cols = {"x": up.index("X"), "y": up.index("Y")}
                        if "TYPE" in up:
                            cols.update(name=up.index("NAME") if "NAME" in up else 3, type=up.index("TYPE"))
                            section = "esl"
                        else:
                            cols["name"] = 3
                            section = "grain" if len(up) > 3 and up[3] in ("GRAIN", "GRAINS") else "fid"
                        continue
                    if cols and section in ("esl", "fid", "grain") and len(row) > max(cols.values()):
                        try:
                            x, y = float(row[cols["x"]]), float(row[cols["y"]])
                        except ValueError:
                            continue
                        sec = section
                        if sec == "esl":
                            sec = "fid" if row[cols["type"]].lower().startswith("ref") else "grain"
                        (fids if sec == "fid" else points).append([row[cols["name"]], round(x, 2), round(y, 2)])
                        continue
                    if head in ("COORDINATION", "COORDINATES", "FIDUCIALS"):
                        section = "fid"; continue
                    if head in ("GRAIN", "GRAINS", "POINT", "POINTS"):
                        section = "grain"; continue
                    if section and len(row) >= 3:
                        try:
                            x, y = float(row[1]), float(row[2])
                        except ValueError:
                            continue
                        (fids if section == "fid" else points).append([row[0], round(x, 2), round(y, 2)])
        except OSError:
            continue
        if len(fids) >= 3 and points:
            added = 0
            try:   # when the file was uploaded (committed); file time if there's no git history
                out = subprocess.run(["git", "log", "-1", "--format=%ct", "--", path], cwd=ROOT,
                                     capture_output=True, text=True, timeout=20).stdout.strip()
                added = int(out) if out else 0
            except Exception:
                pass
            added = added or int(os.path.getmtime(path))
            found.append({"file": os.path.basename(path), "added": added, "fids": fids[:3], "points": points})
    found.sort(key=lambda g: (-g["added"], g["file"]))
    # a mount can name the file to show first (front matter grain_default); otherwise newest first
    if default:
        found.sort(key=lambda g: g["file"].lower() != str(default).strip().lower())
    return {"files": found} if found else None


def sample_slug(s):
    return re.sub(r"[^A-Za-z0-9.-]+", "_", s).strip("_")


# EarthBank data packages checked (Nov 2026) to hold the same physical samples as the archive,
# under the same names. Central Asia thermochronology compilation: same names, different samples.
ALSO_IN = ("phanerozoic thermochronology record of afro-arabia", "hallberg yilgarn geochemistry",
           "canadian thermochronology (catch) database")


TRAY_ROWS = "ABCDEFGHIJKLMN"


def tray_positions(codes):
    """Where each vial sits in its tray. A catalogue number is tray, row letter, column (17B05).
    Trays have rows A–N (A at the bottom) and columns 01–36 (01 at the left). Typos that skip a
    row letter, or skip a column number and so run past 36, are read as the next position:
    a missing letter between letters in use closes up, and in a row numbered past the tray's
    width the numbers in use are counted in order."""
    rows = {}
    for c in codes:
        m = re.fullmatch(r"(\d+)([A-Z])(\d+)", c)
        if m:
            rows.setdefault(m.group(1), {}).setdefault(m.group(2), set()).add(int(m.group(3)))
    pos, width = {}, {}
    for tray, letters in rows.items():
        used = sorted(letters)
        idx = {l: TRAY_ROWS.index(l) for l in used if l in TRAY_ROWS}
        if used and all(l in TRAY_ROWS for l in used):
            first = TRAY_ROWS.index(used[0])
            span = TRAY_ROWS[first:TRAY_ROWS.index(used[-1]) + 1]
            if len(span) > len(used):            # a skipped letter: close up
                idx = {l: first + i for i, l in enumerate(used)}
        w = 36
        for l, nums in letters.items():
            if l not in idx:
                continue
            ordered = sorted(nums)
            if ordered[-1] > 36 and len(ordered) < ordered[-1]:   # skipped a number: close up
                cols = {n: i for i, n in enumerate(ordered)}
            else:
                cols = {n: n - 1 for n in ordered}
            w = max(w, max(cols.values()) + 1)
            for n, ci in cols.items():
                pos[f"{tray}{l}{n:02d}"] = (idx[l], ci)
        width[tray] = w
    return pos, width


def link_samples(state):
    """Mineral split records (samples/<slug>.md, one per sample number with its vials) and mounts
    point at each other: a mount sample matches a record by its separates (vial catalogue number)
    or, failing that, by its sample ID. Writes _data/samplelinks.json (record → mounts) and
    assets/samples-index.json (the search list for the Mineral splits page and New mount form)."""
    loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
    records, by_id, by_vial = {}, {}, {}
    for path in sorted(glob.glob(os.path.join(ROOT, "samples", "*.md"))):
        try:
            with open(path, encoding="utf-8") as f:
                m = re.match(r"^---\s*\n(.*?)\n---", f.read(), re.S)
            d = yaml.load(m.group(1), Loader=loader) or {} if m else {}
        except Exception as err:
            print(f"skipping {path}: {err}")
            continue
        slug = os.path.basename(path)[:-3]
        sid = text(d.get("sample_id")) or slug
        vials = [v for v in (d.get("vials") or []) if isinstance(v, dict)]
        records[slug] = {"id": sid, "vials": vials, "by": text(d.get("collected_by")),
                         "pids": [text(p) for p in (d.get("associated_pids") or []) if text(p)], "igsn": text(d.get("igsn")),
                         "geo": " · ".join(x for x in (text(d.get("rock_type")), text(d.get("strat_age"))) if x)}
        by_id.setdefault(sid.lower(), slug)
        for v in vials:
            if text(v.get("catalogue")):
                by_vial.setdefault(text(v.get("catalogue")).upper(), []).append(slug)
    # The same samples in EarthBank: names there often carry a prefix up to the first dash
    # (LITH00728954-7959-122 is sample 7959-122) and newer ones a PID after a double backslash
    # (8122-15\\University of Melbourne …). Names are matched exactly, else by their letter and
    # number groups with leading zeros ignored (97POS-49 = 97POS49, 8863-24 = 8863-024,
    # GC1-10 = GC1/10, but S-16 ≠ S1-6). Only samples in the University of Melbourne mineral
    # separate archive data package, or in the packages checked to hold the same samples
    # (ALSO_IN below), are used: other packages reuse short names for other samples.
    # The archive package is preferred when a sample is in both.
    # Uses the weekly list of public samples.
    def tokens(n):
        return tuple((x.lstrip("0") or "0") if x.isdigit() else x for x in re.findall(r"[a-z]+|\d+", n.lower()))
    eb = {}
    try:
        with open(os.path.join(ROOT, "assets", "earthbank", "samples.json"), encoding="utf-8") as f:
            ebl = json.load(f)
        want = {r["id"].lower(): slug for slug, r in records.items()}
        by_tok = {}
        for slug, r in records.items():
            by_tok.setdefault(tokens(r["id"]), []).append(slug)
        places, packages = ebl.get("places") or [], ebl.get("packages") or []
        archive = {i for i, p in enumerate(packages) if "university of melbourne mineral separate" in text(p[1]).lower()}
        also = {i for i, p in enumerate(packages) if any(k in text(p[1]).lower() for k in ALSO_IN)}
        found = {}
        for row in ebl.get("samples") or []:
            name = text(row[1])
            short = re.split(r"[\\/]{2}", name)[0].strip()
            base = re.sub(r"^LITH[^-]*-", "", short, flags=re.I)
            if row[2] not in archive and row[2] not in also:
                continue
            slug, how = want.get(base.lower()) or want.get(short.lower()), "exact"
            if not slug:
                hits = by_tok.get(tokens(base), [])
                slug, how = (hits[0], "loose") if len(hits) == 1 else (None, "")
            if not slug:
                continue
            place = places[row[3]] if len(row) > 3 and isinstance(row[3], int) and 0 <= row[3] < len(places) else ""
            lat, lon = (row[4], row[5]) if len(row) > 5 else (None, None)
            rec = {k: v for k, v in {"id": row[0], "name": short, "place": place, "lat": lat, "lon": lon}.items() if v not in (None, "")}
            found.setdefault(slug, []).append((row[2] in archive, how == "exact", rec))
        for slug, cands in found.items():
            mine = [c for c in cands if c[0]] or [c for c in cands if c[1]] or cands
            if not mine[0][0] and len(mine) > 1:
                continue    # only in other packages, and in more than one: a shared short name (7), not linked
            eb[slug] = [c[2] for c in mine]
    except (OSError, ValueError) as err:
        print(f"no EarthBank list for samples: {err}")
    with open(os.path.join(ROOT, "_data", "sampleeb.json"), "w", encoding="utf-8") as f:
        json.dump(eb, f, ensure_ascii=False)
    links = {}
    for mid, st in state.items():
        for smp in st.get("samples") or []:
            sid, sep = text(smp.get("id")), text(smp.get("separates"))
            hits = by_vial.get(sep.upper(), []) if sep else []
            slug = next((h for h in hits if records[h]["id"].lower() == sid.lower()), hits[0] if hits else None)
            if not slug:
                slug = by_id.get(sid.lower()) or by_id.get(sample_slug(sid).lower())
            if not slug:
                continue
            smp["record"] = slug
            if hits and slug in hits:
                smp["vial"] = sep
            links.setdefault(slug, []).append({k: v for k, v in {
                "mount": mid, "position": text(smp.get("position")), "vial": smp.get("vial", ""),
                "earthbank": smp.get("earthbank")}.items() if v})
    with open(os.path.join(ROOT, "_data", "samplelinks.json"), "w", encoding="utf-8") as f:
        json.dump(links, f, ensure_ascii=False)
    # Tray map: every vial position ever written (so removed vials leave gaps), plus vials added since
    try:
        with open(os.path.join(ROOT, "_scripts", "tray_codes.txt"), encoding="utf-8") as f:
            codes = {l.strip() for l in f if l.strip() and not l.startswith("#")}
    except OSError:
        codes = set()
    def cnorm(c):
        m = re.fullmatch(r"(\d+)([A-Z])(\d+)", c.upper().replace(" ", ""))
        return f"{int(m.group(1))}{m.group(2)}{int(m.group(3)):02d}" if m else None
    held = {}
    for slug, r in records.items():
        for v in r["vials"]:
            c = cnorm(text(v.get("catalogue")))
            if c:
                held.setdefault(c, (slug, r["id"], text(v.get("mineral")), text(v.get("prep")), text(v.get("catalogue"))))
                codes.add(c)
    pos, width = tray_positions(codes)
    trays = {}
    for c, (slug, sid, mineral, prep, raw) in held.items():
        if c in pos:
            tray = re.match(r"\d+", c).group()
            t = trays.setdefault(tray, {"cols": width[tray], "v": []})
            m1 = mineral.split(" + ")[0]
            tone = {"Apatite": "ap", "Zircon": "zr", "Titanite": "ti"}.get(m1, "o")
            # [row (0 = A, bottom), column (0 = 01, left), catalogue number, sample page, mineral tone,
            #  concentrate, split, mineral (only when not apatite/zircon/titanite), sample ID (only when
            #  it differs from the page name)]
            t["v"].append([pos[c][0], pos[c][1], raw, slug, tone, 1 if prep == "Concentrate" else 0, prep,
                           mineral if tone == "o" or " + " in mineral else "", sid if sid != slug else ""])
    with open(os.path.join(ROOT, "assets", "trays.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": TRAY_ROWS, "trays": trays}, f, ensure_ascii=False, separators=(",", ":"))
    index = [[slug, r["id"], [[text(v.get("catalogue")), text(v.get("mineral")), text(v.get("prep"))] for v in r["vials"]],
              r["by"], " ".join(r["pids"] + ([r["igsn"]] if r["igsn"] else [])), [l["mount"] for l in links.get(slug, [])], r["geo"]]
             for slug, r in records.items()]
    with open(os.path.join(ROOT, "assets", "samples-index.json"), "w", encoding="utf-8") as f:
        json.dump({"samples": index}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(records)} sample records, {len(links)} linked to mounts, {len(eb)} found in EarthBank")


def build():
    state = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "mounts", "*", "index.md"))):
        page = front_matter(path)
        mid = text(page.get("mount_id")) or os.path.basename(os.path.dirname(path))
        samples = [dict(s) for s in (page.get("samples") or []) if isinstance(s, dict)]
        for s in samples:
            s["id"] = text(s.get("id"))
        fields = {k: page.get(k) for k in DETAIL_FIELDS}
        created = text(page.get("created")) or text(page.get("year"))
        timeline = [{
            "date": created, "by": text(page.get("created_by")), "type": "created",
            "text": f"Mount created with {len(samples)} sample{'s' if len(samples) != 1 else ''}"
                    + (f" ({', '.join(s['id'] for s in samples)})" if 0 < len(samples) <= 6 else ""),
        }]
        analyses, notes, hires, links = [], [], {}, {}
        layout = None

        def find(sid):
            for s in samples:
                if s.get("id") == sid and not s.get("_removed"):
                    return s
            return None

        for e in load_entries(mid):
            t, sid = e.get("type"), text(e.get("sample"))
            if t == "sample":
                s = find(sid)
                if s is None:
                    s = {"id": sid}
                    samples.append(s)
                new_id = text(e.get("id"))
                if new_id and new_id != s["id"]:
                    s.setdefault("was", []).append(s["id"])
                    s["id"] = new_id
                if text(e.get("position")):
                    s["position"] = text(e.get("position"))
                if e.get("separates") is not None:
                    if text(e.get("separates")):
                        s["separates"] = text(e.get("separates"))
                    else:
                        s.pop("separates", None)
                if e.get("unlink"):
                    s.pop("earthbank", None)
                if e.get("earthbank"):
                    s["earthbank"] = int(e["earthbank"])
            elif t == "link" and find(sid) and e.get("earthbank"):
                find(sid)["earthbank"] = int(e["earthbank"])
            elif t == "unlink" and find(sid):
                find(sid).pop("earthbank", None)
            elif t == "add-sample" and sid and not find(sid):
                new = {"id": sid}
                if text(e.get("position")):
                    new["position"] = text(e.get("position"))
                if e.get("earthbank"):
                    new["earthbank"] = int(e["earthbank"])
                samples.append(new)
            elif t == "remove-sample" and find(sid):
                find(sid)["_removed"] = True
            elif t == "prep":
                key = PREP_FIELDS.get(text(e.get("step")).lower())
                if key and text(e.get("detail")):
                    fields[key] = text(e.get("detail"))
            elif t == "location" and text(e.get("storage")):
                fields["storage"] = text(e.get("storage"))
            elif t == "layout" and e.get("layout"):
                try:
                    lay = e["layout"] if isinstance(e["layout"], dict) else json.loads(e["layout"])
                    e["_first_layout"] = layout is None
                    layout = dict(lay, updated=e.get("date"), by=text(e.get("by")))
                except Exception as err:
                    print(f"skipping layout in {e['_file']}: {err}")
            elif t == "hires" and not text(e.get("file")) and text(e.get("url")):   # a download link on its own
                if e.get("remove"):
                    links.pop(text(e.get("url")), None)
                else:
                    links[text(e.get("url"))] = {k: text(e.get(k)) for k in ("url", "label", "date", "by") if text(e.get(k))}
            elif t == "hires" and text(e.get("file")):
                if text(e.get("url")):
                    hires[text(e.get("file"))] = {k: text(e.get(k)) for k in ("url", "label", "date", "by") if text(e.get(k))}
                else:
                    hires.pop(text(e.get("file")), None)
            elif t == "detail" and text(e.get("field")) in DETAIL_FIELDS:
                fields[text(e.get("field"))] = text(e.get("value"))
            elif t == "details" and isinstance(e.get("set"), dict):    # several fields at once (bulk edit)
                for k, v in e["set"].items():
                    if k in DETAIL_FIELDS and text(v):
                        fields[k] = text(v)
            item = {k: v for k, v in e.items() if not k.startswith("_") and k != "layout" and v not in (None, "")}
            item["text"] = describe(e)
            item["file"] = e["_file"]
            timeline.append(item)
            if t == "analysis":
                analyses.append(item)
            if t == "note" and text(e.get("note")):
                notes.append(item)

        current = [{k: v for k, v in s.items() if k != "_removed"} for s in samples if not s.get("_removed")]
        grains = read_grains(os.path.dirname(path), page.get("grain_default"))
        state[mid] = dict(
            {k: v for k, v in fields.items() if v not in (None, "")},
            samples=current, timeline=timeline, entries=len(timeline) - 1,
            analyses=list(reversed(analyses)), notes=notes, hires=hires, links=list(links.values()), layout=layout, grains=grains)

    link_samples(state)
    out = os.path.join(ROOT, "_data", "mountstate.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1, default=str)
    print(f"wrote {out} for {len(state)} mounts")


if __name__ == "__main__":
    build()
