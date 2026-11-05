#!/usr/bin/env python3
"""Work out each mount's current state from its original page plus its timeline entries.

A mount's page file (mounts/<ID>/index.md) is written once, when the mount is created.
Everything that happens later is a separate dated entry file in _data/log/<ID>/, e.g.

    date: "2027-02-02 14:30"
    by: "M. McMillan"
    type: link              # link | unlink | add-sample | remove-sample | prep | analysis | location | note
    sample: "EX-002"
    earthbank: 748265
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


def describe(e):
    """One-line summary for the timeline."""
    t, s = e.get("type"), text(e.get("sample"))
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
            text(e.get("step")).lower(), text(e.get("step")).capitalize() or "Preparation")
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
    if t == "note":
        return "Note"
    return t or "Entry"


def build():
    state = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "mounts", "*", "index.md"))):
        page = front_matter(path)
        mid = text(page.get("mount_id")) or os.path.basename(os.path.dirname(path))
        samples = [dict(s) for s in (page.get("samples") or []) if isinstance(s, dict)]
        fields = {k: page.get(k) for k in ("polish", "etch", "coating", "storage")}
        created = text(page.get("created")) or text(page.get("year"))
        timeline = [{
            "date": created, "by": text(page.get("created_by")), "type": "created",
            "text": f"Mount created with {len(samples)} sample{'s' if len(samples) != 1 else ''}"
                    + (f" ({', '.join(text(s.get('id')) for s in samples)})" if 0 < len(samples) <= 6 else ""),
        }]

        def find(sid):
            for s in samples:
                if text(s.get("id")) == sid and not s.get("_removed"):
                    return s
            return None

        for e in load_entries(mid):
            t, sid = e.get("type"), text(e.get("sample"))
            if t == "link" and find(sid) and e.get("earthbank"):
                find(sid)["earthbank"] = int(e["earthbank"])
            elif t == "unlink" and find(sid):
                find(sid).pop("earthbank", None)
            elif t == "add-sample" and sid and not find(sid):
                new = {"id": sid}
                for k in ("position", "notes"):
                    if text(e.get(k)):
                        new[k] = text(e.get(k))
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
            item = {k: v for k, v in e.items() if not k.startswith("_") and v not in (None, "")}
            item["text"] = describe(e)
            item["file"] = e["_file"]
            timeline.append(item)

        current = [{k: v for k, v in s.items() if k != "_removed"} for s in samples if not s.get("_removed")]
        state[mid] = dict(
            {k: v for k, v in fields.items() if v not in (None, "")},
            samples=current, timeline=timeline, entries=len(timeline) - 1)

    out = os.path.join(ROOT, "_data", "mountstate.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1, default=str)
    print(f"wrote {out} for {len(state)} mounts")


if __name__ == "__main__":
    build()
