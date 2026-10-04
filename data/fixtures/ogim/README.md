# OGIM clip

Download OGIM v3.0 (Zenodo GeoPackage), then:

```bash
export OGIM_GPKG=/path/to/ogim_v3.gpkg
python data/scripts/ogim_clip_and_density.py --lat <main_lat> --lon <main_lon>
```

Post the printed `count_within_radius` and facility types in team chat (CP0).

Strip real OGIM operator names before mapping rows into `data/fixtures/company/`.
