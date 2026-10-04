#!/usr/bin/env python3
"""
Snapshot Carbon Mapper catalog data for MAIN / backup plumes into data/fixtures/carbon_mapper/.

Requires CARBON_MAPPER_TOKEN in the environment (never commit the token or write it into fixtures).

Usage:
  export CARBON_MAPPER_TOKEN=...
  python data/scripts/carbon_mapper_snapshot.py --plume tan20260813t190401c96s4001-B --out main
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

BASE = os.environ.get("CARBON_MAPPER_API_BASE", "https://api.carbonmapper.org/api/v1")
TOKEN = os.environ.get("CARBON_MAPPER_TOKEN", "")

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "data" / "fixtures" / "carbon_mapper"


def _headers() -> dict[str, str]:
    if not TOKEN:
        print("Set CARBON_MAPPER_TOKEN in the environment.", file=sys.stderr)
        sys.exit(1)
    return {"Authorization": f"Bearer {TOKEN}"}


def get_json(path: str, params: dict[str, Any] | None = None) -> Any:
    url = f"{BASE.rstrip('/')}/{path.lstrip('/')}"
    r = requests.get(url, headers=_headers(), params=params, timeout=120)
    r.raise_for_status()
    return r.json()


def resolve_source_name(plume_name: str) -> str:
    data = get_json(f"catalog/source/plume/name/{plume_name}")
    if isinstance(data, dict) and "source_name" in data:
        return str(data["source_name"])
    raise RuntimeError(f"Unexpected source/plume/name response: {data!r}")


def fetch_source(source_name: str) -> tuple[dict, str | None]:
    try:
        source = get_json(f"catalog/source/{source_name}")
        if not isinstance(source, dict):
            raise RuntimeError("catalog/source returned non-object")
        return source, None
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            csv_rows = get_json(f"catalog/source-plumes-csv/{source_name}")
            note = (
                "Built from catalog/source-plumes-csv because catalog/source returned 404."
            )
            if isinstance(csv_rows, list) and csv_rows:
                return {"source_name": source_name, "plumes_csv": csv_rows}, note
            return {"source_name": source_name, "plumes_csv": csv_rows}, note
        raise


def pick_plume(source: dict, plume_name: str) -> dict | None:
    for key in ("plumes", "plumes_csv"):
        rows = source.get(key) or []
        if not isinstance(rows, list):
            continue
        for p in rows:
            if not isinstance(p, dict):
                continue
            if p.get("plume_id") == plume_name or p.get("name") == plume_name:
                return p
    return None


def plume_lat_lon(plume: dict) -> tuple[float, float] | None:
    lat = plume.get("plume_latitude", plume.get("latitude"))
    lon = plume.get("plume_longitude", plume.get("longitude"))
    # The catalog API gives the origin as a GeoJSON Point: [longitude, latitude].
    geometry = plume.get("geometry_json") or {}
    coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if (lat is None or lon is None) and geometry.get("type") == "Point" and coords and len(coords) >= 2:
        lon, lat = coords[0], coords[1]
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def download_scenes(out_dir: Path, lat: float, lon: float, pad_deg: float = 0.05) -> None:
    """Best-effort scenes download; API query params may vary — failures are noted, not fatal."""
    bbox = f"{lon - pad_deg},{lat - pad_deg},{lon + pad_deg},{lat + pad_deg}"
    path = out_dir / "scenes.geojson"
    try:
        data = get_json(
            "catalog/download/scenes.geojson",
            params={"bbox": bbox},
        )
        path.write_text(json.dumps(data, indent=2) if not isinstance(data, str) else data)
        print(f"Wrote {path}")
    except Exception as e:  # noqa: BLE001
        note = out_dir / "scenes.FAILED.txt"
        note.write_text(
            f"Could not download scenes.geojson automatically: {e}\n"
            f"Manual: GET catalog/download/scenes.geojson with bbox={bbox}\n"
        )
        print(f"scenes download failed (see {note})", file=sys.stderr)


def download_plume_png(out_dir: Path, plume: dict) -> None:
    url = plume.get("plume_png") or plume.get("png_url") or plume.get("rgb_png")
    if not url or not isinstance(url, str):
        print("No plume_png URL on plume row; skip image download.", file=sys.stderr)
        return
    try:
        r = requests.get(url, headers=_headers(), timeout=120)
        r.raise_for_status()
        # Prefer stable local name for offline demo
        ext = Path(urlparse(url).path).suffix or ".png"
        dest = out_dir / f"plume{ext}"
        dest.write_bytes(r.content)
        print(f"Wrote {dest}")
    except Exception as e:  # noqa: BLE001
        print(f"plume_png download failed: {e}", file=sys.stderr)


def write_quality_notes(out_dir: Path, plume: dict) -> None:
    notes = []
    q = plume.get("plume_quality")
    if q is not None:
        notes.append(f"- plume_quality: `{q}`")
    instrument = str(plume.get("instrument") or "")
    if instrument.lower().startswith("tan") or "tanager" in instrument.lower():
        notes.append(
            "- Instrument looks Tanager-related: surface the uncalibrated-Tanager warning in UI/briefing if Product Direction requires it."
        )
    if notes:
        (out_dir / "QUALITY.md").write_text(
            "# Quality checks\n\n" + "\n".join(notes) + "\n"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plume", required=True, help="plume_id / plume_name")
    parser.add_argument("--out", required=True, help="fixture subfolder e.g. main")
    parser.add_argument(
        "--skip-scenes",
        action="store_true",
        help="Do not attempt scenes.geojson download",
    )
    parser.add_argument(
        "--skip-png",
        action="store_true",
        help="Do not attempt plume_png download",
    )
    args = parser.parse_args()

    out_dir = FIXTURES / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    source_name = resolve_source_name(args.plume)
    source, source_note = fetch_source(source_name)
    (out_dir / "source.json").write_text(json.dumps(source, indent=2) + "\n")

    plume_row = pick_plume(source, args.plume)
    if plume_row is None:
        raise SystemExit(
            f"Could not find plume `{args.plume}` on source `{source_name}`. "
            "Inspect source.json and pull the row from /catalog/plume-csv if needed."
        )
    (out_dir / "plume.json").write_text(json.dumps(plume_row, indent=2) + "\n")
    write_quality_notes(out_dir, plume_row)

    ll = plume_lat_lon(plume_row)
    if ll and not args.skip_scenes:
        download_scenes(out_dir, ll[0], ll[1])
    if not args.skip_png:
        download_plume_png(out_dir, plume_row)

    readme = out_dir / "README.md"
    lines = [
        f"# Carbon Mapper snapshot: {args.out}",
        "",
        f"- plume_id: `{args.plume}`",
        f"- source_name: `{source_name}`",
        "- All numeric fields come from the API response files in this folder. Do not hand-edit.",
    ]
    if source_note:
        lines.append(f"- source.json note: {source_note}")
    if ll:
        lines.append(f"- plume origin (for OGIM density): `{ll[0]}, {ll[1]}`")
    readme.write_text("\n".join(lines) + "\n")

    print(f"Wrote fixtures under {out_dir}")
    if ll:
        print(
            "Next OGIM density:\n"
            f"  python data/scripts/ogim_clip_and_density.py --lat {ll[0]} --lon {ll[1]}"
        )


if __name__ == "__main__":
    main()
