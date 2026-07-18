# East Flat Rock CCTV + Weather Wall

An always-on TV dashboard for live conditions around **103 Education Dr,
Flat Rock, NC 28731**. It preserves the original traffic-operations-console
layout while moving every location-specific input to East Flat Rock:

- live weather and a radar map centered on the address;
- the eight closest enabled interstate cameras, nearest first;
- the closest interstate camera as the large focus feed; and
- the four closest enabled non-interstate road cameras in the bottom row.

The app is static HTML/CSS/JavaScript plus one small Cloudflare Worker. The
Worker protects the DriveNC API key, caches camera metadata, and serves the
static assets.

## Work plan / rollout

- [x] Resolve and cross-check the address center.
- [x] Rank the live DriveNC inventory by straight-line distance.
- [x] Verify all 12 selected HLS manifests, current media segments, and
      iframe fallback pages.
- [x] Update weather, radar, camera ordering, branding, Worker identity, and
      configuration integrity checks.
- [x] Add durable root guidance in `AGENTS.md` and `REFERENCE_INDEX.md`.
- [x] Create the dedicated GitHub repository and change the local `origin` to
      `lboone-bc/east-flat-rock-cctv-weather`.
- [x] Create the dedicated Cloudflare service/build target,
      `east-flat-rock-cctv-weather`.
- [ ] Set/confirm `DRIVENC_API_KEY`, confirm the production build, and record
      the actual deployed URL in this README and `REFERENCE_INDEX.md`.
- [ ] Soak-test 12 simultaneous HLS feeds on the final TV/browser hardware.

> [!IMPORTANT]
> This checkout is now isolated from the original Arden deployment: `origin`
> points to `lboone-bc/east-flat-rock-cctv-weather`, and Wrangler targets the
> Cloudflare service `east-flat-rock-cctv-weather`. Keep those identities
> aligned so future deploys cannot overwrite the Arden wall.

## Canonical location

| Field | Value |
|---|---|
| Address | 103 Education Dr, Flat Rock, NC 28731 |
| Display locality | East Flat Rock, NC |
| Center | `35.294292, -82.398257` |
| County | Henderson County |
| NWS grid | `GSP/62,62` |
| NWS radar station | `KGSP` |
| Radar zoom | `8` |

The center is the
[active Henderson County address-point record](https://gisweb.hendersoncountync.gov/arcgis/rest/services/Addresses/MapServer/0/query?where=Add_Number%3D103%20AND%20UPPER%28St_Name%29%3D%27EDUCATION%27&outFields=REID%2CFullAddress%2CStatus%2CMSAGComm%2CPost_Comm%2CPost_Code%2CLong%2CLat%2CInc_Muni%2CJURISDICTION%2CSOURCE%2Caddress_last_edited_date&returnGeometry=true&outSR=4326&f=pjson),
rounded to six decimal places. An Esri point-address match and the U.S. Census
geocoder were used as independent cross-checks; all three points produce the
same camera ordering. [NWS MapClick](https://forecast.weather.gov/MapClick.php?lat=35.2943&lon=-82.3983)
labels the point East Flat Rock, even though the NWS API's `relativeLocation`
field reports Hendersonville. The UI intentionally uses **East Flat Rock,
NC**.

## Camera selection

The roster was rebuilt from all 1,155 records returned by the live DriveNC
Cameras API on **2026-07-18**. Selection rules are deliberately reproducible:

1. Keep cameras whose first view is enabled and exposes an HLS URL.
2. Calculate Haversine distance from the canonical center, using an Earth
   radius of 3,958.7613 miles.
3. Sort interstate (`I-*`) cameras separately and take the closest eight.
4. Exclude interstates from the remaining pool and take the closest four
   highway/freeway/road cameras.
5. Put the closest interstate first with `priority: true`; preserve the rest
   in nearest-first order. DOM order is a layout contract.

### Eight closest interstate feeds

| Rank | Label | DriveNC ID | Distance | DriveNC location | Status |
|---:|---|---:|---:|---|---|
| **1 / focus** | **I-26 MM53 — Upward Rd** | `5131` | 0.510 mi | `CCTV14-I26-53W_UPWARD` | ✅ Live HLS |
| 2 | I-26 MM54.2 — US-25 | `5264` | 0.806 mi | `CCTV14-I26-54.2S_US25` | ✅ Live HLS |
| 3 | I-26 MM51.5 — Tracy Grove Rd | `6102` | 1.900 mi | `CCTV14-I26-51.5W_TRACYGROVE` | ✅ Live HLS |
| 4 | I-26 MM49 — US-64 | `4878` | 3.997 mi | `CCTV14-I26-49W_US64` | ✅ Live HLS |
| 5 | I-26 MM59 — Holbert Cove Rd | `5265` | 5.053 mi | `CCTV14-I26-59N_HOLBERTCOVE` | ✅ Live HLS |
| 6 | I-26 MM48.2 | `6119` | 5.642 mi | `CCTV14-I26-48.2E` | ✅ Live HLS |
| 7 | I-26 MM48 | `4877` | 5.663 mi | `CCTV14-I26-48W` | ✅ Live HLS |
| 8 | I-26 MM46.2 | `6097` | 7.557 mi | `CCTV14-I26-46.2E` | ✅ Live HLS |

The next interstate feed is ID `6101`, 8.578 miles away, which confirms the
cutoff. The MM59/Holbert Cove feed is in Polk County, so the operations header
correctly reflects both Henderson and Polk counties.

### Four closest non-interstate feeds — bottom row

| Rank | Label | DriveNC ID | Distance | DriveNC location | Status |
|---:|---|---:|---:|---|---|
| 1 | US-176 — Upward Rd | `5253` | 1.739 mi | `CCTV14-US176_UpwardRd` | ✅ Live HLS |
| 2 | US-176 — US-25 BUS | `4867` | 3.523 mi | `CCTV14-US176-US25BUS` | ✅ Live HLS |
| 3 | US-64 E — US-25 BUS S | `4873` | 3.893 mi | `CCTV14-US64-E_US25BUS_S` | ✅ Live HLS |
| 4 | US-64 — Linda Vista Dr | `4872` | 3.908 mi | `CCTV14-US64-LINDAVISTA` | ✅ Live HLS |

DriveNC's raw `Roadway` values for IDs `4873` and `4872` incorrectly say
`US-66` and `US-65`; their official `Location`/`Description` fields identify
US-64. The labels use those location fields. The next eligible non-interstate
feed is ID `4874`, 3.952 miles away.

Every selected master manifest and current media segment returned HTTP 200
during verification. Every fallback page also returned HTTP 200 without an
`X-Frame-Options` or frame-blocking CSP header. Fallback URL template:
`https://www.drivenc.gov/map/Cctv/{id}`.

To change the roster, edit `CAMERAS` in `public/cameras.js` and
`WANTED_CAMERA_IDS` in `src/worker.js`, keeping the numeric IDs and order
identical. Run `npm run check` afterward. DriveNC's numeric API ID—not a GUID
from an old public route—is the canonical identifier.

## Layout contract

The camera area is a four-column dense grid. The first camera is a 3×3 hero;
the remaining seven interstate feeds fill around and immediately below it;
the final four non-interstate feeds form the last complete row. The arithmetic
is fixed: 9 hero cells + 11 small cells = 20 cells = five rows × four columns.

Preserve the camera order and the `.camera-tile.priority` 3×3 rule unless a
layout redesign is intentional. The TV design otherwise remains the original:
near-black panels, scanline/vignette overlay, amber focus treatment, cyan
weather instrumentation, and green/red live/error status dots.

## Architecture

```text
Browser (TV) ──> public/index.html / style.css / cameras.js / weather.js
                     │                              │
                     │ GET /api/cameras              │ direct fetch
                     ▼                              ▼
              src/worker.js                  api.weather.gov
        (proxy + 90-second cache)             RainViewer radar API
                     │
                     │ keyed server-side request
                     ▼
              DriveNC Cameras API
```

- `src/worker.js` handles `GET /api/cameras` and delegates all other requests
  to the static `ASSETS` binding.
- The Worker caches the upstream camera metadata for 90 seconds, protecting
  DriveNC's 10 requests / 60 seconds limit and keeping the key out of the
  browser.
- Current conditions and the three-day forecast refresh every 12 minutes via
  the NWS point metadata and its nearest observation station.
- RainViewer supplies the most recent six radar frames. The frame list refreshes
  every five minutes and animates every 600 ms. Leaflet and `hls.js` are loaded
  by `public/index.html` from CDNs.
- The front end has no framework or build step.

## Local development

Requirements: Node.js 22+ and a free DriveNC Cameras API key.

```bash
npm ci
cp .dev.vars.example .dev.vars
# Put DRIVENC_API_KEY in .dev.vars; never commit this ignored file.
npm run check
npm run dev
```

Without a key, `/api/cameras` returns `[]` and every tile uses its public
DriveNC iframe fallback. With a key, each tile upgrades to HLS and falls back
individually if playback does not begin within about 18 seconds. Metadata is
retried every 90 seconds.

## Cloudflare deployment

`wrangler.jsonc` is configured for a Worker named
`east-flat-rock-cctv-weather` with static assets and `keep_vars: true`. The
dedicated [GitHub repository](https://github.com/lboone-bc/east-flat-rock-cctv-weather)
and [Cloudflare production build](https://dash.cloudflare.com/d1d2cef3519480a708037f7211b49b84/workers/services/view/east-flat-rock-cctv-weather/production/builds/f35bfc59-e036-412d-9f2b-33cf3ca69f5a)
have been created for this replica.

1. Add or confirm the encrypted secret with
   `npx wrangler secret put DRIVENC_API_KEY` or through **Settings → Variables
   and Secrets** in the dashboard.
2. Confirm the production build succeeds and record the actual `*.workers.dev`
   URL here and in `REFERENCE_INDEX.md`.
3. Verify `/api/cameras` returns all 12 IDs and leave the wall running on the
   target display.

The historic Cloudflare Git-integration variable-loss issue
([workers-sdk#8871](https://github.com/cloudflare/workers-sdk/issues/8871)) was
fixed by merged PR
[#10865](https://github.com/cloudflare/workers-sdk/pull/10865) in October 2025.
Current Wrangler documentation says secrets are not removed by deploys, and
this project additionally sets `keep_vars: true` for dashboard-managed plain
variables.

If all feeds unexpectedly fall back, request `/api/cameras`. An empty array
with HTTP 200 means `DRIVENC_API_KEY` is absent; HTTP 502 indicates an upstream
request failure. Re-add the secret and allow a few seconds for propagation.

## Validation

```bash
npm run check
npm run deploy -- --dry-run
git diff --check
```

Before release, also verify the NWS point lookup, a current manifest and media
segment for every feed, the iframe fallback with the key absent, and the full
layout at 1920×1080. See `REFERENCE_INDEX.md` for the ownership map and full
camera evidence.

## Data sources

| Source | Used for | Key | Notes |
|---|---|---|---|
| [DriveNC Cameras API](https://www.drivenc.gov/help/endpoint/cameras) | Camera metadata and media URLs | Yes (server-side) | 10 requests / 60 seconds; Worker-cached |
| [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | Current conditions and forecast | No | Direct browser requests |
| [RainViewer Weather Maps API](https://www.rainviewer.com/api.html) | Animated radar tiles | No | Attribution is required and present |
| [Leaflet](https://leafletjs.com/) | Radar rendering | No | CDN |
| [CARTO basemaps](https://carto.com/basemaps) | Radar base/labels | No | CDN |
| [hls.js](https://github.com/video-dev/hls.js) | HLS playback outside Safari/iOS | No | CDN |
| [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) | Worker deployment behavior | No | `keep_vars` reference |
