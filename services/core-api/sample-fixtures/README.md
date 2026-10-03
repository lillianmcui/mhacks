# Sample fixtures — NOT real data

Everything in this folder is invented so the backend can run before Track C's
real fixtures land in `data/fixtures/`. The plume, its numbers, the location,
the company, the people and the phone numbers (555-01xx, reserved for fiction)
are all made up. Policy thresholds here are placeholders, not the team's.

Used by: the stub Core API (`make stub`), `make seed-sample` / `make replay-sample`,
and the tests. Never demo with these. The layout mirrors `data/fixtures/`
exactly, so it also documents the file shapes the loader expects.
