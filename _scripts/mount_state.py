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
                 "polish", "etch", "coating", "storage"]
DETAIL_LABELS = {"project": "Project", "year": "Year made", "created_by": "Made by", "affiliation": "Affiliation",
                 "mount_format": "Mount format", "resin": "Resin / epoxy", "minerals": "Minerals",
                 "polish": "Polish", "etch": "Etching", "coating": "Coating", "storage": "Stored at"}


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
    if t == "layout":
        return "Mount layout drawn" if e.get("_first_layout") else "Mount layout updated"
    if t == "note":
        return "Note added"
    return t or "Entry"


def read_grains(mount_dir):
    """Grain coordinate file (mounts/<ID>/grains/*.csv, TrackWorks export): a COORDINATION section
    with the three fiducials (First, Second, Third) and a GRAIN section (G01, G02…), as name,X,Y,Z
    in stage coordinates (µm). Every file with both sections is listed, newest upload first;
    the page shows the newest unless the viewer picks another."""
    import csv, subprocess
    found = []
    for path in sorted(glob.glob(os.path.join(mount_dir, "grains", "*.csv"))):
        fids, points, section = [], [], None
        try:
            with open(path, encoding="utf-8-sig", errors="replace") as fh:
                for row in csv.reader(fh):
                    row = [c.strip() for c in row]
                    if not row or not row[0]:
                        section = None if not any(row) else section
                        continue
                    head = row[0].upper()
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
    return {"files": found} if found else None


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
        grains = read_grains(os.path.dirname(path))
        state[mid] = dict(
            {k: v for k, v in fields.items() if v not in (None, "")},
            samples=current, timeline=timeline, entries=len(timeline) - 1,
            analyses=list(reversed(analyses)), notes=notes, hires=hires, links=list(links.values()), layout=layout, grains=grains)

    out = os.path.join(ROOT, "_data", "mountstate.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1, default=str)
    print(f"wrote {out} for {len(state)} mounts")


if __name__ == "__main__":
    build()
