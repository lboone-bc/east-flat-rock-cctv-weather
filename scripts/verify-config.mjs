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

const [cameraSource, workerSource, weatherSource, indexSource, packageSource, lockSource, wranglerSource] =
  await Promise.all([
    read("public/cameras.js"),
    read("src/worker.js"),
    read("public/weather.js"),
    read("public/index.html"),
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
assert.match(cameraSource, /const CAMERA_META_RETRY_MS = 10_000/);
assert.match(cameraSource, /const HLS_RETRY_MS = 10_000/);
assert.match(cameraSource, /const HLS_STALL_TIMEOUT_MS = 25_000/);
assert.match(cameraSource, /Date\.now\(\) - playback\.lastProgressAt >= HLS_STALL_TIMEOUT_MS/);
assert.match(workerSource, /"cache-control": "no-store"/);

const packageJson = JSON.parse(packageSource);
const lockJson = JSON.parse(lockSource);
const wranglerJson = JSON.parse(wranglerSource);
const projectName = "east-flat-rock-cctv-weather";
assert.equal(packageJson.name, projectName);
assert.equal(lockJson.name, projectName);
assert.equal(lockJson.packages[""].name, projectName);
assert.equal(wranglerJson.name, projectName);
assert.equal(wranglerJson.keep_vars, true, "Dashboard-managed variables must survive deploys");

console.log(
  "Configuration verified: East Flat Rock center, 8+4 camera order, playback recovery, Worker sync, and project identity."
);
