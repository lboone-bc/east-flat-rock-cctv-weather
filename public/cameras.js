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
const CAMERA_META_REFRESH_MS = 90_000; // how often we re-ask the proxy for fresh media URLs
const CAMERA_META_RETRY_MS = 10_000; // recover quickly after a missing key or transient API failure
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

// The drivenc.gov viewer page renders at its own natural desktop size —
// embedded at 100%/100% it just shows an unscaled, cropped fragment (the
// page's own oversized header text filling the whole tile). Instead, size
// the iframe to that natural viewport and scale the whole thing down to
// cover the tile, so it reads as "a small view of their page" rather than
// "zoomed into one corner of it".
const IFRAME_NATURAL_WIDTH = 1600;
const IFRAME_NATURAL_HEIGHT = 1000;

function disposeTileResources(tile) {
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

  if (tile._fallbackResizeObserver) {
    tile._fallbackResizeObserver.disconnect();
    tile._fallbackResizeObserver = null;
  }
}

function renderFallbackIframe(tile, { error = false } = {}) {
  const id = tile.dataset.id;
  disposeTileResources(tile);
  tile.classList.remove("live");
  tile.classList.toggle("error", error);
  const media = tile.querySelector(".media");
  media.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.src = viewerUrl(id);
  iframe.loading = "lazy";
  iframe.title = tile.querySelector(".label").textContent;
  Object.assign(iframe.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: `${IFRAME_NATURAL_WIDTH}px`,
    height: `${IFRAME_NATURAL_HEIGHT}px`,
    transformOrigin: "top left",
    border: "0",
  });
  media.appendChild(iframe);

  const scaleToFit = () => {
    const rect = tile.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.max(rect.width / IFRAME_NATURAL_WIDTH, rect.height / IFRAME_NATURAL_HEIGHT);
    iframe.style.transform = `scale(${scale})`;
  };
  scaleToFit();

  // Tile size can change (grid reflow on load, priority tile is 3x3, etc.);
  // keep the scale in sync rather than computing it once and going stale.
  if (tile._fallbackResizeObserver) tile._fallbackResizeObserver.disconnect();
  const ro = new ResizeObserver(scaleToFit);
  ro.observe(tile);
  tile._fallbackResizeObserver = ro;
}

function renderImage(tile, imageUrl) {
  disposeTileResources(tile);
  tile.classList.add("live");
  tile.classList.remove("error");
  const media = tile.querySelector(".media");
  let img = media.querySelector("img");
  if (!img) {
    media.innerHTML = "";
    img = document.createElement("img");
    img.alt = tile.querySelector(".label").textContent;
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
    existing.dataset.src === streamUrl &&
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
  video.dataset.src = streamUrl;
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
    renderFallbackIframe(tile, { error: true });
    if (retry) {
      tile._streamRetryTimer = setTimeout(() => {
        tile._streamRetryTimer = null;
        renderHlsStream(tile, streamUrl);
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

function scheduleCameraMetaRefresh(delay) {
  clearTimeout(cameraMetaRefreshTimer);
  cameraMetaRefreshTimer = setTimeout(refreshCameraMeta, delay);
}

async function refreshCameraMeta() {
  if (cameraMetaRefreshInFlight) return;
  cameraMetaRefreshInFlight = true;
  let payload = [];
  let metadataAvailable = false;
  try {
    const res = await fetch(CAMERA_API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`camera API returned ${res.status}`);
    payload = await res.json();
    if (!Array.isArray(payload)) throw new Error("camera API returned an invalid payload");
    metadataAvailable = true;
  } catch (err) {
    console.warn("Camera metadata fetch failed; preserving the current tile state:", err);
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
        if (!tile.querySelector("video, img, iframe")) {
          renderFallbackIframe(tile);
        }
        return;
      }

      try {
        if (data.videoUrl) {
          renderHlsStream(tile, data.videoUrl);
        } else {
          renderImage(tile, data.imageUrl);
        }
      } catch (err) {
        console.warn(`Failed to render camera ${id}:`, err);
        renderFallbackIframe(tile, { error: true });
      }
    });
  } finally {
    cameraMetaRefreshInFlight = false;
    const hasLiveMedia = payload.some((camera) => camera?.videoUrl || camera?.imageUrl);
    scheduleCameraMetaRefresh(hasLiveMedia ? CAMERA_META_REFRESH_MS : CAMERA_META_RETRY_MS);
  }
}

function refreshCameraMetaNow() {
  if (cameraMetaRefreshInFlight) return;
  clearTimeout(cameraMetaRefreshTimer);
  refreshCameraMeta();
}

function init() {
  const grid = document.getElementById("camera-grid");
  const feedCount = document.querySelector(".feed-count");
  if (feedCount) feedCount.textContent = `${CAMERAS.length} FEEDS`;

  CAMERAS.forEach((cam, index) => {
    grid.appendChild(buildTile(cam, index));
  });

  // Render fallback iframes immediately so the wall is useful the instant
  // it loads, then upgrade tiles to live HLS streams once /api/cameras responds.
  document.querySelectorAll(".camera-tile").forEach(renderFallbackIframe);

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
