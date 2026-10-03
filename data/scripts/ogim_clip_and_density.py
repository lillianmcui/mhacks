#!/usr/bin/env python3
"""
Clip OGIM v3.0 GeoPackage tables around a plume point and count facilities within R meters.

First-hour CP0 question: how many OGIM facilities within R of MAIN plume origin?

Usage:
  export OGIM_GPKG=/path/to/ogim_v3.gpkg
  python data/scripts/ogim_clip_and_density.py \\
    --lat 31.85 --lon -103.45 --radius-m 250 --buffer-deg 0.02
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    import geopandas as gpd
    from shapely.geometry import Point
except ImportError:
    print("Install data/scripts/requirements.txt (geopandas, shapely).", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "fixtures" / "ogim" / "clip.geojson"


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", default=None, help="OGIM GeoPackage path (or OGIM_GPKG env)")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--radius-m", type=float, default=250)
    parser.add_argument("--buffer-deg", type=float, default=0.02)
    args = parser.parse_args()

    gpkg = args.gpkg or __import__("os").environ.get("OGIM_GPKG")
    if not gpkg:
        print("Provide --gpkg or OGIM_GPKG.", file=sys.stderr)
        sys.exit(1)

    plume = Point(args.lon, args.lat)
    bbox = (
        args.lon - args.buffer_deg,
        args.lat - args.buffer_deg,
        args.lon + args.buffer_deg,
        args.lat + args.buffer_deg,
    )

    import fiona

    layers = fiona.listlayers(gpkg)
    features: list[dict] = []
    within: list[dict] = []

    for layer in layers:
        gdf = gpd.read_file(gpkg, layer=layer, bbox=bbox)
        if gdf.empty:
            continue
        gdf = gdf.to_crs(epsg=4326)
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            c = geom if geom.geom_type == "Point" else geom.centroid
            dist = haversine_m(args.lat, args.lon, c.y, c.x)
            feat = {
                "type": "Feature",
                "geometry": geom.__geo_interface__,
                "properties": {
                    "facility_type": layer,
                    **{k: row[k] for k in row.index if k != "geometry"},
                    "distance_m": round(dist, 2),
                },
            }
            features.append(feat)
            if dist <= args.radius_m:
                within.append(
                    {
                        "facility_type": layer,
                        "distance_m": round(dist, 2),
                        "ogim_id": row.get("ogim_id") or row.get("id"),
                    }
                )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "features": features}
    OUT.write_text(json.dumps(geojson))

    summary = {
        "plume_lat": args.lat,
        "plume_lon": args.lon,
        "radius_m": args.radius_m,
        "count_within_radius": len(within),
        "within": sorted(within, key=lambda x: x["distance_m"]),
        "by_type": {},
    }
    for w in within:
        summary["by_type"][w["facility_type"]] = summary["by_type"].get(w["facility_type"], 0) + 1

    print(json.dumps(summary, indent=2))
    print(f"\nWrote clip to {OUT}")


if __name__ == "__main__":
    main()
