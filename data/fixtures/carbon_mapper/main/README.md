# MAIN event fixtures (pending snapshot)

Run after `CARBON_MAPPER_TOKEN` is in your local env:

```bash
python data/scripts/carbon_mapper_snapshot.py \
  --plume tan20260813t190401c96s4001-B \
  --out main
```

Then add:

- `scenes.geojson` from `/catalog/download/scenes.geojson` (bbox around plume)
- `plume_png` downloaded for offline demo

Do **not** commit the API token. Values in JSON must come from the API only (no hand-typed emissions).
