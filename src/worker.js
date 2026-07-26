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
// Views[0].VideoUrl is the unsigned HLS (.m3u8) base URL. DriveNC's own
// player exchanges the numeric camera ID for a short-lived query token before
// loading that URL; an unsigned request receives an XEngine Basic challenge.
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
const HLS_HEALTH_RETRY_MS = 10_000;
const HLS_SIGNED_URL_REFRESH_MS = 300_000;
const HLS_SIGNED_URL_MAX_STALE_MS = 900_000;
const HLS_PROBE_TIMEOUT_MS = 15_000;
const HLS_SIGNING_TIMEOUT_MS = 8_000;
const HLS_SIGNING_CONCURRENCY = 3;
const HLS_MAX_REFRESHES_PER_REQUEST = 4;
const HLS_429_RETRY_DELAYS_MS = [250, 750];
const DRIVENC_INVENTORY_TIMEOUT_MS = 15_000;
const DRIVENC_VIDEO_GRANT_URL =
  "https://www.drivenc.gov/Camera/GetVideoUrl";
const NCDOT_SECURE_TOKEN_URL =
  "https://vds.nc.insight-atms.com/api/SecureTokenUri/GetSecureTokenUriBySourceId";

// Module-level caches persist for the lifetime of a given Worker isolate.
// Inventory stays at the developer API's 90-second cadence. Signed media is
// tracked per camera so one unavailable feed cannot make all 12 re-sign every
// 10 seconds.
let cameraCache = { source: null, fetchedAt: 0 };
let cameraMetadataRefreshInProgress = false;
let cameraApiRequestInProgress = false;
let signedMediaSelectionCursor = 0;
const signedMediaCache = new Map();
const signedMediaRefreshReservations = new Set();

function snapshotUrl(id) {
  return `https://www.drivenc.gov/map/Cctv/${id}`;
}

function extractMedia(camera) {
  const view = camera.Views?.[0] || {};
  return {
    id: camera.Id,
    unsignedVideoUrl: view.VideoUrl || null,
    viewerUrl: snapshotUrl(camera.Id),
    status: view.Status || "Unknown",
  };
}

function parseExpectedHlsUrl(videoUrl, { requireToken = false } = {}) {
  try {
    const parsedUrl = new URL(videoUrl);
    const params = [...parsedUrl.searchParams.entries()];
    const hasExpectedQuery = requireToken
      ? params.length === 1 &&
        params[0][0] === "token" &&
        /^[a-f0-9]{64}$/i.test(params[0][1])
      : params.length === 0;

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.port !== "8887" ||
      !/^[a-z0-9-]+\.services\.ncdot\.gov$/i.test(parsedUrl.hostname) ||
      !/^\/chan-[a-z0-9_-]+\/index\.m3u8$/i.test(parsedUrl.pathname) ||
      parsedUrl.hash ||
      !hasExpectedQuery
    ) {
      return null;
    }

    return parsedUrl;
  } catch {
    return null;
  }
}

async function fetchWith429Retry(createRequest, init) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(createRequest(attempt), init);
    if (
      response.status !== 429 ||
      attempt >= HLS_429_RETRY_DELAYS_MS.length
    ) {
      return response;
    }

    try {
      await response.body?.cancel();
    } catch {
      // Nothing else is needed from a throttled response.
    }
    await new Promise((resolve) =>
      setTimeout(resolve, HLS_429_RETRY_DELAYS_MS[attempt])
    );
  }
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Releasing a failed upstream body is best-effort.
  }
}

async function requestSignedHlsUrl(media) {
  if (media.status !== "Enabled") return null;

  const unsignedUrl = parseExpectedHlsUrl(media.unsignedVideoUrl);
  if (!unsignedUrl || unsignedUrl.search) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HLS_SIGNING_TIMEOUT_MS);

  try {
    // This is the same public exchange used by DriveNC's current browser
    // bundle. It does not use a DriveNC login, browser cookies, or a password.
    const grantResponse = await fetchWith429Retry(
      (attempt) => {
        const grantUrl = new URL(DRIVENC_VIDEO_GRANT_URL);
        grantUrl.searchParams.set("imageId", String(media.id));
        grantUrl.searchParams.set("_", String(Date.now() + attempt));
        return grantUrl.href;
      },
      {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      }
    );
    if (!grantResponse.ok) {
      await cancelResponseBody(grantResponse);
      return null;
    }

    const grant = await grantResponse.json();
    const sourceIdIsSafe =
      (typeof grant?.sourceId === "string" ||
        (typeof grant?.sourceId === "number" &&
          Number.isFinite(grant.sourceId))) &&
      String(grant.sourceId).length <= 128;
    const systemSourceIdIsSafe =
      (typeof grant?.systemSourceId === "string" ||
        (typeof grant?.systemSourceId === "number" &&
          Number.isFinite(grant.systemSourceId))) &&
      String(grant.systemSourceId).length <= 128;
    if (
      !/^[a-f0-9-]{36}$/i.test(grant?.token || "") ||
      !sourceIdIsSafe ||
      !systemSourceIdIsSafe
    ) {
      return null;
    }

    const tokenResponse = await fetchWith429Retry(
      () => NCDOT_SECURE_TOKEN_URL,
      {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: grant.token,
          sourceId: grant.sourceId,
          systemSourceId: grant.systemSourceId,
        }),
        redirect: "manual",
        signal: controller.signal,
      }
    );
    if (!tokenResponse.ok) {
      await cancelResponseBody(tokenResponse);
      return null;
    }

    const signedSuffix = await tokenResponse.json();
    if (
      typeof signedSuffix !== "string" ||
      !signedSuffix.startsWith("?token=")
    ) {
      return null;
    }

    const signedUrl = new URL(signedSuffix, unsignedUrl);
    const verifiedSignedUrl = parseExpectedHlsUrl(signedUrl, {
      requireToken: true,
    });
    if (
      !verifiedSignedUrl ||
      verifiedSignedUrl.origin !== unsignedUrl.origin ||
      verifiedSignedUrl.pathname !== unsignedUrl.pathname
    ) {
      return null;
    }

    return verifiedSignedUrl.href;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeHlsManifest(videoUrl) {
  const parsedUrl = parseExpectedHlsUrl(videoUrl, { requireToken: true });
  if (!parsedUrl) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HLS_PROBE_TIMEOUT_MS);

  try {
    // Probe the signed manifest server-side before exposing its short-lived
    // URL to a browser. A failed grant or playlist never reaches <video>.
    const response = await fetch(parsedUrl, {
      headers: {
        accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*;q=0.1",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      return false;
    }

    const manifest = await response.text();
    return manifest.trimStart().startsWith("#EXTM3U");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAvailableMedia(media) {
  const signedVideoUrl = await requestSignedHlsUrl(media);
  const hlsAvailable =
    Boolean(signedVideoUrl) && (await probeHlsManifest(signedVideoUrl));

  if (hlsAvailable) {
    return {
      id: media.id,
      videoUrl: signedVideoUrl,
      imageUrl: null,
      viewerUrl: media.viewerUrl,
      status: media.status,
      mediaMode: "hls",
      hlsAvailable: true,
      retryHls: false,
    };
  }

  return fallbackMedia(media);
}

function fallbackMedia(media) {
  return {
    id: media.id,
    videoUrl: null,
    imageUrl: media.viewerUrl,
    viewerUrl: media.viewerUrl,
    status: media.status,
    mediaMode: "snapshot",
    hlsAvailable: false,
    retryHls:
      media.status === "Enabled" && Boolean(media.unsignedVideoUrl),
  };
}

function cachedMediaForResponse(entry, now) {
  return {
    ...entry.data,
    refreshAfterMs: Math.max(1_000, entry.nextCheckAt - now),
  };
}

function cachedSourceMatches(entry, media) {
  return (
    entry?.unsignedVideoUrl === media.unsignedVideoUrl &&
    entry?.status === media.status
  );
}

function cachedMediaIsReusable(media, now, { force = false } = {}) {
  const cached = signedMediaCache.get(media.id);
  if (!cachedSourceMatches(cached, media)) return false;

  if (force) {
    return now - cached.checkedAt < HLS_HEALTH_RETRY_MS;
  }
  return now < cached.nextCheckAt;
}

function deferredMediaForResponse(media, now) {
  const cached = signedMediaCache.get(media.id);
  const sourceMatches = cachedSourceMatches(cached, media);
  const cachedHealthyIsSafe =
    sourceMatches &&
    cached.data.hlsAvailable &&
    now - cached.signedAt < HLS_SIGNED_URL_MAX_STALE_MS;

  return {
    ...(cachedHealthyIsSafe
      ? cached.data
      : sourceMatches && !cached.data.hlsAvailable
        ? cached.data
        : fallbackMedia(media)),
    refreshAfterMs: HLS_HEALTH_RETRY_MS,
  };
}

async function getSignedMedia(media, now, { force = false } = {}) {
  const cached = signedMediaCache.get(media.id);
  const sourceMatches = cachedSourceMatches(cached, media);

  if (cachedMediaIsReusable(media, now, { force })) {
    return cachedMediaForResponse(cached, now);
  }

  const verified = await resolveAvailableMedia(media);

  // A transient grant throttle should not tear down a working player. Keep the
  // existing signed URL only after the Worker proves that exact manifest is
  // still healthy; an expired/challenged URL is never returned.
  if (
    !verified.hlsAvailable &&
    sourceMatches &&
    cached.data.hlsAvailable &&
    Date.now() - cached.signedAt < HLS_SIGNED_URL_MAX_STALE_MS &&
    (await probeHlsManifest(cached.data.videoUrl))
  ) {
    const checkedAt = Date.now();
    const retained = {
      ...cached,
      checkedAt,
      nextCheckAt: checkedAt + HLS_HEALTH_RETRY_MS,
    };
    signedMediaCache.set(media.id, retained);
    return cachedMediaForResponse(retained, checkedAt);
  }

  const checkedAt = Date.now();
  const entry = {
    data: verified,
    unsignedVideoUrl: media.unsignedVideoUrl,
    status: media.status,
    checkedAt,
    signedAt: verified.hlsAvailable ? checkedAt : 0,
    nextCheckAt:
      checkedAt +
      (verified.hlsAvailable
        ? HLS_SIGNED_URL_REFRESH_MS
        : HLS_HEALTH_RETRY_MS),
  };
  signedMediaCache.set(media.id, entry);
  return cachedMediaForResponse(entry, checkedAt);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => run()
  );
  await Promise.all(workers);
  return results;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      // The Worker owns inventory and per-camera signed-media caches. Browser
      // caching could strand the wall on an expired token or empty response.
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

async function getCameraMetadata(env, now) {
  const key = env.DRIVENC_API_KEY;
  if (!key) {
    return [];
  }

  if (
    cameraCache.source &&
    now - cameraCache.fetchedAt < CACHE_TTL_MS
  ) {
    return cameraCache.source;
  }

  // Do not share request-scoped fetch promises across Worker invocations.
  // A concurrent caller can safely use plain stale metadata; on a true cold
  // collision it receives the normal retryable proxy error instead of
  // duplicating a keyed inventory request.
  if (cameraMetadataRefreshInProgress) {
    if (cameraCache.source) return cameraCache.source;
    throw new Error("camera-metadata-refresh-in-progress");
  }
  cameraMetadataRefreshInProgress = true;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DRIVENC_INVENTORY_TIMEOUT_MS
  );

  try {
    const upstream = await fetch(
      `https://www.drivenc.gov/api/v2/get/cameras?key=${encodeURIComponent(key)}&format=json`,
      {
        redirect: "manual",
        signal: controller.signal,
      }
    );
    if (!upstream.ok) {
      await cancelResponseBody(upstream);
      throw new Error(`DriveNC API returned ${upstream.status}`);
    }
    const cameras = await upstream.json();
    if (!Array.isArray(cameras)) {
      throw new Error("DriveNC Cameras API returned an invalid payload");
    }

    const byId = new Map(cameras.map((camera) => [camera.Id, camera]));
    const source = WANTED_CAMERA_IDS.map((id) => {
      const camera = byId.get(id);
      if (!camera || camera.Id !== id) {
        throw new Error("DriveNC Cameras API omitted a configured camera");
      }
      return extractMedia(camera);
    });
    cameraCache = { source, fetchedAt: now };

    return source;
  } catch {
    // Stale metadata is safe because its unsigned URL is signed and probed
    // again before any token-bearing value can reach the browser.
    if (cameraCache.source) return cameraCache.source;
    throw new Error("camera-metadata-unavailable");
  } finally {
    clearTimeout(timeout);
    cameraMetadataRefreshInProgress = false;
  }
}

async function handleCamerasApi(env, { forceCameraId = null } = {}) {
  const now = Date.now();

  try {
    const source = await getCameraMetadata(env, now);
    if (!source.length) return jsonResponse([]);

    // A Free-plan Worker may make at most 50 external subrequests per
    // invocation. A cold camera costs grant + token exchange + manifest
    // probe, with bounded 429 retries. Refresh no more than four due cameras
    // per response, then let the browser's 10-second recovery cadence advance
    // the next group.
    const dueIndexes = new Set(
      source
        .map((media, index) => ({ media, index }))
        .filter(
          ({ media }) =>
            !cachedMediaIsReusable(media, now, {
              force: media.id === forceCameraId,
            }) &&
            !signedMediaRefreshReservations.has(media.id)
        )
        .map(({ index }) => index)
    );
    const refreshIndexes = [];
    let remainingRefreshBudget = HLS_MAX_REFRESHES_PER_REQUEST;
    const forcedIndex = source.findIndex(
      (media, index) =>
        media.id === forceCameraId && dueIndexes.has(index)
    );
    if (forcedIndex >= 0) {
      refreshIndexes.push(forcedIndex);
      remainingRefreshBudget -= 1;
    }

    let lastRoundRobinIndex = null;
    for (
      let offset = 0;
      offset < source.length && remainingRefreshBudget > 0;
      offset += 1
    ) {
      const index = (signedMediaSelectionCursor + offset) % source.length;
      if (!dueIndexes.has(index) || refreshIndexes.includes(index)) continue;
      refreshIndexes.push(index);
      remainingRefreshBudget -= 1;
      lastRoundRobinIndex = index;
    }
    if (lastRoundRobinIndex !== null) {
      signedMediaSelectionCursor =
        (lastRoundRobinIndex + 1) % source.length;
    }

    const refreshIds = new Set(
      refreshIndexes.map((index) => source[index].id)
    );
    refreshIds.forEach((id) => signedMediaRefreshReservations.add(id));

    try {
      // Start the forced camera first, then the rotating due-camera batch.
      // Response assembly below still follows canonical source order.
      const refreshed = await mapWithConcurrency(
        refreshIndexes.map((index) => source[index]),
        HLS_SIGNING_CONCURRENCY,
        (media) =>
          getSignedMedia(media, now, {
            force: media.id === forceCameraId,
          })
      );
      const refreshedById = new Map(
        refreshed.map((media) => [media.id, media])
      );
      const data = source.map((media) => {
        if (refreshedById.has(media.id)) {
          return refreshedById.get(media.id);
        }
        const cached = signedMediaCache.get(media.id);
        if (
          cachedMediaIsReusable(media, now, {
            force: media.id === forceCameraId,
          })
        ) {
          return cachedMediaForResponse(cached, now);
        }
        return deferredMediaForResponse(media, now);
      });
      return jsonResponse(data);
    } finally {
      refreshIds.forEach((id) => signedMediaRefreshReservations.delete(id));
    }
  } catch {
    return jsonResponse([], 502, {
      "x-camera-proxy-error": "upstream-unavailable",
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/cameras" && request.method === "GET") {
      // Do not let overlapping TV/browser polls duplicate a cold signing
      // burst. The caller preserves its current tiles and retries shortly.
      if (cameraApiRequestInProgress) {
        return jsonResponse([], 503, {
          "retry-after": "1",
          "x-camera-proxy-error": "refresh-in-progress",
        });
      }
      cameraApiRequestInProgress = true;

      const requestedCameraId = Number(url.searchParams.get("cameraId"));
      const forceHealthCheck =
        url.searchParams.get("refresh") === "1" &&
        WANTED_CAMERA_IDS.includes(requestedCameraId);
      try {
        return await handleCamerasApi(env, {
          forceCameraId: forceHealthCheck ? requestedCameraId : null,
        });
      } finally {
        cameraApiRequestInProgress = false;
      }
    }

    return env.ASSETS.fetch(request);
  },
};
