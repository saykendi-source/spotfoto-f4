/* Service worker Jadwal TV
   - Halaman: ambil dari jaringan dulu, pakai salinan tersimpan bila offline.
   - Font Google dan gambar wallpaper: pakai salinan tersimpan dulu.
   - Data jadwal (script.google.com) tidak disentuh; halaman menyimpannya sendiri di localStorage.
   Naikkan nomor versi CACHE bila ingin memaksa pembaruan. */
const CACHE = "jadwal-tv-v6";
const SHELL = ["./", "./index.html", "./spotfoto.js", "./spotfoto-transport.js", "./spotfoto-config.js", "./manifest.json", "./ikon-192.png", "./ikon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Font Google dan gambar wallpaper (Google Drive) disimpan agar tetap tampil saat offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "lh3.googleusercontent.com") {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
      }))
    );
  }
});
