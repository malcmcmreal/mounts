#!/usr/bin/env python3
"""Fetch public data from EarthBank (API at app.ausgeochem.org) for the mount catalogue.

Runs in GitHub Actions (see .github/workflows/site.yml). Two jobs:

  python _scripts/earthbank.py index
      Lists every public EarthBank sample and writes a compact search list to
      assets/earthbank/samples.json. The New mount form searches this list.
      Takes ~40 minutes, so it runs weekly.

  python _scripts/earthbank.py details
      Reads the mounts, finds samples with an `earthbank:` sample ID, and writes
      their details (location, data package, people, publications, data) to
      _data/earthbank.json, which the mount pages display.

Only public EarthBank data is used; no login or key is needed.
"""
import datetime
import glob
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = os.environ.get("EARTHBANK_API", "https://app.ausgeochem.org")
def _web():
    """Link address for EarthBank pages: earthbank_web in _config.yml."""
    try:
        import yaml
        cfg = yaml.safe_load(open(os.path.join(os.path.dirname(__file__), "..", "_config.yml"), encoding="utf-8"))
        return (cfg.get("earthbank_web") or "").rstrip("/") or "https://www.earthbank.au"
    except Exception:
        return "https://app.ausgeochem.org"
WEB = _web()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TECHNIQUES = {
    "HE": "(U-Th)/He", "FT": "Fission track", "GC": "Geochemistry", "UPB": "U-Pb",
    "ARAR": "Ar-Ar", "ISO": "Isotopes", "LUHF": "Lu-Hf", "FILE": "Files",
    "SHRIMP": "SHRIMP", "PBISOTOPE": "Pb isotopes", "SRISOTOPE": "Sr isotopes",
    "TH": "Thermal history",
}


def get(path, params=None, tries=5):
    url = API + path + ("?" + urllib.parse.urlencode(params, doseq=True) if params else "")
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "sample-mount-catalogue (GitHub Actions)"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r), r.headers
        except Exception as e:  # network hiccup or server busy: wait and retry
            if i == tries - 1:
                raise
            wait = 5 * 2 ** i
            print(f"  retry in {wait}s after {e}", flush=True)
            time.sleep(wait)


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_json(path, data):
    path = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.1f} MB)")


# ---------------------------------------------------------------- index

def build_index():
    packages, pkg_index = [], {}
    places, place_index = [], {}
    samples = []
    page, size = 0, 200
    while True:
        rows, headers = get("/api/core/sample-with-locations",
                            {"page": page, "size": size, "sort": "id,asc"})
        if page == 0:
            print(f"{headers.get('X-Total-Count')} public samples", flush=True)
        if not rows:
            break
        for r in rows:
            s = r.get("sampleDTO") or {}
            loc = r.get("locationDTO") or {}
            pid = s.get("dataPackageId")
            pi = -1
            if pid:
                if pid not in pkg_index:
                    pkg_index[pid] = len(packages)
                    packages.append([pid, s.get("dataPackageName") or f"Data package {pid}"])
                pi = pkg_index[pid]
            place = ", ".join(x for x in [loc.get("name"), loc.get("countryName")] if x)
            li = -1
            if place:
                if place not in place_index:
                    place_index[place] = len(places)
                    places.append(place)
                li = place_index[place]
            samples.append([r.get("id") or s.get("id"), s.get("name") or "", pi, li])
        page += 1
        if page % 50 == 0:
            print(f"  {len(samples)} samples so far", flush=True)
        if len(rows) < size:
            break
    write_json("assets/earthbank/samples.json", {
        "updated": now(), "web": WEB,
        "fields": ["id", "name", "package", "place"],
        "packages": packages, "places": places, "samples": samples})


# ---------------------------------------------------------------- details

def linked_ids():
    """EarthBank sample IDs linked to mounts: in the mount files (`earthbank:` under a
    sample) and in timeline entries (_data/log/<ID>/*.yml)."""
    ids = set()
    files = glob.glob(os.path.join(ROOT, "mounts", "*", "index.md")) + \
        glob.glob(os.path.join(ROOT, "_data", "log", "*", "*.yml"))
    for path in files:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        if path.endswith(".md"):
            text = text.split("---")[1] if text.startswith("---") else ""
        ids.update(int(m) for m in re.findall(r"^\s*earthbank:\s*\"?(\d+)\"?\s*$", text, re.M))
    return sorted(ids)


def find_dois(text):
    if not text:
        return []
    text = re.sub(r"doi\.\s*org", "doi.org", text)  # EarthBank text sometimes breaks lines in URLs
    found = []
    for d in re.findall(r"\b10\.\d{4,9}/[^\s\"<>,;]+", text):
        d = d.rstrip(".)")
        if d not in found:
            found.append(d)
    return found


def clean(d):
    """Drop empty values so the page templates stay simple."""
    if isinstance(d, dict):
        return {k: clean(v) for k, v in d.items() if v not in (None, "", [], {})}
    if isinstance(d, list):
        return [clean(v) for v in d]
    return d


def doi_url(v):
    if not v:
        return None
    v = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:)", "", v.strip(), flags=re.I)
    return "https://doi.org/" + v


def ident_url(v):
    """IGSNs come as DOIs (10.xxxx/...), old-style handles (10273/...) or bare codes."""
    if not v:
        return None
    v = v.strip()
    if re.match(r"^(https?://|doi:)", v, re.I) or v.startswith("10."):
        return doi_url(v)
    if "/" in v:
        return "https://hdl.handle.net/" + v
    return "https://igsn.org/" + v


def sample_details(h, points):
    s = h.get("sampleDTO") or {}
    loc = h.get("locationDTO") or {}
    arch = h.get("archiveDTO") or {}
    sid = h.get("id") or s.get("id")
    ident = s.get("igsn") or s.get("doi")
    age = None
    if s.get("rockUnitAgeMin") is not None or s.get("rockUnitAgeMax") is not None:
        lo, hi = s.get("rockUnitAgeMin"), s.get("rockUnitAgeMax")
        age = f"{lo}–{hi} Ma" if lo is not None and hi is not None and lo != hi else f"{lo if lo is not None else hi} Ma"
    counts = {}
    for p in points:
        name = TECHNIQUES.get((p.get("dataStructure") or "").upper(), p.get("dataStructure") or "Other")
        counts[name] = counts.get(name, 0) + 1
    people = [clean({
        # EarthBank sometimes appends the ORCID to the name, e.g. "DA Foster (0000-0002-...)"
        "name": re.sub(r"\s*\(\d{4}-\d{4}-\d{4}-\d{3}[\dX]\)", "",
                       p.get("calcName") or " ".join(x for x in [p.get("firstName"), p.get("name")] if x)),
        "orcid": ("https://orcid.org/" + re.sub(r"^https?://orcid\.org/", "", p["orcId"])) if p.get("orcId") else None,
    }) for p in (h.get("personDTOs") or [])]
    lit = []
    for l in (h.get("literatureDTOs") or []):
        bits = [l.get("author"), f"({l['pubYear']})" if l.get("pubYear") else None, l.get("title")]
        lit.append(clean({
            "text": " ".join(b for b in bits if b) or l.get("calcName"),
            "journal": l.get("journal"),
            "doi": doi_url(l.get("doi")),
            "url": l.get("url"),
        }))
    return clean({
        "id": sid,
        "name": s.get("name"),
        "url": f"{WEB}/mydata#/core/sample-with-locations/{sid}/show",
        "igsn": ident,
        "igsn_url": ident_url(ident),
        "description": s.get("description"),
        "material": s.get("materialName"),
        "kind": s.get("sampleKindName"),
        "method": s.get("sampleMethodName"),
        "age": age,
        "collected": s.get("collectDateMin"),
        "location": {
            "name": loc.get("name"), "country": loc.get("countryName"),
            "lat": loc.get("lat"), "lon": loc.get("lon"),
            "kind": s.get("locationKindName"), "description": loc.get("description"),
            # Planetary samples (e.g. Mars rover data) have coordinates on another body
            "body": loc.get("celestialName") if (loc.get("celestialName") or "Earth") != "Earth" else None,
        },
        "elevation": s.get("referenceElevation"),
        "package": s.get("dataPackageId"),
        "archive": {"name": arch.get("name"), "url": arch.get("url")},
        "people": people,
        "literature": lit,
        "data": counts,
    })


def package_details(pid):
    try:
        p, _ = get(f"/api/management/data-packages/{pid}")
    except Exception as e:
        print(f"  could not read data package {pid}: {e}")
        return None
    d = p.get("dataPackageDTO") or {}
    desc = d.get("description") or p.get("description") or ""
    dois = find_dois(desc)
    own = doi_url(d.get("doi"))
    return clean({
        "id": pid,
        "name": d.get("name") or p.get("name"),
        "url": f"{WEB}/mydata#/management/data-packages/{pid}/show",
        "doi": own,
        "publications": [doi_url(x) for x in dois if doi_url(x) != own],
        "description": desc.strip()[:600] + ("…" if len(desc.strip()) > 600 else ""),
        "cite": d.get("howToCite"),
        "license": d.get("licenseName") or p.get("licenseText"),
        "institution": d.get("institutionName") or p.get("institutionName"),
        "related": d.get("relatedDataLink"),
        "samples": p.get("countSamples"),
    })


def build_details():
    ids = linked_ids()
    print(f"{len(ids)} linked EarthBank samples: {ids}")
    samples, packages = {}, {}
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        hydrated, _ = get("/api/core/hydrate-samples-by-id", {"sampleIds": ",".join(map(str, batch))})
        points, _ = get("/api/core/data-points", {"sampleId.in": ",".join(map(str, batch)), "size": 2000})
        for h in hydrated:
            sid = h.get("id") or (h.get("sampleDTO") or {}).get("id")
            mine = [p for p in points if p.get("sampleId") == sid]
            samples[str(sid)] = sample_details(h, mine)
    for s in samples.values():
        pid = s.get("package")
        if pid and str(pid) not in packages:
            info = package_details(pid)
            if info:
                packages[str(pid)] = info
    missing = [i for i in ids if str(i) not in samples]
    if missing:
        print(f"not found or not public: {missing}")
    write_json("_data/earthbank.json", {
        "updated": now(), "samples": samples, "packages": packages,
        "missing": [str(i) for i in missing]})


if __name__ == "__main__":
    {"index": build_index, "details": build_details}[sys.argv[1] if len(sys.argv) > 1 else "details"]()
