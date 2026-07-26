# East Flat Rock CCTV + Weather Wall

An always-on TV dashboard for live conditions around **103 Education Dr,
Flat Rock, NC 28731**. It preserves the original traffic-operations-console
layout while moving every location-specific input to East Flat Rock:

- live weather and a radar map centered on the address;
- the eight closest enabled interstate cameras in the chosen operational order;
- the closest interstate camera as the initial large focus feed, with any
  camera selectable as the feature by clicking its tile; and
- the four closest enabled non-interstate road cameras in the default bottom
  row.

The app is static HTML/CSS/JavaScript plus one small Cloudflare Worker. The
Worker protects the DriveNC API key, caches camera metadata, and serves the
static assets.

## Work plan / rollout

- [x] Resolve and cross-check the address center.
- [x] Rank the live DriveNC inventory by straight-line distance.
- [x] Verify all 12 selected HLS manifests, current media segments, and public
      snapshot fallbacks.
- [x] Update weather, radar, camera ordering, branding, Worker identity, and
      configuration integrity checks.
- [x] Add durable root guidance in `AGENTS.md` and `REFERENCE_INDEX.md`.
- [x] Create the dedicated GitHub repository and change the local `origin` to
      `lboone-bc/east-flat-rock-cctv-weather`.
- [x] Create the dedicated Cloudflare service/build target,
      `east-flat-rock-cctv-weather`.
- [x] Set/confirm `DRIVENC_API_KEY`, confirm the production build, and record
      the actual deployed URL in this README and `REFERENCE_INDEX.md`.
- [x] Restore live playback through DriveNC's current signed-HLS flow while
      preventing unsigned NCDOT `XEngine` HTTP Basic challenges from reaching
      browsers.
- [ ] Reauthorize Cloudflare's GitHub app for this repository so pushes to
      `main` resume automatic builds; direct Wrangler deploys work meanwhile.
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
5. Put the closest interstate first with `priority: true`; display the other
   seven in the requested MM59 → MM54.2 → MM51.5 → MM49 → MM48.2 → MM48 →
   MM46.2 operational order. DOM order is a layout contract.

### Eight closest interstate feeds — display order

| Rank | Label | DriveNC ID | Distance | DriveNC location | Status |
|---:|---|---:|---:|---|---|
| **1 / focus** | **I-26 MM53 — Upward Rd** | `5131` | 0.510 mi | `CCTV14-I26-53W_UPWARD` | ✅ Live HLS |
| 2 | I-26 MM59 — Holbert Cove Rd | `5265` | 5.053 mi | `CCTV14-I26-59N_HOLBERTCOVE` | ✅ Live HLS |
| 3 | I-26 MM54.2 — US-25 | `5264` | 0.806 mi | `CCTV14-I26-54.2S_US25` | ✅ Live HLS |
| 4 | I-26 MM51.5 — Tracy Grove Rd | `6102` | 1.900 mi | `CCTV14-I26-51.5W_TRACYGROVE` | ✅ Live HLS |
| 5 | I-26 MM49 — US-64 | `4878` | 3.997 mi | `CCTV14-I26-49W_US64` | ✅ Live HLS |
| 6 | I-26 MM48.2 | `6119` | 5.642 mi | `CCTV14-I26-48.2E` | ✅ Live HLS |
| 7 | I-26 MM48 | `4877` | 5.663 mi | `CCTV14-I26-48W` | ✅ Live HLS |
| 8 | I-26 MM46.2 | `6097` | 7.557 mi | `CCTV14-I26-46.2E` | ✅ Live HLS |

The next interstate feed is ID `6101`, 8.578 miles away, which confirms the
cutoff. The MM59/Holbert Cove feed is in Polk County, so the operations header
correctly reflects both Henderson and Polk counties.

### Four closest non-interstate feeds — bottom row

| Rank | Label | DriveNC ID | Distance | DriveNC location | Status |
|---:|---|---:|---:|---|---|
| 1 | US-176 — Upward Rd | `5253` | 1.739 mi | `CCTV14-US176_UpwardRd` | ⚠️ Upstream no-feed fallback (2026-07-26) |
| 2 | US-176 — US-25 BUS | `4867` | 3.523 mi | `CCTV14-US176-US25BUS` | ✅ Live HLS |
| 3 | US-64 E — US-25 BUS S | `4873` | 3.893 mi | `CCTV14-US64-E_US25BUS_S` | ✅ Live HLS |
| 4 | US-64 — Linda Vista Dr | `4872` | 3.908 mi | `CCTV14-US64-LINDAVISTA` | ✅ Live HLS |

DriveNC's raw `Roadway` values for IDs `4873` and `4872` incorrectly say
`US-66` and `US-65`; their official `Location`/`Description` fields identify
US-64. The labels use those location fields. The next eligible non-interstate
feed is ID `4874`, 3.952 miles away.

Every selected master manifest and current media segment returned HTTP 200
during the original 2026-07-18 verification. Every fallback URL also returned
HTTP 200. Fallback URL template:
`https://www.drivenc.gov/map/Cctv/{id}`.

Runtime behavior recorded **2026-07-26**: DriveNC continued to report all 12
views as enabled and returned populated `VideoUrl` values, but those values are
now unsigned. Requesting one directly returns HTTP 401 with
`WWW-Authenticate: Basic realm="XEngine"`. Inspection of DriveNC's working
browser player established the supported flow:

1. `GET /Camera/GetVideoUrl?imageId={numeric-id}` returns a short-lived grant.
2. DriveNC posts that grant as JSON to NCDOT's
   `GetSecureTokenUriBySourceId` service.
3. The returned `?token=...` suffix is appended to the API's HLS base URL.

The public exchange requires neither a DriveNC account password nor browser
session cookies. A signed master manifest, media playlist, and current MP4
segment all returned HTTP 200; the corresponding unsigned manifest returned
the `XEngine` challenge. The Worker now performs that exchange server-side,
strictly validates the signed NCDOT URL, probes for a valid `#EXTM3U` manifest,
and caches each successful signed URL for five minutes. DriveNC's bundle
contains an optional 60-second refresh loop, but the current page configuration
disables it, and the official player remained live on one token for more than
11 minutes. A playback failure requests a rate-limited refresh for only that
camera. If signing or playback fails, only the public image fallback reaches
the browser. In the same audit, 11 East Flat Rock signed feeds passed the
master/media/current-segment checks; ID `5253` signed successfully but its
origin master returned HTTP 404, matching DriveNC's no-live-feed placeholder.

To change the roster, edit `CAMERAS` in `public/cameras.js` and
`WANTED_CAMERA_IDS` in `src/worker.js`, keeping the numeric IDs and order
identical. Run `npm run check` afterward. DriveNC's numeric API ID—not a GUID
from an old public route—is the canonical identifier.

## Layout contract

The camera area is a four-column dense grid. The first camera starts as the
3×3 hero; clicking any other tile transfers the hero treatment to that camera
without rebuilding its media player or changing the canonical DOM order. The
active hero is explicitly anchored at the top left, and the other 11 tiles
dense-fill the remaining cells. In the default state, the final four
non-interstate feeds form the last complete row. The arithmetic is fixed:
9 hero cells + 11 small cells = 20 cells = five rows × four columns.

Preserve the camera order, click-to-feature interaction, and the
`.camera-tile.priority` top-left 3×3 rule unless a layout redesign is
intentional. The TV design otherwise remains the original: near-black panels,
scanline/vignette overlay, amber focus treatment, cyan weather instrumentation,
and green/red live/error status dots.

## Architecture

```text
Browser (TV) ──> public/index.html / style.css / cameras.js / weather.js
                     │                              │
                     │ GET /api/cameras              │ direct fetch
                     ▼                              ▼
              src/worker.js                  api.weather.gov
        (proxy + signed-HLS gate)              RainViewer radar API
                     │
                     ├── keyed metadata request ──> DriveNC Cameras API
                     ├── public camera grant ─────> DriveNC GetVideoUrl
                     ├── grant POST ──────────────> NCDOT secure-token API
                     └── signed manifest probe ───> NCDOT HLS origin
```

- `src/worker.js` handles `GET /api/cameras`, exchanges each enabled camera ID
  for a short-lived signed HLS URL, verifies its manifest, and delegates all
  other requests to the static `ASSETS` binding.
- The Worker caches the upstream camera metadata for 90 seconds, protecting
  DriveNC's 10 requests / 60 seconds limit and keeping the key out of the
  browser. Its per-camera signed-media cache renews healthy HLS URLs after five
  minutes and retries unavailable feeds after 10 seconds. Signing is
  concurrency-limited and transient HTTP 429 responses are retried with a
  short backoff. To remain below
  [Cloudflare Workers Free's 50 external subrequests per invocation](https://developers.cloudflare.com/workers/platform/limits/),
  one response refreshes at most four due cameras; a cold isolate upgrades the
  remaining groups through a fair rotating selection on the 10-second retry
  cadence, so persistently unavailable early feeds cannot starve later healthy
  ones. Those public grants are separate from the keyed inventory request.
  Overlapping `/api/cameras` polls are serialized: a collision receives a
  retryable HTTP 503 while the browser preserves its current tiles. The keyed
  inventory request aborts after 15 seconds, and the browser abandons a stuck
  camera API request after 60 seconds, clearing both in-progress guards for
  another recovery attempt.
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
DriveNC image fallback. With a key, each tile upgrades only after the Worker
obtains a signed URL and receives a successful manifest beginning with
`#EXTM3U`. A feed falls back individually if playback does not begin within
about 18 seconds or stops advancing for 25 seconds, then requests a new
server-side signing/health check after 10 seconds. Camera inventory remains
cached for 90 seconds, healthy signed URLs renew after five minutes, and
unavailable HLS, an empty response, or a failed response retries after 10
seconds. A playback failure forces a rate-limited check for that camera only,
so one unavailable source cannot cause all 12 feeds to re-sign repeatedly.
On a cold Worker isolate, no more than four due feeds sign in one response;
the remaining snapshot tiles upgrade over the next 10-second recovery calls.
That selection rotates fairly even if an earlier feed stays unavailable.
The upstream inventory fetch is capped at 15 seconds and the browser camera
request at 60 seconds; either failure preserves current tiles and enters the
normal 10-second retry cycle. Focus, visibility, and network-restoration events
trigger an immediate cache-aware check.

## Cloudflare deployment

`wrangler.jsonc` is configured for a Worker named
`east-flat-rock-cctv-weather` with static assets and `keep_vars: true`. The
dedicated [GitHub repository](https://github.com/lboone-bc/east-flat-rock-cctv-weather)
and [Cloudflare production build](https://dash.cloudflare.com/d1d2cef3519480a708037f7211b49b84/workers/services/view/east-flat-rock-cctv-weather/production/builds/f35bfc59-e036-412d-9f2b-33cf3ca69f5a)
have been created for this replica.

Production wall: [east-flat-rock-cctv-weather.lboone.workers.dev](https://east-flat-rock-cctv-weather.lboone.workers.dev/)

The current runtime was deployed directly with Wrangler on **2026-07-26** as
version `1efc509f-b582-48ae-af07-4302f2b39d5a`. Cloudflare has the correct
repository and production branch configured but currently reports its GitHub
account connection as disconnected. Until the GitHub app is reauthorized,
`git push` updates the repository but does not start a Cloudflare build.

1. Add or confirm the encrypted secret with
   `npx wrangler secret put DRIVENC_API_KEY` or through **Settings → Variables
   and Secrets** in the dashboard. This is confirmed for production as of
   **2026-07-26**.
2. Confirm the production build succeeds and keep the actual `*.workers.dev`
   URL here and in `REFERENCE_INDEX.md` current.
3. Verify `/api/cameras` returns all 12 IDs, click several small tiles to
   confirm each replaces the feature without interrupting playback, and leave
   the wall running on the target display.

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
The wall retries an empty response every 10 seconds. A red camera status means
HLS signing/playback failed or stalled and is entering its automatic
server-gated recovery cycle; a working snapshot or advancing HLS feed displays
green. Do not add a DriveNC username/password to Cloudflare: only the existing
developer `DRIVENC_API_KEY` is a secret, and the HLS signing grants are obtained
from DriveNC's public runtime endpoints.

## Validation

```bash
npm run check
npm run deploy -- --dry-run
git diff --check
```

Before release, also verify the NWS point lookup, DriveNC grant and NCDOT
secure-token exchange, a signed master/media playlist/current segment for every
healthy HLS feed, the public image fallback with the key absent or signing
unavailable, click-to-feature behavior, and the full layout at 1920×1080. See
`REFERENCE_INDEX.md` for the ownership map and full camera evidence.

## Data sources

| Source | Used for | Key | Notes |
|---|---|---|---|
| [DriveNC Cameras API](https://www.drivenc.gov/help/endpoint/cameras) | Camera metadata and media URLs | Yes (server-side) | 10 requests / 60 seconds; Worker-cached |
| DriveNC `Camera/GetVideoUrl` + NCDOT secure-token API | Short-lived HLS query token | No account login | Public runtime flow used by DriveNC's own player; tokens are never logged |
| [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | Current conditions and forecast | No | Direct browser requests |
| [RainViewer Weather Maps API](https://www.rainviewer.com/api.html) | Animated radar tiles | No | Attribution is required and present |
| [Leaflet](https://leafletjs.com/) | Radar rendering | No | CDN |
| [CARTO basemaps](https://carto.com/basemaps) | Radar base/labels | No | CDN |
| [hls.js](https://github.com/video-dev/hls.js) | HLS playback outside Safari/iOS | No | CDN |
| [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) | Worker deployment behavior | No | `keep_vars` reference |
