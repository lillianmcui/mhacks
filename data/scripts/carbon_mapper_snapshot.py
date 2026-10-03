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


def get_json(path: str) -> dict | list:
    url = f"{BASE.rstrip('/')}/{path.lstrip('/')}"
    r = requests.get(url, headers=_headers(), timeout=60)
    r.raise_for_status()
    return r.json()


def resolve_source_name(plume_name: str) -> str:
    data = get_json(f"catalog/source/plume/name/{plume_name}")
    if isinstance(data, dict) and "source_name" in data:
        return str(data["source_name"])
    raise RuntimeError(f"Unexpected source/plume/name response: {data!r}")


def fetch_source(source_name: str) -> tuple[dict, str]:
    try:
        source = get_json(f"catalog/source/{source_name}")
        return source, "catalog/source"
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            csv_rows = get_json(f"catalog/source-plumes-csv/{source_name}")
            note = (
                "Built from catalog/source-plumes-csv because catalog/source returned 404."
            )
            if isinstance(csv_rows, list) and csv_rows:
                return {"source_name": source_name, "plumes_csv": csv_rows}, note
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plume", required=True, help="plume_id / plume_name")
    parser.add_argument("--out", required=True, help="fixture subfolder e.g. main")
    args = parser.parse_args()

    out_dir = FIXTURES / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    source_name = resolve_source_name(args.plume)
    source, source_note = fetch_source(source_name)
    (out_dir / "source.json").write_text(json.dumps(source, indent=2))

    readme = out_dir / "README.md"
    lines = [f"# Carbon Mapper snapshot: {args.out}", "", f"- plume_id: `{args.plume}`", f"- source_name: `{source_name}`"]
    if source_note:
        lines.append(f"- source.json note: {source_note}")
    readme.write_text("\n".join(lines) + "\n")

    # Plume row: prefer embedded plumes on source, else document manual pull from plume-csv
    plume_row = None
    if isinstance(source, dict):
        plumes = source.get("plumes") or []
        for p in plumes:
            if p.get("plume_id") == args.plume or p.get("name") == args.plume:
                plume_row = p
                break
    if plume_row is None:
        plume_row = {"plume_id": args.plume, "_note": "Fill from /catalog/plume-csv filter"}
    (out_dir / "plume.json").write_text(json.dumps(plume_row, indent=2))

    print(f"Wrote {out_dir}/source.json and plume.json")
    print("Next: download scenes.geojson (bbox/intersects) and plume_png into the same folder.")


if __name__ == "__main__":
    main()
