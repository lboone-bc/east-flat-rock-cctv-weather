# Agent guidance — East Flat Rock CCTV + Weather Wall

Read `README.md` and `REFERENCE_INDEX.md` before changing location, camera,
weather, radar, layout, or deployment behavior.

## Canonical project context

- Product name: East Flat Rock CCTV + Weather Wall.
- GitHub/package/Worker slug: `east-flat-rock-cctv-weather`.
- Center address: `103 Education Dr, Flat Rock, NC 28731`.
- Display locality: `East Flat Rock, NC`.
- The feed roster spans Henderson and Polk counties; the address itself is in
  Henderson County.
- Canonical center: `35.294292, -82.398257`, from the active Henderson
  County address-point record. Do not substitute the NWS `relativeLocation`
  label (`Hendersonville`) for the display locality.
- Weather/radar constants live in `public/weather.js`; all visible location
  strings also need to stay aligned in `public/index.html`.

## Camera and layout invariants

- The wall contains exactly 12 feeds in this order:
  1. eight closest enabled interstate cameras in the chosen display order
     MM53 (focus), MM59, MM54.2, MM51.5, MM49, MM48.2, MM48, MM46.2;
  2. four closest enabled non-interstate road cameras, nearest first.
- Camera 1 is the only `priority: true` camera and must be the closest
  interstate feed.
- DOM order is functional. With the 4-column grid and 3×3 hero, entries 9–12
  form the bottom row. Do not reorder except on explicit user direction.
- Keep `CAMERAS` in `public/cameras.js` and `WANTED_CAMERA_IDS` in
  `src/worker.js` identical and in the same order. Run `npm run check` after
  every roster change.
- Use DriveNC numeric camera IDs. Do not infer IDs from legacy public GUIDs.
- For a new proximity audit, start from the full live DriveNC API inventory,
  require `Views[0].Status === "Enabled"` plus a populated HLS URL, calculate
  Haversine distance from the canonical center, and test both the current HLS
  media segment and `https://www.drivenc.gov/map/Cctv/{id}` fallback.
- Record the audit date, distance method, cutoff candidates, and any API data
  anomalies in both `README.md` and `REFERENCE_INDEX.md`.
- DriveNC mislabels the raw `Roadway` for ID `4873` as `US-66` and ID `4872`
  as `US-65`. Their `Location`/`Description` fields and county road data show
  US-64; preserve the friendly US-64 labels unless the upstream data changes.
- Preserve `.camera-tile.priority` as a 3×3 tile and the four-column dense grid
  unless the user explicitly requests a layout redesign.

## Deployment safety

- Git `origin` must remain
  `https://github.com/lboone-bc/east-flat-rock-cctv-weather.git`, and
  `wrangler.jsonc` must target `east-flat-rock-cctv-weather`. Do not repoint
  either identity to the original Arden project.
- `wrangler.jsonc` is the deployment source of truth and must retain
  `keep_vars: true` while dashboard-managed bindings are used.
- Cloudflare currently reports its GitHub account connection as disconnected.
  Do not assume a push deployed production: use authenticated `wrangler deploy`
  until the GitHub app is reauthorized, then verify the production asset hash
  and `/api/cameras` response after every release.
- Never commit `.dev.vars` or expose `DRIVENC_API_KEY` in browser code, logs,
  docs, screenshots, or commands whose expanded values are displayed.
- Node.js 22+ is required by the installed Wrangler version.
- The absence of a key is an intentional degraded mode: `/api/cameras`
  returns `[]` and the browser uses the public iframe fallbacks.
- Preserve camera self-healing: successful metadata refreshes every 90 seconds,
  empty/error metadata retries after 10 seconds, and a feed that fails or makes
  no media-time progress for 25 seconds falls back and retries after 10 seconds.
  Fatal playback errors must still be handled after the first `playing` event.
- Keep `/api/cameras` responses `Cache-Control: no-store`; the Worker already
  owns the upstream cache, and browser caching can strand a wall on stale
  pre-secret metadata.

## Required verification

Run, at minimum:

```bash
npm run check
npm run deploy -- --dry-run
git diff --check
```

For camera/location or playback changes, also verify the live NWS point, all
selected HLS manifests and media segments, all iframe fallbacks, advancing
`video.currentTime` across every feed, and the 1920×1080 layout. Use Node 22+
for Wrangler commands.

## Documentation contract

Whenever the address, coordinates, display locality, cameras, source APIs,
layout rules, Git identity, Worker name, secret handling, or deployed URL
changes, update all affected code plus `README.md`, this file, and
`REFERENCE_INDEX.md` in the same change. `REFERENCE_INDEX.md` is the detailed
evidence/source-ownership record; `README.md` is the operator handoff and
rollout plan.
