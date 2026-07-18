# Reference index — East Flat Rock CCTV + Weather Wall

Last context audit: **2026-07-18**

This file is the durable evidence and source-ownership index for the project.
See `README.md` for setup and rollout steps; see `AGENTS.md` for change rules.

## Canonical identity and location

| Item | Canonical value | Source / owner |
|---|---|---|
| GitHub/package/Worker slug | `east-flat-rock-cctv-weather` | `package.json`, `package-lock.json`, `wrangler.jsonc` |
| Address | 103 Education Dr, Flat Rock, NC 28731 | Henderson County active address record |
| Display locality | East Flat Rock, NC | NWS MapClick label plus project naming decision |
| Center | `35.294292, -82.398257` | Henderson County geometry rounded from `35.294292079672346, -82.398257397922066` |
| County / jurisdiction | Henderson County / unincorporated | Henderson County address record |
| NWS point | `35.2943,-82.3983` → `GSP/62,62` | NWS-supported four-decimal precision |
| Forecast zone / county zone | `NCZ065` / `NCC089` | NWS point metadata |
| NWS radar / first station | `KGSP` / `KAVL` | NWS point and station-list metadata |
| Radar zoom | `8` | Exact-replica regional view decision |

Primary location references:

- [Henderson County active address-point query](https://gisweb.hendersoncountync.gov/arcgis/rest/services/Addresses/MapServer/0/query?where=Add_Number%3D103%20AND%20UPPER%28St_Name%29%3D%27EDUCATION%27&outFields=REID%2CFullAddress%2CStatus%2CMSAGComm%2CPost_Comm%2CPost_Code%2CLong%2CLat%2CInc_Muni%2CJURISDICTION%2CSOURCE%2Caddress_last_edited_date&returnGeometry=true&outSR=4326&f=pjson)
- [Henderson County address layer metadata](https://gisweb.hendersoncountync.gov/arcgis/rest/services/Addresses/MapServer/0)
- [NWS point metadata](https://api.weather.gov/points/35.2943,-82.3983)
- [NWS MapClick for the exact center](https://forecast.weather.gov/MapClick.php?lat=35.2943&lon=-82.3983)
- [Esri point-address cross-check](https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=103%20Education%20Dr%2C%20Flat%20Rock%2C%20NC%2028731&f=json&outFields=Match_addr%2CAddr_type&maxLocations=3)
- [U.S. Census Geocoder API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html)

The NWS `/points` payload currently reports `Hendersonville` in its
`relativeLocation` field, but the public NWS forecast page for the exact point
labels it `East Flat Rock NC`. The UI hardcodes the intended display locality
and only uses NWS URLs from point metadata for observations/forecast data.

## Camera roster and evidence

Selection snapshot: live DriveNC Cameras API, **2026-07-18 13:40 EDT**, 1,155
records. Haversine distances use Earth radius 3,958.7613 miles and the
canonical center. All selected records had `Views[0].Status = Enabled`, a
populated `.m3u8` URL, a master and current media segment returning HTTP 200,
and an iframe viewer returning HTTP 200 without frame-blocking headers.

| Wall rank | Group | ID | Display label | Distance | API Location / Description | Raw roadway / direction | Camera coordinate |
|---:|---|---:|---|---:|---|---|---|
| **1** | Interstate / **focus** | `5131` | I-26 MM53 — Upward Rd | 0.510 mi | `CCTV14-I26-53W_UPWARD` | I-26 / Westbound | `35.297370, -82.406480` |
| 2 | Interstate | `5264` | I-26 MM54.2 — US-25 | 0.806 mi | `CCTV14-I26-54.2S_US25` | I-26 / Westbound | `35.282680, -82.399680` |
| 3 | Interstate | `6102` | I-26 MM51.5 — Tracy Grove Rd | 1.900 mi | `CCTV14-I26-51.5W_TRACYGROVE` | I-26 / Westbound | `35.315260, -82.420060` |
| 4 | Interstate | `4878` | I-26 MM49 — US-64 | 3.997 mi | `CCTV14-I26-49W_US64` | I-26 / Southbound | `35.341170, -82.439810` |
| 5 | Interstate | `5265` | I-26 MM59 — Holbert Cove Rd | 5.053 mi | `CCTV14-I26-59N_HOLBERTCOVE` | I-26 / Westbound | `35.248770, -82.328140` |
| 6 | Interstate | `6119` | I-26 MM48.2 | 5.642 mi | `CCTV14-I26-48.2E` | I-26 / Eastbound | `35.359530, -82.458460` |
| 7 | Interstate | `4877` | I-26 MM48 | 5.663 mi | `CCTV14-I26-48W` | I-26 / Southbound | `35.359820, -82.458610` |
| 8 | Interstate | `6097` | I-26 MM46.2 | 7.557 mi | `CCTV14-I26-46.2E` | I-26 / Eastbound | `35.379360, -82.482540` |
| 9 | Bottom row | `5253` | US-176 — Upward Rd | 1.739 mi | `CCTV14-US176_UpwardRd` | US-176 / Eastbound | `35.291220, -82.428870` |
| 10 | Bottom row | `4867` | US-176 — US-25 BUS | 3.523 mi | `CCTV14-US176-US25BUS` | US-176 / Southbound | `35.307576, -82.458580` |
| 11 | Bottom row | `4873` | US-64 E — US-25 BUS S | 3.893 mi | `CCTV14-US64-E_US25BUS_S` | **US-66 (bad upstream value)** / Northbound | `35.319920, -82.459740` |
| 12 | Bottom row | `4872` | US-64 — Linda Vista Dr | 3.908 mi | `CCTV14-US64-LINDAVISTA` | **US-65 (bad upstream value)** / Southbound | `35.333050, -82.448740` |

Cutoff checks:

- Ninth interstate: ID `6101`, 8.578 mi.
- Fifth non-interstate: ID `4874`, 3.952 mi.
- The selected I-26 set spans Henderson and Polk counties; ID `5265` is the
  Polk County feed in the roster.
- IDs `6119` and `4877` are separate enabled feeds near MM48; they are not a
  duplicate ID and both rank within the closest eight.
- IDs `4873` and `4872` are labeled from DriveNC `Location`/`Description` and
  Henderson County road data because their raw `Roadway` values are typos.

Public fallback for any row:
`https://www.drivenc.gov/map/Cctv/{numeric-id}`.

Camera/road references:

- [DriveNC Cameras API documentation](https://www.drivenc.gov/help/endpoint/cameras)
- [Henderson County Roads service](https://gisweb.hendersoncountync.gov/arcgis/rest/services/Roads/MapServer)
- [NCDOT I-26 Exit 53 / Upward Road reference](https://www.ncdot.gov/news/press-releases/Pages/2024/2024-08-05-i-26-overnight-tentative.aspx)

## Source ownership map

| Concern | Source of truth | Synchronized consumers / notes |
|---|---|---|
| Browser roster, labels, focus, DOM order | `public/cameras.js` → `CAMERAS` | Must match Worker IDs; ordering controls layout |
| Worker allowlist | `src/worker.js` → `WANTED_CAMERA_IDS` | Must exactly match browser roster |
| Address center, locality, radar zoom | `public/weather.js` → `LOCATION` | Visible static labels also live in `public/index.html` |
| Page title, county, weather/radar labels | `public/index.html` | Keep aligned with `LOCATION.label` |
| Grid/hero layout | `public/style.css` → `.cameras`, `.camera-tile.priority` | Four columns, 3×3 hero, dense placement |
| Worker name/bindings/variable retention | `wrangler.jsonc` | New Worker identity; `keep_vars: true` |
| Package name/runtime/check command | `package.json`, `package-lock.json` | Node 22+ |
| Operations and rollout plan | `README.md` | Update after provisioning/deployment |
| Future-agent invariants | `AGENTS.md` | Update with any contract change |

## Runtime contracts and cadences

| Behavior | Value | Owner |
|---|---:|---|
| Browser camera metadata refresh | 90 seconds | `public/cameras.js` |
| Worker camera cache | 90 seconds | `src/worker.js` |
| HLS connection watchdog | 18 seconds | `public/cameras.js` |
| Weather/forecast refresh | 12 minutes | `public/weather.js` |
| Radar frame-list refresh | 5 minutes | `public/weather.js` |
| Radar animation step | 600 ms | `public/weather.js` |
| Radar history | Last 6 past frames | `public/weather.js` |
| DriveNC secret | `DRIVENC_API_KEY` | `.dev.vars` locally; encrypted Worker secret in production |

## Deployment record

| Item | Current state |
|---|---|
| GitHub repository | [lboone-bc/east-flat-rock-cctv-weather](https://github.com/lboone-bc/east-flat-rock-cctv-weather) |
| Current local `origin` | `https://github.com/lboone-bc/east-flat-rock-cctv-weather.git` |
| Cloudflare Worker name | `east-flat-rock-cctv-weather` in `wrangler.jsonc` |
| Cloudflare build | [Production build supplied 2026-07-18](https://dash.cloudflare.com/d1d2cef3519480a708037f7211b49b84/workers/services/view/east-flat-rock-cctv-weather/production/builds/f35bfc59-e036-412d-9f2b-33cf3ca69f5a) |
| Actual deployed URL | **TBD after production build confirmation** |
| Production secret | **TBD; confirm `DRIVENC_API_KEY` after provisioning** |

Do not infer the account's `workers.dev` subdomain from the Worker name. Record
the actual URL here and in `README.md` after deployment.

## Verification index

Local/config checks:

```bash
npm run check
npm run deploy -- --dry-run
git diff --check
```

Release checks:

1. Use Node 22+ for Wrangler.
2. Confirm `GET /api/cameras` returns all 12 expected numeric IDs.
3. Fetch each HLS master, its current media playlist, and a current segment.
4. Confirm every numeric viewer fallback is iframe-embeddable.
5. Confirm the NWS point resolves to `GSP/62,62`.
6. Inspect at 1920×1080: focus camera first, seven remaining interstate
   feeds before the final four-camera bottom row, centered radar marker, no
   scrolling, and legible labels.
7. Repeat with no local key to verify all 12 fallbacks.

External runtime/docs references:

- [NWS API documentation](https://www.weather.gov/documentation/services-web-api)
- [RainViewer API](https://www.rainviewer.com/api.html)
- [Leaflet](https://leafletjs.com/)
- [hls.js](https://github.com/video-dev/hls.js)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare issue #8871](https://github.com/cloudflare/workers-sdk/issues/8871) and merged fix [PR #10865](https://github.com/cloudflare/workers-sdk/pull/10865)
