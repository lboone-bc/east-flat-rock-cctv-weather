// Camera list centered on 103 Education Dr, Flat Rock, NC. The first eight
// entries are the closest enabled interstate cameras in the requested
// operational display order; the final four are the closest enabled
// non-interstate road cameras in straight-line order. This ordering is
// intentional: the last four fill the dashboard's bottom row.
//
// `id` is DriveNC's numeric camera Id from their official Cameras API
// (NOT the GUID used in drivenc.gov's public viewer-page URLs — that GUID
// scheme doesn't appear anywhere in the API dataset; these numeric Ids were
// matched by cross-referencing camera location names/coordinates against
// the full API dump. See README for details.)
const CAMERAS = [
  { id: 5131, label: "I-26 MM53 — Upward Rd", priority: true },
  { id: 5265, label: "I-26 MM59 — Holbert Cove Rd" },
  { id: 5264, label: "I-26 MM54.2 — US-25" },
  { id: 6102, label: "I-26 MM51.5 — Tracy Grove Rd" },
  { id: 4878, label: "I-26 MM49 — US-64" },
  { id: 6119, label: "I-26 MM48.2" },
  { id: 4877, label: "I-26 MM48" },
  { id: 6097, label: "I-26 MM46.2" },
  { id: 5253, label: "US-176 — Upward Rd" },
  { id: 4867, label: "US-176 — US-25 BUS" },
  { id: 4873, label: "US-64 E — US-25 BUS S" },
  { id: 4872, label: "US-64 — Linda Vista Dr" },
];

const CAMERA_API_URL = "/api/cameras";
const CAMERA_META_REFRESH_MS = 90_000; // full camera inventory stays cached server-side for this long
const CAMERA_META_RETRY_MS = 10_000; // recover quickly after a missing key or transient API failure
const CAMERA_API_TIMEOUT_MS = 60_000;
const HLS_RETRY_MS = 10_000;
const HLS_CONNECT_TIMEOUT_MS = 18_000;
const HLS_STALL_CHECK_MS = 5_000;
const HLS_STALL_TIMEOUT_MS = 25_000;

function viewerUrl(id) {
  return `https://www.drivenc.gov/map/Cctv/${id}`;
}

function buildTile(cam, index) {
  const tile = document.createElement("div");
  tile.className = "camera-tile" + (cam.priority ? " priority" : "");
  tile.dataset.id = cam.id;
  tile.style.setProperty("--tile-index", index);

  const dot = document.createElement("div");
  dot.className = "status-dot";
  tile.appendChild(dot);

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = cam.label;
  tile.appendChild(label);

  const media = document.createElement("div");
  media.className = "media";
  media.style.width = "100%";
  media.style.height = "100%";
  tile.appendChild(media);

  const featureToggle = document.createElement("button");
  featureToggle.className = "feature-toggle";
  featureToggle.type = "button";
  featureToggle.title = cam.priority
    ? `${cam.label} is the feature camera`
    : `Show ${cam.label} as the feature camera`;
  featureToggle.setAttribute("aria-label", featureToggle.title);
  featureToggle.setAttribute("aria-pressed", String(Boolean(cam.priority)));
  featureToggle.addEventListener("click", () => setFeatureCamera(tile));
  tile.appendChild(featureToggle);

  return tile;
}

function setFeatureCamera(nextFeature) {
  const currentFeature = document.querySelector(".camera-tile.priority");
  if (currentFeature === nextFeature) return;

  currentFeature?.classList.remove("priority");
  nextFeature.classList.add("priority");

  document.querySelectorAll(".camera-tile").forEach((tile) => {
    const button = tile.querySelector(".feature-toggle");
    const isFeature = tile === nextFeature;
    const label = tile.querySelector(".label").textContent;
    button.setAttribute("aria-pressed", String(isFeature));
    button.title = isFeature
      ? `${label} is the feature camera`
      : `Show ${label} as the feature camera`;
    button.setAttribute("aria-label", button.title);
  });
}

function disposeTileResources(tile) {
  tile._streamUrl = null;
  const playback = tile._playbackState;
  if (playback) {
    playback.disposed = true;
    clearTimeout(playback.connectTimer);
    clearInterval(playback.stallTimer);
    playback.hls?.destroy();
    playback.video?.pause();
    playback.video?.removeAttribute("src");
    playback.video?.load();
    tile._playbackState = null;
  }

  if (tile._streamRetryTimer) {
    clearTimeout(tile._streamRetryTimer);
    tile._streamRetryTimer = null;
  }

}

function renderFallbackSnapshot(tile, { error = false } = {}) {
  renderImage(tile, viewerUrl(tile.dataset.id), { error });
}

function renderImage(tile, imageUrl, { error = false } = {}) {
  disposeTileResources(tile);
  tile.classList.toggle("live", !error);
  tile.classList.toggle("error", error);
  const media = tile.querySelector(".media");
  let img = media.querySelector("img");
  if (!img) {
    media.innerHTML = "";
    img = document.createElement("img");
    img.alt = tile.querySelector(".label").textContent;
    img.decoding = "async";
    media.appendChild(img);
  }
  const sep = imageUrl.includes("?") ? "&" : "?";
  img.src = `${imageUrl}${sep}_ts=${Date.now()}`;
}

// NCDOT camera feeds are HLS (.m3u8) live streams. Safari/iOS play HLS
// natively via <video src>; everywhere else needs hls.js (loaded in index.html).
function renderHlsStream(tile, streamUrl) {
  const media = tile.querySelector(".media");
  const existing = media.querySelector("video");
  if (
    existing &&
    tile._streamUrl === streamUrl &&
    tile._playbackState &&
    !tile._playbackState.disposed
  ) {
    return; // already attached to this exact stream, nothing to do
  }

  disposeTileResources(tile);
  media.innerHTML = "";
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  tile._streamUrl = streamUrl;
  media.appendChild(video);

  const playback = {
    disposed: false,
    failed: false,
    hls: null,
    video,
    connectTimer: null,
    stallTimer: null,
    lastMediaTime: 0,
    lastProgressAt: Date.now(),
  };
  tile._playbackState = playback;

  // A manifest can parse successfully (or `loadedmetadata` can fire) without
  // a single frame ever actually decoding — a dead or stalled upstream just
  // sits there black forever with no error event. Track both the initial
  // `playing` event and continued media-time progress so a wall left running
  // for days can recover instead of freezing forever on its last frame.
  const markLive = () => {
    if (playback.disposed) return;
    playback.lastMediaTime = video.currentTime;
    playback.lastProgressAt = Date.now();
    clearTimeout(playback.connectTimer);
    tile.classList.add("live");
    tile.classList.remove("error");
  };

  const markFailed = (reason = "unknown playback failure", { retry = true } = {}) => {
    if (playback.disposed || playback.failed) return;
    playback.failed = true;
    console.warn(
      `HLS playback failed/stalled for camera ${tile.dataset.id} (${reason}); ${
        retry ? "retrying shortly" : "using fallback"
      }`
    );
    renderFallbackSnapshot(tile, { error: true });
    if (retry) {
      tile._streamRetryTimer = setTimeout(() => {
        tile._streamRetryTimer = null;
        refreshCameraMetaNow({
          forceHealthCheck: true,
          cameraId: tile.dataset.id,
        });
      }, HLS_RETRY_MS);
    }
  };

  playback.connectTimer = setTimeout(
    () => markFailed("initial connection timeout"),
    HLS_CONNECT_TIMEOUT_MS
  );

  playback.stallTimer = setInterval(() => {
    if (playback.disposed) return;

    // Browsers deliberately throttle or suspend hidden tabs. Reset the stall
    // baseline while hidden rather than treating normal suspension as failure.
    if (document.hidden) {
      playback.lastMediaTime = video.currentTime;
      playback.lastProgressAt = Date.now();
      return;
    }

    if (Math.abs(video.currentTime - playback.lastMediaTime) > 0.05) {
      playback.lastMediaTime = video.currentTime;
      playback.lastProgressAt = Date.now();
      return;
    }

    if (Date.now() - playback.lastProgressAt >= HLS_STALL_TIMEOUT_MS) {
      markFailed("no frame progress");
    }
  }, HLS_STALL_CHECK_MS);

  video.addEventListener("playing", markLive);
  video.addEventListener(
    "error",
    () => markFailed(video.error?.message || "video element error"),
    { once: true }
  );

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
    video.play().catch((err) => markFailed(err?.message || "autoplay rejected"));
  } else if (window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({ liveSyncDurationCount: 3 });
    playback.hls = hls;
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () =>
      video.play().catch((err) => markFailed(err?.message || "autoplay rejected"))
    );
    hls.on(window.Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) markFailed(`${data.type}: ${data.details}`);
    });
  } else {
    markFailed("HLS playback is unavailable in this browser", { retry: false });
  }
}

let cameraMetaRefreshTimer = null;
let cameraMetaRefreshInFlight = false;
const pendingForcedCameraIds = new Set();

function scheduleCameraMetaRefresh(delay, options = {}) {
  clearTimeout(cameraMetaRefreshTimer);
  cameraMetaRefreshTimer = setTimeout(() => refreshCameraMeta(options), delay);
}

async function refreshCameraMeta({
  forceHealthCheck = false,
  cameraId = null,
} = {}) {
  const forceCameraId = String(cameraId ?? "");
  const forceTargetIsValid =
    forceHealthCheck &&
    CAMERAS.some((camera) => String(camera.id) === forceCameraId);

  if (cameraMetaRefreshInFlight) {
    if (forceTargetIsValid) pendingForcedCameraIds.add(forceCameraId);
    return;
  }
  cameraMetaRefreshInFlight = true;
  const controller = new AbortController();
  const requestTimeout = setTimeout(
    () => controller.abort(),
    CAMERA_API_TIMEOUT_MS
  );
  let payload = [];
  let metadataAvailable = false;
  try {
    const params = new URLSearchParams();
    if (forceTargetIsValid) {
      params.set("refresh", "1");
      params.set("cameraId", forceCameraId);
    }
    const query = params.toString();
    const url = query ? `${CAMERA_API_URL}?${query}` : CAMERA_API_URL;
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`camera API returned ${res.status}`);
    payload = await res.json();
    if (!Array.isArray(payload)) throw new Error("camera API returned an invalid payload");
    metadataAvailable = true;
  } catch (err) {
    console.warn("Camera metadata fetch failed; preserving the current tile state:", err);
  } finally {
    clearTimeout(requestTimeout);
  }

  try {
    if (!metadataAvailable) return;

    const byId = new Map(
      payload
        .filter((camera) => camera?.id != null)
        .map((camera) => [String(camera.id), camera])
    );

    document.querySelectorAll(".camera-tile").forEach((tile) => {
      const id = tile.dataset.id;
      const data = byId.get(id);

      if (!data || (!data.videoUrl && !data.imageUrl)) {
        // Do not tear down a healthy stream because one metadata response is
        // partial. Its own error/stall watchdog remains responsible for it.
        if (!tile.querySelector("video, img")) {
          renderFallbackSnapshot(tile);
        }
        return;
      }

      try {
        if (data.videoUrl) {
          renderHlsStream(tile, data.videoUrl);
        } else {
          renderImage(tile, data.imageUrl, {
            error: Boolean(data.retryHls),
          });
        }
      } catch (err) {
        console.warn(`Failed to render camera ${id}:`, err);
        renderFallbackSnapshot(tile, { error: true });
      }
    });
  } finally {
    cameraMetaRefreshInFlight = false;
    const pendingCameraId = pendingForcedCameraIds.values().next().value;
    if (pendingCameraId) {
      pendingForcedCameraIds.delete(pendingCameraId);
      refreshCameraMeta({
        forceHealthCheck: true,
        cameraId: pendingCameraId,
      });
      return;
    }

    const hasLiveMedia = payload.some((camera) => camera?.videoUrl || camera?.imageUrl);
    const retryCamera = payload.find((camera) => camera?.retryHls);
    const serverRefreshHints = payload
      .map((camera) => Number(camera?.refreshAfterMs))
      .filter((delay) => Number.isFinite(delay) && delay >= 1_000);
    const nextRefreshDelay = hasLiveMedia
      ? Math.min(CAMERA_META_REFRESH_MS, ...serverRefreshHints)
      : CAMERA_META_RETRY_MS;
    scheduleCameraMetaRefresh(nextRefreshDelay, {
      forceHealthCheck: Boolean(retryCamera),
      cameraId: retryCamera?.id ?? null,
    });
  }
}

function refreshCameraMetaNow({
  forceHealthCheck = false,
  cameraId = null,
} = {}) {
  clearTimeout(cameraMetaRefreshTimer);
  refreshCameraMeta({ forceHealthCheck, cameraId });
}

function init() {
  const grid = document.getElementById("camera-grid");
  const feedCount = document.querySelector(".feed-count");
  if (feedCount) feedCount.textContent = `${CAMERAS.length} FEEDS`;

  CAMERAS.forEach((cam, index) => {
    grid.appendChild(buildTile(cam, index));
  });

  // Render public DriveNC snapshots immediately, then upgrade only the feeds
  // whose HLS manifests the Worker has verified as healthy.
  document
    .querySelectorAll(".camera-tile")
    .forEach((tile) => renderFallbackSnapshot(tile));

  refreshCameraMeta();

  window.addEventListener("online", refreshCameraMetaNow);
  window.addEventListener("focus", refreshCameraMetaNow);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    document.querySelectorAll(".camera-tile").forEach((tile) => {
      if (!tile._playbackState) return;
      tile._playbackState.lastMediaTime = tile.querySelector("video")?.currentTime || 0;
      tile._playbackState.lastProgressAt = Date.now();
    });
    refreshCameraMetaNow();
  });
}

document.addEventListener("DOMContentLoaded", init);
