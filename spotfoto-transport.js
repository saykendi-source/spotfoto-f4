/* =====================================================================
   SPOT FOTO – lapisan data bersama (TV dan HP)
   ---------------------------------------------------------------------
   Struktur data per lokasi (spotfoto/<LOKASI>/...):

     layar              publik   status layar: idle / sibuk / jeda / nonaktif / mati,
                                 pemilik sesi (uid), undangan antrean, detak
     antrean/<uid>      publik   HP yang menunggu giliran (ditulis HP sendiri)
     perintah/<uid>     TV saja  perintah dari HP (ditulis HP sendiri, dibaca TV)
     sesi/<sid>         pemilik  info sesi dan hasil foto, hanya bisa dibaca
                                 pemilik sesi (aturan Firebase)
     unggah/<sid>       TV saja  token unggah yang diperiksa Apps Script

   Mode:
   - Firebase : HP masuk secara anonim, TV masuk dengan akun email khusus.
                Aturan keamanan ada di database.rules.json.
   - Lokal    : tanpa Firebase, untuk uji coba di satu browser (beberapa tab).
                Data disimpan di localStorage dan disiarkan dengan BroadcastChannel.
   ===================================================================== */
(function (global) {
  "use strict";

  const FIREBASE_VERSI = "10.12.2";
  const WAKTU = { ".sv": "timestamp" };   // waktu server (lokal: Date.now())

  const PILIHAN = {
    filter: [
      { id: "normal", nama: "Normal", css: "none" },
      { id: "hangat", nama: "Hangat", css: "sepia(.28) saturate(1.25) contrast(1.05) brightness(1.04)" },
      { id: "film",   nama: "Film",   css: "contrast(1.18) saturate(.82) sepia(.12) brightness(1.02)" },
      { id: "cerah",  nama: "Cerah",  css: "brightness(1.12) saturate(1.35) contrast(1.05)" },
      { id: "sejuk",  nama: "Sejuk",  css: "saturate(1.1) hue-rotate(-12deg) brightness(1.05)" },
      { id: "hitam",  nama: "Hitam putih", css: "grayscale(1) contrast(1.22) brightness(1.04)" }
    ],
    frame: [
      { id: "pita",     nama: "Pita lorong" },
      { id: "cctv",     nama: "Kamera lorong" },
      { id: "polaroid", nama: "Polaroid", teks: true },
      { id: "film",     nama: "Rol film" },
      { id: "polos",    nama: "Tanpa bingkai" }
    ],
    // foto = ukuran bagian foto (diberi bingkai); kartu = posisi foto di poster Story
    format: [
      { id: "feed",       nama: "Feed 4:5",        w: 1080, h: 1350, foto: [1080, 1350] },
      { id: "story",      nama: "Story 9:16",      w: 1080, h: 1920, foto: [920, 1150], kartu: [80, 420, 920, 1150] },
      { id: "storylebar", nama: "Story rombongan", w: 1080, h: 1920, foto: [1000, 563], kartu: [40, 680, 1000, 563] },
      { id: "lebar",      nama: "Lebar 16:9",      w: 1600, h: 900,  foto: [1600, 900] }
    ],
    mode: [
      { id: "foto",      nama: "Foto" },
      { id: "strip",     nama: "Strip" },
      { id: "boomerang", nama: "Boomerang" }
    ],
    // Strip foto beruntun, hasil 1080x1920. foto = ukuran tiap foto di dalam strip.
    strip: {
      "3": { nama: "3 foto", sisi: 80,  atas: 70, jarak: 24, foto: [920, 518] },   // 16:9, sama dengan kamera
      "4": { nama: "4 foto", sisi: 110, atas: 80, jarak: 24, foto: [860, 376] }    // sekitar 2,3:1
    },
    MAKS_TEKS: 40
  };

  function muatScript(src) {
    return new Promise((ok, gagal) => {
      if (document.querySelector(`script[src="${src}"]`)) return ok();
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => gagal(new Error("Gagal memuat " + src));
      document.head.appendChild(s);
    });
  }
  const bersihLokasi = l => String(l || "F4").toUpperCase().replace(/[^A-Z0-9_-]/g, "");

  /* -------------------------------------------------------------------
     MODE LOKAL (uji coba)
     ------------------------------------------------------------------- */
  function dbLokal(lokasi) {
    const KUNCI = "spotfoto-db-" + lokasi;
    const ch = new BroadcastChannel(KUNCI);
    const baca = () => { try { return JSON.parse(localStorage.getItem(KUNCI)) || {}; } catch (e) { return {}; } };
    const tulis = o => localStorage.setItem(KUNCI, JSON.stringify(o));
    const bagian = p => String(p).split("/").filter(Boolean);
    const ambil = (o, p) => bagian(p).reduce((x, k) => (x == null ? undefined : x[k]), o);
    const ganti = v => (v && v[".sv"] ? Date.now() : (v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ganti(x)])) : v));
    function pasang(o, p, v) {
      const ks = bagian(p); let x = o;
      for (let i = 0; i < ks.length - 1; i++) { if (typeof x[ks[i]] !== "object" || x[ks[i]] === null) x[ks[i]] = {}; x = x[ks[i]]; }
      if (v === null || v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = ganti(v);
    }
    const pendengar = new Set();
    function beritahu() {
      const db = baca();
      pendengar.forEach(p => {
        const v = ambil(db, p.path), s = JSON.stringify(v === undefined ? null : v);
        if (s !== p.akhir) { p.akhir = s; p.cb(v === undefined ? null : v); }
      });
    }
    ch.onmessage = beritahu;
    // Event "storage" baru terpicu setelah perubahan benar-benar terlihat di tab ini,
    // jadi pesan BroadcastChannel yang datang lebih dulu tidak membuat perubahan terlewat.
    addEventListener("storage", e => { if (e.key === KUNCI) beritahu(); });
    const ubah = fn => { const db = baca(); fn(db); tulis(db); ch.postMessage(1); setTimeout(beritahu, 0); return Promise.resolve(); };
    let uid = null;
    try { uid = sessionStorage.getItem("spotfoto-uid-lokal"); } catch (e) {}
    if (!uid) { uid = "lokal-" + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem("spotfoto-uid-lokal", uid); } catch (e) {} }
    const putus = [];
    addEventListener("pagehide", () => putus.forEach(([p, v]) => ubah(db => pasang(db, p, v))));

    return {
      mode: "lokal", WAKTU,
      masuk: () => Promise.resolve(uid),
      uid: () => uid,
      set: (p, v) => ubah(db => pasang(db, p, v)),
      update: (p, o) => ubah(db => Object.keys(o).forEach(k => pasang(db, p + "/" + k, o[k]))),
      hapus: p => ubah(db => pasang(db, p, null)),
      sekali: p => Promise.resolve(ambil(baca(), p) ?? null),
      dengar(p, cb) {
        const e = { path: p, cb, akhir: undefined };
        pendengar.add(e);
        setTimeout(() => { if (!pendengar.has(e)) return; const v = ambil(baca(), p); e.akhir = JSON.stringify(v ?? null); cb(v ?? null); }, 0);
        return () => pendengar.delete(e);
      },
      saatPutus: (p, v) => { putus.push([p, v]); return Promise.resolve(); },
      batalPutus: p => { for (let i = putus.length - 1; i >= 0; i--) if (putus[i][0] === p) putus.splice(i, 1); return Promise.resolve(); },
      saatTersambung: cb => { setTimeout(() => cb(true), 0); }
    };
  }

  /* -------------------------------------------------------------------
     MODE FIREBASE
     ------------------------------------------------------------------- */
  function dbFirebase(lokasi, config) {
    const base = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSI + "/";
    let db = null, auth = null;
    const siap = muatScript(base + "firebase-app-compat.js")
      .then(() => Promise.all([muatScript(base + "firebase-auth-compat.js"), muatScript(base + "firebase-database-compat.js")]))
      .then(() => {
        const fb = global.firebase;
        const app = fb.apps.length ? fb.app() : fb.initializeApp(config);
        db = app.database(); auth = app.auth();
      });
    const akar = "spotfoto/" + lokasi + "/";
    const ref = p => db.ref(akar + p);

    return {
      mode: "firebase", WAKTU,
      // login: { email, sandi } untuk TV; kosong = masuk anonim (HP)
      masuk(login) {
        return siap.then(() => (auth.currentUser ? auth.currentUser : null))
          .then(u => u || (login && login.email
            ? auth.signInWithEmailAndPassword(login.email, login.sandi).then(c => c.user)
            : auth.signInAnonymously().then(c => c.user)))
          .then(u => u.uid);
      },
      uid: () => (auth && auth.currentUser ? auth.currentUser.uid : null),
      set: (p, v) => ref(p).set(v),
      update: (p, o) => ref(p).update(o),
      hapus: p => ref(p).remove(),
      sekali: p => ref(p).once("value").then(s => s.val()),
      dengar(p, cb, galat) {
        const r = ref(p);
        const h = r.on("value", s => cb(s.val()), e => { console.warn("Spot Foto: tidak bisa membaca " + p, e && e.code); if (galat) galat(e); });
        return () => r.off("value", h);
      },
      saatPutus: (p, v) => ref(p).onDisconnect().set(v),
      batalPutus: p => ref(p).onDisconnect().cancel(),
      saatTersambung(cb) { db.ref(".info/connected").on("value", s => cb(!!s.val())); }
    };
  }

  function buat(opsi) {
    const lokasi = bersihLokasi(opsi.lokasi);
    const pakaiFirebase = opsi.firebase && opsi.firebase.databaseURL;
    return pakaiFirebase ? dbFirebase(lokasi, opsi.firebase) : dbLokal(lokasi);
  }

  global.SpotTransport = { buat, PILIHAN, bersihLokasi };
})(window);
