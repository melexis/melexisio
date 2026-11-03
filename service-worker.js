/* Melexis IO Tools — offline shell.
 *
 * Network-first on purpose: these pages are edited live during development and
 * a cache-first worker keeps serving stale HTML/JS long after a change. The
 * cache is only a fallback for when the network is unavailable.
 */
const CACHE = "melexis-io-tools-v5";

const SHELL = [
  "./",
  "./index.html",
  "./isp/",
  "./isp/index.html",
  "./isp/js/dfu.js",
  "./isp/js/dfuse.js",
  "./isp/js/firmware-updater.js",
  "./tools/firmware.html",
  "./tools/terminal.html",
  "./tools/dfuupdate.html",
  "./tools/espupdate.html",
  "./tools/i2cdebug.html",
  "./tools/wifi.html",
  "./tools/webusb-probe.html",
  "./pressure/",
  "./pressure/index.html",
  "./pressure/mlx90835.html",
  "./pressure/README.md",
  "./pressure/LICENSE",
  "./triaxis/",
  "./triaxis/index.html",
  "./triaxis/angle_calib.js",
  "./triaxis/angle_calib_demo.html",
  "./triaxis/mlx90396-2.html",
  "./triaxis/mlx90396/",
  "./triaxis/mlx90396/index.html",
  "./triaxis/mlx90396/app.js",
  "./triaxis/mlx90396/mlx_api.js",
  "./triaxis/mlx90396/arduino_api.js",
  "./triaxis/mlx90396/sfi_demo.js",
  "./triaxis/mlx90396/twist_api.js",
  "./triaxis/mlx90396/help.js",
  "./triaxis/mlx90396/joystick_help_readme.md",
  "./triaxis/mlx90396/webdesign.css",
  "./triaxis/mlx90396-voxdale/",
  "./triaxis/mlx90396-voxdale/index.html",
  "./triaxis/mlx90396-voxdale/app.js",
  "./triaxis/mlx90396-voxdale/mlx_api.js",
  "./triaxis/mlx90396-voxdale/arduino_api.js",
  "./triaxis/mlx90396-voxdale/sfi_demo.js",
  "./triaxis/mlx90396-voxdale/help.js",
  "./triaxis/mlx90396-voxdale/sfi_help_readme.md",
  "./triaxis/mlx90396-voxdale/webdesign.css",
  "./fir/",
  "./fir/index.html",
  "./fir/detect.html",
  "./fir/mlx90614.html",
  "./fir/mlx90632.html",
  "./fir/mlx90640.html",
  "./fir/mlx90641.html",
  "./fir/mlx90642.html",
  "./css/theme.css",
  "./css/vendor/bootstrap-5.3.3.min.css",
  "./js/vendor/chart-4.4.1.umd.min.js",
  "./js/vendor/marked-15.0.12.min.js",
  "./css/style.css",
  "./js/app.js",
  "./js/serial-port.js",
  "./js/vendor/esptool-js-0.7.0.js",
  "./favicon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => undefined))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Leave cross-origin requests (fonts) and non-GET traffic alone.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(
        (cached) => cached || (request.mode === "navigate"
          ? caches.match("./index.html")
          : undefined)
      ))
  );
});

// Lets a page trigger an immediate update instead of waiting for a reload.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") {
    self.skipWaiting();
  }
});
