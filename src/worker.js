// Single Worker entry point for the Cloudflare deploy pipeline that this
// project's Git integration actually runs (`npx wrangler deploy`), which
// does NOT understand the old Pages-only `/functions` directory convention.
// This Worker does two things:
//   1. Handles GET /api/cameras itself (the DriveNC proxy/cache).
//   2. Falls through to the ASSETS binding for everything else, which
//      serves the static site out of `public/` (configured in
//      wrangler.jsonc).

// DriveNC's official Cameras API uses a numeric `Id` per camera — the GUIDs
// used in drivenc.gov's public viewer-page URLs do NOT appear anywhere in
// this API's data. These Ids were selected by calculating straight-line
// distance from 103 Education Dr against the full API dump (see README).
// Confirmed field: Views[0].VideoUrl is a live HLS (.m3u8) stream.
const WANTED_CAMERA_IDS = [
  5131, // I-26 MM53 — Upward Rd (priority)
  5265, // I-26 MM59 — Holbert Cove Rd
  5264, // I-26 MM54.2 — US-25
  6102, // I-26 MM51.5 — Tracy Grove Rd
  4878, // I-26 MM49 — US-64
  6119, // I-26 MM48.2
  4877, // I-26 MM48
  6097, // I-26 MM46.2
  5253, // US-176 — Upward Rd
  4867, // US-176 — US-25 BUS
  4873, // US-64 E — US-25 BUS S (API Roadway incorrectly says US-66)
  4872, // US-64 — Linda Vista Dr (API Roadway incorrectly says US-65)
];

const CACHE_TTL_MS = 90_000;

// Module-level cache. Persists for the lifetime of a given Worker isolate —
// not guaranteed across every request, but in practice avoids most redundant
// upstream calls between the ~90s refresh cycles the front end uses.
let cache = { data: null, fetchedAt: 0 };

function extractMedia(camera) {
  const view = camera.Views?.[0] || {};
  return {
    id: camera.Id,
    videoUrl: view.VideoUrl || null, // live HLS (.m3u8) stream
    imageUrl: null, // none of our selected cameras use a still-image feed; kept for completeness
    viewerUrl: view.Url || null,
    status: view.Status || "Unknown",
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      // The Worker already keeps a short in-memory upstream cache. Browser or
      // intermediary caching can strand a long-running wall on an empty
      // pre-secret response, so camera metadata itself should always revalidate.
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

async function handleCamerasApi(env) {
  const now = Date.now();

  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return jsonResponse(cache.data);
  }

  const key = env.DRIVENC_API_KEY;
  if (!key) {
    // No key configured yet: front end falls back to per-camera viewer-page
    // iframes when this returns an empty array, so the wall stays usable.
    return jsonResponse([]);
  }

  try {
    const upstream = await fetch(
      `https://www.drivenc.gov/api/v2/get/cameras?key=${encodeURIComponent(key)}&format=json`
    );
    if (!upstream.ok) {
      throw new Error(`DriveNC API returned ${upstream.status}`);
    }
    const cameras = await upstream.json();

    const byId = new Map(cameras.map((camera) => [camera.Id, camera]));
    const matched = WANTED_CAMERA_IDS.map((id) => byId.get(id))
      .filter(Boolean)
      .map(extractMedia);

    cache = { data: matched, fetchedAt: now };
    return jsonResponse(matched);
  } catch (err) {
    // Serve stale cache if we have it rather than failing the whole tile grid.
    if (cache.data) return jsonResponse(cache.data);
    return jsonResponse([], 502, { "x-camera-proxy-error": String(err) });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/cameras" && request.method === "GET") {
      return handleCamerasApi(env);
    }

    return env.ASSETS.fetch(request);
  },
};
