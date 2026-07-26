import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const expectedCameraIds = [5131, 5265, 5264, 6102, 4878, 6119, 4877, 6097, 5253, 4867, 4873, 4872];

for (const path of ["public/cameras.js", "public/weather.js", "src/worker.js"]) {
  const result = spawnSync(process.execPath, ["--check", new URL(path, root).pathname], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${path} failed syntax validation:\n${result.stderr}`);
}

const [cameraSource, workerSource, weatherSource, indexSource, styleSource, packageSource, lockSource, wranglerSource] =
  await Promise.all([
    read("public/cameras.js"),
    read("src/worker.js"),
    read("public/weather.js"),
    read("public/index.html"),
    read("public/style.css"),
    read("package.json"),
    read("package-lock.json"),
    read("wrangler.jsonc"),
  ]);

const cameraBlock = cameraSource.match(/const CAMERAS = \[([\s\S]*?)\n\];/)?.[1];
const workerBlock = workerSource.match(/const WANTED_CAMERA_IDS = \[([\s\S]*?)\n\];/)?.[1];
assert.ok(cameraBlock, "Could not find CAMERAS in public/cameras.js");
assert.ok(workerBlock, "Could not find WANTED_CAMERA_IDS in src/worker.js");

const browserIds = [...cameraBlock.matchAll(/\bid:\s*(\d+)/g)].map((match) => Number(match[1]));
const workerIds = [...workerBlock.matchAll(/^\s*(\d+),/gm)].map((match) => Number(match[1]));
assert.deepEqual(browserIds, expectedCameraIds, "Browser camera roster or order changed unexpectedly");
assert.deepEqual(workerIds, expectedCameraIds, "Worker camera roster must match the browser order");
assert.equal((cameraBlock.match(/priority:\s*true/g) || []).length, 1, "Exactly one camera must be the focus");
assert.match(cameraBlock, /^\s*\{ id: 5131,[^\n]+priority: true/m, "The closest camera must be first/focused");

const labels = [...cameraBlock.matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]);
assert.equal(labels.length, 12, "The 4-column wall requires exactly 12 feeds");
assert.ok(labels.slice(0, 8).every((label) => label.startsWith("I-26")), "The first eight feeds must be interstate cameras");
assert.ok(labels.slice(8).every((label) => !label.startsWith("I-26")), "The bottom row must contain four non-interstate feeds");

assert.match(weatherSource, /label:\s*"East Flat Rock, NC"/);
assert.match(weatherSource, /lat:\s*35\.294292/);
assert.match(weatherSource, /lon:\s*-82\.398257/);
assert.match(weatherSource, /nwsPoint:\s*"35\.2943,-82\.3983"/);
assert.match(indexSource, /I-26 \/ East Flat Rock NC/);
assert.doesNotMatch(`${cameraSource}\n${weatherSource}\n${indexSource}\n${workerSource}`, /\bArden\b/i);
assert.match(cameraSource, /const CAMERA_META_REFRESH_MS = 90_000/);
assert.match(cameraSource, /const CAMERA_META_RETRY_MS = 10_000/);
assert.match(cameraSource, /const CAMERA_API_TIMEOUT_MS = 60_000/);
assert.match(cameraSource, /const HLS_RETRY_MS = 10_000/);
assert.match(cameraSource, /const HLS_STALL_TIMEOUT_MS = 25_000/);
assert.match(cameraSource, /Date\.now\(\) - playback\.lastProgressAt >= HLS_STALL_TIMEOUT_MS/);
assert.match(cameraSource, /video\.crossOrigin = "anonymous"/);
assert.match(cameraSource, /forceHealthCheck: true,\s+cameraId: tile\.dataset\.id/);
assert.match(cameraSource, /params\.set\("cameraId", forceCameraId\)/);
assert.match(cameraSource, /const pendingForcedCameraIds = new Set\(\)/);
assert.match(cameraSource, /signal: controller\.signal/);
assert.match(
  cameraSource,
  /renderImage\(tile, data\.imageUrl, \{\s+error: Boolean\(data\.retryHls\)/
);
assert.match(cameraSource, /function renderFallbackSnapshot\(tile/);
assert.doesNotMatch(cameraSource, /createElement\("iframe"\)/);
assert.match(cameraSource, /function setFeatureCamera\(nextFeature\)/);
assert.match(cameraSource, /currentFeature\?\.classList\.remove\("priority"\)/);
assert.match(cameraSource, /nextFeature\.classList\.add\("priority"\)/);
assert.match(styleSource, /\.camera-tile\.priority\s*{\s*grid-area: 1 \/ 1 \/ span 3 \/ span 3;/);
assert.match(workerSource, /"cache-control": "no-store"/);
assert.match(workerSource, /async function resolveAvailableMedia\(media\)/);
assert.match(workerSource, /async function requestSignedHlsUrl\(media\)/);
assert.match(workerSource, /www\.drivenc\.gov\/Camera\/GetVideoUrl/);
assert.match(workerSource, /vds\.nc\.insight-atms\.com\/api\/SecureTokenUri\/GetSecureTokenUriBySourceId/);
assert.match(workerSource, /signedSuffix\.startsWith\("\?token="\)/);
assert.match(workerSource, /probeHlsManifest\(signedVideoUrl\)/);
assert.match(workerSource, /manifest\.trimStart\(\)\.startsWith\("#EXTM3U"\)/);
assert.match(workerSource, /const HLS_SIGNED_URL_REFRESH_MS = 300_000/);
assert.match(workerSource, /const HLS_SIGNED_URL_MAX_STALE_MS = 900_000/);
assert.match(workerSource, /const HLS_PROBE_TIMEOUT_MS = 15_000/);
assert.match(workerSource, /const HLS_SIGNING_CONCURRENCY = 3/);
assert.match(workerSource, /const HLS_MAX_REFRESHES_PER_REQUEST = 4/);
assert.match(workerSource, /const HLS_429_RETRY_DELAYS_MS = \[250, 750\]/);
assert.match(workerSource, /const DRIVENC_INVENTORY_TIMEOUT_MS = 15_000/);
assert.match(workerSource, /const signedMediaCache = new Map\(\)/);
assert.match(workerSource, /let signedMediaSelectionCursor = 0/);
assert.match(workerSource, /let cameraApiRequestInProgress = false/);
assert.match(workerSource, /url\.searchParams\.get\("refresh"\) === "1"/);
assert.match(workerSource, /WANTED_CAMERA_IDS\.includes\(requestedCameraId\)/);
assert.doesNotMatch(workerSource, /redirect:\s*"error"/);
assert.doesNotMatch(workerSource, /DRIVENC_(?:USERNAME|PASSWORD)/);

const packageJson = JSON.parse(packageSource);
const lockJson = JSON.parse(lockSource);
const wranglerJson = JSON.parse(wranglerSource);
const projectName = "east-flat-rock-cctv-weather";
assert.equal(packageJson.name, projectName);
assert.equal(lockJson.name, projectName);
assert.equal(lockJson.packages[""].name, projectName);
assert.equal(wranglerJson.name, projectName);
assert.equal(wranglerJson.keep_vars, true, "Dashboard-managed variables must survive deploys");

const originalFetch = globalThis.fetch;
const mockCameras = expectedCameraIds.map((id) => ({
  Id: id,
  Views: [
    {
      Status: "Enabled",
      VideoUrl: `https://cfase01.services.ncdot.gov:8887/chan-${id}_l/index.m3u8`,
    },
  ],
}));
const assetsBinding = {
  fetch: () => new Response("not found", { status: 404 }),
};
const workerModuleDataUrl = `data:text/javascript;base64,${Buffer.from(
  workerSource
).toString("base64")}`;
const originalDateNow = Date.now;

try {
  const grantRequests = [];
  const grantAttempts = new Map();
  const tokenAttempts = new Map();
  const failedRenewalIds = new Set();
  let activeSigningRequests = 0;
  let maxActiveSigningRequests = 0;
  let currentProgressiveRound = 0;
  const externalRequestsByRound = [0, 0, 0];

  const withSigningRequest = async (task) => {
    activeSigningRequests += 1;
    maxActiveSigningRequests = Math.max(
      maxActiveSigningRequests,
      activeSigningRequests
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return task();
    } finally {
      activeSigningRequests -= 1;
    }
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.pathname === "/api/v2/get/cameras") {
      externalRequestsByRound[currentProgressiveRound] += 1;
      assert.equal(url.searchParams.get("key"), "test-key");
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal instanceof AbortSignal);
      return Response.json(mockCameras);
    }
    if (url.pathname === "/Camera/GetVideoUrl") {
      externalRequestsByRound[currentProgressiveRound] += 1;
      const imageId = Number(url.searchParams.get("imageId"));
      assert.ok(expectedCameraIds.includes(imageId));
      assert.equal(init.redirect, "manual");
      grantRequests.push(imageId);
      if (failedRenewalIds.has(imageId)) {
        return new Response("renewal unavailable", { status: 503 });
      }
      const attempt = (grantAttempts.get(imageId) || 0) + 1;
      grantAttempts.set(imageId, attempt);
      return withSigningRequest(() => {
        if (attempt === 1) {
          return new Response("rate limited", { status: 429 });
        }
        return Response.json({
          token: "00000000-0000-4000-8000-000000000000",
          sourceId: String(imageId),
          systemSourceId: "Division 14",
        });
      });
    }
    if (url.hostname === "vds.nc.insight-atms.com") {
      externalRequestsByRound[currentProgressiveRound] += 1;
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "manual");
      const tokenRequest = JSON.parse(init.body);
      assert.deepEqual(Object.keys(tokenRequest).sort(), [
        "sourceId",
        "systemSourceId",
        "token",
      ]);
      const imageId = Number(tokenRequest.sourceId);
      assert.ok(expectedCameraIds.includes(imageId));
      const attempt = (tokenAttempts.get(imageId) || 0) + 1;
      tokenAttempts.set(imageId, attempt);
      return withSigningRequest(() => {
        if (attempt === 1) {
          return new Response("rate limited", { status: 429 });
        }
        return Response.json(`?token=${"a".repeat(64)}`);
      });
    }
    if (/\.services\.ncdot\.gov$/i.test(url.hostname)) {
      externalRequestsByRound[currentProgressiveRound] += 1;
      assert.equal(init.redirect, "manual");
      assert.equal(url.searchParams.get("token"), "a".repeat(64));
      return new Response("#EXTM3U\n#EXT-X-VERSION:7\n");
    }

    throw new Error(`Unexpected mocked request: ${url.origin}${url.pathname}`);
  };

  const successWorker = (
    await import(`${workerModuleDataUrl}#success-${Date.now()}`)
  ).default;
  let simulatedNow = originalDateNow();
  Date.now = () => simulatedNow;
  let successResponse;
  let successPayload;
  for (let round = 1; round <= 3; round += 1) {
    currentProgressiveRound = round - 1;
    const fetchSuccessPayload = () =>
      successWorker.fetch(
        new Request("https://wall.test/api/cameras"),
        { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
      );
    if (round === 1) {
      const concurrentResponses = await Promise.all([
        fetchSuccessPayload(),
        fetchSuccessPayload(),
      ]);
      successResponse = concurrentResponses.find(
        (response) => response.status === 200
      );
      const deferredResponse = concurrentResponses.find(
        (response) => response.status === 503
      );
      assert.ok(successResponse);
      assert.ok(deferredResponse);
      assert.equal(
        deferredResponse.headers.get("x-camera-proxy-error"),
        "refresh-in-progress"
      );
      assert.deepEqual(await deferredResponse.json(), []);
    } else {
      successResponse = await fetchSuccessPayload();
    }
    successPayload = await successResponse.json();
    assert.equal(successResponse.status, 200);
    assert.equal(successResponse.headers.get("cache-control"), "no-store");
    assert.equal(successPayload.length, 12);
    assert.equal(
      successPayload.filter((camera) => camera.hlsAvailable).length,
      round * 4,
      "A cold Worker must upgrade no more than four additional feeds per response"
    );
    assert.ok(
      successPayload.every(
        (camera) => !Object.hasOwn(camera, "unsignedVideoUrl")
      ),
      "Unsigned media URLs must never serialize during progressive recovery"
    );
    if (round < 3) simulatedNow += 11_000;
  }

  assert.ok(
    successPayload.every(
      (camera) =>
        camera.mediaMode === "hls" &&
        camera.videoUrl?.endsWith(`?token=${"a".repeat(64)}`) &&
        camera.imageUrl === null &&
        !Object.hasOwn(camera, "unsignedVideoUrl") &&
        camera.retryHls === false &&
        camera.refreshAfterMs > 250_000 &&
        camera.refreshAfterMs <= 300_000
    ),
    "Successful signing must expose only short-lived tokenized HLS URLs"
  );
  assert.ok(
    expectedCameraIds.every(
      (id) => grantAttempts.get(id) === 2 && tokenAttempts.get(id) === 2
    ),
    "Transient HTTP 429 responses must be retried once per signing endpoint"
  );
  assert.equal(
    maxActiveSigningRequests,
    3,
    "A cold response must limit signing traffic to three concurrent cameras"
  );
  assert.ok(
    externalRequestsByRound.every((count) => count < 50),
    "Progressive signing must remain under the Free-plan 50-subrequest limit"
  );

  grantRequests.length = 0;
  const forcedCameraId = expectedCameraIds.at(-1);
  const forcedResponse = await successWorker.fetch(
    new Request(
      `https://wall.test/api/cameras?refresh=1&cameraId=${forcedCameraId}`
    ),
    { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
  );
  const forcedPayload = await forcedResponse.json();
  assert.equal(forcedResponse.status, 200);
  assert.equal(forcedPayload.length, 12);
  assert.deepEqual(
    grantRequests,
    [],
    "A forced health check inside the 10-second guard must reuse per-camera cache"
  );

  simulatedNow += 11_000;
  const refreshedResponse = await successWorker.fetch(
    new Request(
      `https://wall.test/api/cameras?refresh=1&cameraId=${forcedCameraId}`
    ),
    { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
  );
  const refreshedPayload = await refreshedResponse.json();
  assert.equal(refreshedResponse.status, 200);
  assert.equal(refreshedPayload.length, 12);
  assert.deepEqual(
    grantRequests,
    [forcedCameraId],
    "A playback refresh must re-sign only its requested camera"
  );

  const refreshedCamera = refreshedPayload.find(
    (camera) => camera.id === forcedCameraId
  );
  const retainedVideoUrl = refreshedCamera.videoUrl;
  grantRequests.length = 0;
  failedRenewalIds.add(forcedCameraId);
  simulatedNow += 11_000;
  const retainedResponse = await successWorker.fetch(
    new Request(
      `https://wall.test/api/cameras?refresh=1&cameraId=${forcedCameraId}`
    ),
    { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
  );
  const retainedPayload = await retainedResponse.json();
  const retainedCamera = retainedPayload.find(
    (camera) => camera.id === forcedCameraId
  );
  assert.equal(retainedCamera.videoUrl, retainedVideoUrl);
  assert.equal(retainedCamera.hlsAvailable, true);
  assert.equal(retainedCamera.refreshAfterMs, 10_000);

  simulatedNow += 901_000;
  const expiredResponse = await successWorker.fetch(
    new Request(
      `https://wall.test/api/cameras?refresh=1&cameraId=${forcedCameraId}`
    ),
    { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
  );
  const expiredPayload = await expiredResponse.json();
  const expiredCamera = expiredPayload.find(
    (camera) => camera.id === forcedCameraId
  );
  assert.equal(expiredCamera.videoUrl, null);
  assert.equal(expiredCamera.hlsAvailable, false);
  assert.equal(
    expiredCamera.imageUrl,
    `https://www.drivenc.gov/map/Cctv/${forcedCameraId}`
  );
  failedRenewalIds.delete(forcedCameraId);
  Date.now = originalDateNow;

  const noKeyResponse = await successWorker.fetch(
    new Request("https://wall.test/api/cameras"),
    { ASSETS: assetsBinding }
  );
  assert.deepEqual(
    await noKeyResponse.json(),
    [],
    "A missing developer API key must retain the intentional empty degraded mode"
  );
  assert.equal(noKeyResponse.headers.get("cache-control"), "no-store");

  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/v2/get/cameras") return Response.json(mockCameras);
    if (url.pathname === "/Camera/GetVideoUrl") {
      return new Response("unavailable", { status: 401 });
    }
    throw new Error(`Unsigned HLS must not be fetched: ${url.origin}${url.pathname}`);
  };

  const fallbackWorker = (
    await import(`${workerModuleDataUrl}#fallback-${Date.now()}`)
  ).default;
  const fallbackResponse = await fallbackWorker.fetch(
    new Request("https://wall.test/api/cameras?refresh=1"),
    { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
  );
  const fallbackPayload = await fallbackResponse.json();
  assert.equal(fallbackPayload.length, 12);
  assert.equal(fallbackResponse.headers.get("www-authenticate"), null);
  assert.ok(
    fallbackPayload.every(
      (camera) =>
        camera.mediaMode === "snapshot" &&
        camera.videoUrl === null &&
        camera.imageUrl === `https://www.drivenc.gov/map/Cctv/${camera.id}` &&
        camera.retryHls === true &&
        camera.refreshAfterMs === 10_000
    ),
    "A failed grant must suppress the unsigned URL and use the public image"
  );

  const permanentlyUnavailableIds = new Set(expectedCameraIds.slice(0, 4));
  const fairnessGrantRequests = new Map();
  let fairnessNow = originalDateNow();
  Date.now = () => fairnessNow;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/v2/get/cameras") {
      return Response.json(mockCameras);
    }
    if (url.pathname === "/Camera/GetVideoUrl") {
      const imageId = Number(url.searchParams.get("imageId"));
      fairnessGrantRequests.set(
        imageId,
        (fairnessGrantRequests.get(imageId) || 0) + 1
      );
      if (permanentlyUnavailableIds.has(imageId)) {
        return new Response("unavailable", { status: 503 });
      }
      return Response.json({
        token: "00000000-0000-4000-8000-000000000000",
        sourceId: String(imageId),
        systemSourceId: "Division 14",
      });
    }
    if (url.hostname === "vds.nc.insight-atms.com") {
      const tokenRequest = JSON.parse(init.body);
      return Response.json(`?token=${String(tokenRequest.sourceId).padStart(64, "a")}`);
    }
    if (/\.services\.ncdot\.gov$/i.test(url.hostname)) {
      return new Response("#EXTM3U\n#EXT-X-VERSION:7\n");
    }
    throw new Error(`Unexpected fairness request: ${url.origin}${url.pathname}`);
  };

  const fairnessWorker = (
    await import(`${workerModuleDataUrl}#fairness-${originalDateNow()}`)
  ).default;
  const fairnessLiveCounts = [];
  for (let round = 0; round < 4; round += 1) {
    const response = await fairnessWorker.fetch(
      new Request(
        `https://wall.test/api/cameras?refresh=1&cameraId=${expectedCameraIds[0]}`
      ),
      { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    fairnessLiveCounts.push(
      payload.filter((camera) => camera.hlsAvailable).length
    );
    fairnessNow += 11_000;
  }
  assert.deepEqual(
    fairnessLiveCounts,
    [0, 3, 6, 8],
    "Permanently failed early feeds must not starve later healthy cameras"
  );
  assert.ok(
    expectedCameraIds
      .slice(4)
      .every((id) => fairnessGrantRequests.get(id) === 1),
    "The rotating signing budget must eventually attempt every later due camera"
  );

  const timeoutWorkerSource = workerSource.replace(
    "const DRIVENC_INVENTORY_TIMEOUT_MS = 15_000;",
    "const DRIVENC_INVENTORY_TIMEOUT_MS = 15;"
  );
  const timeoutWorkerModuleDataUrl =
    `data:text/javascript;base64,${Buffer.from(timeoutWorkerSource).toString("base64")}`;
  globalThis.fetch = async (_input, init = {}) =>
    new Promise((_resolve, reject) => {
      const rejectAborted = () => reject(new Error("inventory request aborted"));
      if (init.signal?.aborted) {
        rejectAborted();
        return;
      }
      init.signal?.addEventListener("abort", rejectAborted, { once: true });
    });
  const timeoutWorker = (
    await import(`${timeoutWorkerModuleDataUrl}#timeout-${originalDateNow()}`)
  ).default;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await timeoutWorker.fetch(
      new Request("https://wall.test/api/cameras"),
      { ASSETS: assetsBinding, DRIVENC_API_KEY: "test-key" }
    );
    assert.equal(response.status, 502);
    assert.equal(
      response.headers.get("x-camera-proxy-error"),
      "upstream-unavailable"
    );
  }
} finally {
  Date.now = originalDateNow;
  globalThis.fetch = originalFetch;
}

console.log(
  "Configuration verified: East Flat Rock center, 8+4 camera order, signed HLS, click-to-feature layout, playback recovery, Worker sync, and project identity."
);
