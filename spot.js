/* =====================================================================
   SPOT FOTO – halaman HP (spot.html)
   Membaca: layar (publik), antrean (publik), sesi/<sid> (hanya pemilik).
   Menulis: perintah/<uid> dan antrean/<uid> milik sendiri.
   ===================================================================== */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const C = window.SPOTFOTO_CONFIG || {};
  const LOKASI = SpotTransport.bersihLokasi(qs.get("lokasi") || C.LOKASI || "F4");
  const P = SpotTransport.PILIHAN;
  const T = SpotTransport.buat({ lokasi: LOKASI, firebase: C.FIREBASE });
  const JEDA = C.JEDA_DETIK || 20;
  $("tempat").textContent = "Lorong Gedung " + LOKASI;

  let uid = null, layarData = null, layarAt = 0, antreanData = {}, mulaiAt = Date.now();
  let ingin = true, diAntrean = false, haloAt = 0, nCmd = 0;
  let sesiSaya = null, lepasSesi = [], info = null, hasilSesi = {}, galeri = [];
  const sesiUsai = new Set();   // sesi yang sudah berakhir, jangan dipasang lagi
  let layar = "hubung", batas = 0, terakhirKode = "";
  let opsi = { frame: "pita", filter: "normal", teks: "", format: C.FORMAT_AWAL || "feed", mode: "foto", jumlah: "4" };
  let fitur = { teks: true, boomerang: !!C.BOOMERANG };

  function ke(l) {
    if (l === layar) return;
    layar = l;
    document.querySelectorAll("section[data-layar]").forEach(s => s.classList.toggle("aktif", s.dataset.layar === l));
    window.scrollTo(0, 0);
    if (l === "kode") setTimeout(() => $("inKode").focus(), 60);
  }
  document.querySelector('section[data-layar="hubung"]').classList.add("aktif");

  function infoLayar(judul, teks, tombol) {
    $("infoJudul").textContent = judul; $("infoTeks").textContent = teks || "";
    $("infoTombol").hidden = !tombol;
    ke("info");
  }

  // t selalu naik agar TV bisa membedakan perintah baru dari yang lama.
  function kirim(tipe, data) {
    if (!uid) return;
    T.set("perintah/" + uid, Object.assign({ tipe, sesi: sesiSaya || "", t: Date.now() * 1000 + (nCmd++ % 1000) }, data || {}));
  }

  /* ---------------- Antrean ---------------- */
  function masukAntrean() {
    if (diAntrean) return;
    diAntrean = true;
    T.set("antrean/" + uid, { t: T.WAKTU });
    T.saatPutus("antrean/" + uid, null);   // keluar otomatis bila halaman ditutup
  }
  function keluarAntrean() {
    if (!diAntrean) return;
    diAntrean = false;
    T.batalPutus("antrean/" + uid);
    T.hapus("antrean/" + uid);
  }
  function posisiAntrean() {
    const urut = Object.entries(antreanData).filter(([, v]) => v && v.t).sort((a, b) => a[1].t - b[1].t).map(([u]) => u);
    const i = urut.indexOf(uid);
    return i < 0 ? null : i + 1;
  }

  /* ---------------- Keputusan utama ---------------- */
  function evaluasi() {
    const l = layarData;
    if (!l) return;
    if (l.state === "mati" && sesiSaya) { tampilSelesai("terputus"); return; }
    if (l.owner === uid && l.sesi && !sesiUsai.has(l.sesi)) { if (sesiSaya !== l.sesi) pasangSesi(l.sesi); return; }
    if (sesiSaya) return;   // sesi kita baru berakhir; layar selesai ditangani dari info sesi
    if (!ingin) return;

    if (l.state === "mati") { infoLayar("Layar sedang tidak tersambung", "Coba beberapa saat lagi, atau beri tahu admin prodi.", true); return; }
    if (l.state === "nonaktif") { keluarAntrean(); infoLayar("Spot Foto sedang tidak aktif", "Coba lagi lain waktu ya."); return; }
    if (l.state === "jeda") { infoLayar("Tunggu sebentar", `Layar bisa dipakai lagi dalam ${l.jeda || 30} detik.`); return; }

    const lainMenunggu = Object.keys(antreanData).some(u => u !== uid);
    const giliranKu = l.state === "idle" && (l.undang ? l.undang === uid : !lainMenunggu);
    if (giliranKu) {
      if (Date.now() - haloAt > 3000) { haloAt = Date.now(); kirim("halo"); }
      if (layar !== "antre") ke("hubung");
      return;
    }
    masukAntrean();
    const pos = posisiAntrean();
    $("antreNomor").innerHTML = `<small>Antreanmu</small>${pos || "…"}`;
    $("antreTeks").textContent = l.undang === uid ? "Giliranmu! Menghubungkan…" :
      (pos === 1 ? "Kamu berikutnya. Giliranmu dimulai otomatis begitu layar kosong." : "Giliranmu dimulai otomatis. Biarkan halaman ini tetap terbuka.");
    ke("antre");
  }

  /* ---------------- Sesi milik sendiri ---------------- */
  function pasangSesi(sid) {
    lepasSesi.forEach(f => f()); lepasSesi = [];
    sesiSaya = sid; info = null; hasilSesi = {};
    diAntrean = false; T.batalPutus("antrean/" + uid);
    let coba = 0;
    const ulang = () => { if (sesiSaya === sid && coba++ < 5) setTimeout(() => pasang(), 800); };
    const pasang = () => {
      lepasSesi.forEach(f => f()); lepasSesi = [];
      lepasSesi.push(T.dengar(`sesi/${sid}/info`, onInfo, ulang));
      lepasSesi.push(T.dengar(`sesi/${sid}/hasil`, onHasil, ulang));
    };
    pasang();
  }

  function onInfo(i) {
    if (!i || !sesiSaya) return;
    info = i;
    batas = i.sisa != null ? Date.now() + i.sisa * 1000 : 0;
    if (i.fitur) fitur = { teks: !!i.fitur.teks, boomerang: !!i.fitur.boomerang && !!C.BOOMERANG };
    if (i.opsi) {
      const ketik = document.activeElement === inTeks;
      opsi = Object.assign({}, i.opsi, ketik ? { teks: inTeks.value } : {});
      if (!ketik) { inTeks.value = opsi.teks || ""; $("hitungTeks").textContent = inTeks.value.length + "/" + P.MAKS_TEKS; }
    }
    tandai();
    $("pesanTeks").textContent = (i.state === "kamera" && i.pesan) || "";

    switch (i.state) {
      case "kode":
        if (layar !== "kode") { inKode.value = ""; gambarKode(); }
        if (i.pesan && i.pesan !== terakhirKode) { inKode.value = ""; gambarKode(); inKode.focus(); }
        terakhirKode = i.pesan || "";
        $("pesanKode").textContent = i.pesan || "";
        ke("kode");
        break;
      case "siap": ke("siap"); break;
      case "kamera": case "hitung": case "rekam": case "proses": {
        const boom = opsi.mode === "boomerang";
        $("rana").disabled = i.state !== "kamera";
        $("ranaLabel").textContent = {
          hitung: i.strip ? `Foto ${i.strip.ke} dari ${i.strip.dari}. Ganti gaya, lihat ke layar!` : boom ? "Siap-siap bergerak! Lihat ke layar" : "Senyum! Lihat ke layar 📸",
          rekam: "Bergerak sekarang! 🔁",
          proses: boom ? "Menyusun boomerang…" : opsi.mode === "strip" ? "Menyusun strip…" : "Menyimpan foto…",
          kamera: labelRana()
        }[i.state];
        ke("kamera");
        break;
      }
      case "hasil": tampilHasil(); ke("hasil"); break;
      case "galat": $("galatJudul").textContent = i.pesan || "Kamera bermasalah"; ke("galat"); break;
      case "selesai": tampilSelesai(i.alasan); break;
    }
  }

  function onHasil(h) {
    if (!h) return;
    Object.entries(h).forEach(([k, v]) => { hasilSesi[k] = Object.assign(hasilSesi[k] || {}, v); });
    if (layar === "hasil" || (info && info.state === "hasil")) tampilHasil();
  }

  function tampilHasil() {
    const kunci = Object.keys(hasilSesi).sort();
    const h = hasilSesi[kunci[kunci.length - 1]];
    if (!h) return;
    const vid = h.jenis === "video", img = $("hasilFoto"), v = $("hasilVideo");
    $("hasilJudul").textContent = vid ? "Boomerang-mu sudah jadi!" : "Fotomu sudah jadi!";
    $("btnLagi").textContent = vid ? "Rekam lagi" : "Foto lagi";
    if (vid && h.unduh && h.unduh.startsWith("data:")) { img.hidden = true; v.hidden = false; if (v.dataset.nama !== h.nama) { v.src = h.unduh; v.dataset.nama = h.nama; } }
    else { v.hidden = true; v.removeAttribute("src"); delete v.dataset.nama; img.hidden = false; if (img.dataset.nama !== h.nama) { img.src = h.pratinjau || ""; img.dataset.nama = h.nama; } }

    const a = $("hasilUnduh");
    if (h.status === "mengunggah" || !h.unduh) {
      a.setAttribute("aria-disabled", "true"); a.removeAttribute("href");
      a.textContent = "Menyiapkan link unduh…";
    } else {
      a.removeAttribute("aria-disabled");
      a.href = h.unduh;
      a.setAttribute("download", h.nama || "spotfoto.jpg");
      if (!h.unduh.startsWith("data:")) a.target = "_blank"; else a.removeAttribute("target");
      a.textContent = vid ? "Simpan video" : "Simpan foto";
    }
    $("hasilCatatan").textContent = vid
      ? (h.h264 ? "Video MP4 siap diunggah ke Story atau Reels." : "Video ini memakai format yang belum tentu diterima Instagram, terutama di iPhone. Jika gagal diunggah, simpan ulang lewat aplikasi edit video.")
      : (h.catatan === "drive-gagal" ? "Penyimpanan cadangan sedang bermasalah, jadi foto langsung dikirim ke HP-mu. Simpan sekarang ya."
        : "Jika tombol simpan tidak bekerja, tekan lama gambar lalu pilih simpan.");
    siapkanBagikan(h);
  }

  async function siapkanBagikan(h) {
    const tb = $("hasilBagikan");
    tb.hidden = true;
    if (!navigator.canShare || !h.unduh || !h.unduh.startsWith("data:")) return;
    try {
      const blob = await (await fetch(h.unduh)).blob();
      const file = new File([blob], h.nama, { type: h.mime || "image/jpeg" });
      if (!navigator.canShare({ files: [file] })) return;
      tb.hidden = false;
      tb.onclick = () => navigator.share({ files: [file], title: "Spot Foto" }).catch(() => {});
    } catch (e) {}
  }

  const ALASAN = {
    jeda: ["Sesi selesai", `Layar kembali ke jadwal karena tidak ada aktivitas selama ${JEDA} detik.`],
    kode: ["Kode salah terlalu banyak", "Tunggu sebentar, lalu coba lagi."],
    pengguna: ["Terima kasih sudah mampir!", ""],
    galat: ["Kamera bermasalah", "Coba beberapa saat lagi. Jika masih gagal, hubungi admin prodi."],
    admin: ["Sesi dihentikan", "Sesi diakhiri oleh admin."],
    terputus: ["Layar terputus", "Sambungan ke layar TV hilang di tengah sesi."]
  };

  function tampilSelesai(alasan) {
    if (!sesiSaya) return;
    lepasSesi.forEach(f => f()); lepasSesi = [];
    sesiUsai.add(sesiSaya);
    Object.keys(hasilSesi).sort().reverse().forEach(k => galeri.unshift(hasilSesi[k]));
    sesiSaya = null; info = null; hasilSesi = {}; batas = 0; ingin = false;
    const [j, t] = ALASAN[alasan] || ALASAN.pengguna;
    $("selesaiJudul").textContent = j;
    const siap = galeri.filter(g => g.unduh);
    $("selesaiTeks").textContent = siap.length ? (t ? t + " " : "") + "Fotomu:" : (t || "Pindai QR lagi kapan saja untuk berfoto.");
    $("galeri").innerHTML = siap.map(g => `<a href="${g.unduh}" download="${g.nama}" target="_blank" rel="noopener"><img src="${g.pratinjau}" alt="${g.jenis === "video" ? "Boomerang" : "Foto"} ${g.nama}"><b>${g.jenis === "video" ? "🔁 Boomerang" : String(g.format || "").startsWith("strip") ? "🎞️ Strip" : ((P.format.find(f => f.id === g.format) || {}).nama || "")}</b></a>`).join("");
    $("catatanHapus").hidden = !siap.some(g => g.lihat);
    ke("selesai");
  }

  /* ---------------- Pilihan gaya ---------------- */
  function chip(item, jenis) {
    const b = document.createElement("button");
    b.className = "chip" + (jenis === "filter" ? "" : " polos");
    b.dataset.jenis = jenis; b.dataset.id = item.id;
    b.innerHTML = (jenis === "filter" ? `<i style="filter:${item.css}"></i>` : "") + item.nama;
    b.addEventListener("click", () => { opsi[jenis] = item.id; tandai(); kirim("atur", opsi); });
    return b;
  }
  P.filter.forEach(f => $("pilFilter").appendChild(chip(f, "filter")));
  P.frame.forEach(f => $("pilFrame").appendChild(chip(f, "frame")));
  P.format.forEach(f => {
    const c = chip(f, "format");
    const [fw, fh] = f.kartu ? [f.w, f.h] : f.foto, tinggi = 18, lebar = Math.round(tinggi * fw / fh);
    c.innerHTML = `<span class="rasio" style="width:${lebar}px;height:${tinggi}px" aria-hidden="true"></span>` + f.nama;
    $("pilFormat").appendChild(c);
  });
  Object.entries(P.strip).forEach(([id, s]) => {
    const c = chip({ id, nama: s.nama }, "jumlah");
    const fotoIkon = Array.from({ length: Number(id) }, () => '<span style="display:block;height:4px;border-radius:1px;background:currentColor;margin:2px 0"></span>').join("");
    c.innerHTML = `<span aria-hidden="true" style="display:inline-block;width:14px;padding:2px;border:2px solid currentColor;border-radius:3px;margin-right:3px">${fotoIkon}</span>` + s.nama;
    $("pilJumlah").appendChild(c);
  });
  P.mode.forEach(m => {
    const b = document.createElement("button");
    b.dataset.jenis = "mode"; b.dataset.id = m.id; b.textContent = { foto: "📸 Foto", strip: "🎞️ Strip", boomerang: "🔁 Boomerang" }[m.id];
    b.addEventListener("click", () => { opsi.mode = m.id; tandai(); kirim("atur", opsi); });
    $("pilMode").appendChild(b);
  });

  const inTeks = $("inTeks");
  const labelRana = () => opsi.mode === "boomerang" ? "Rekam boomerang" : opsi.mode === "strip" ? `Mulai strip (${opsi.jumlah} foto)` : "Jepret";
  function tandai() {
    document.querySelectorAll(".chip,.mode button").forEach(c => c.setAttribute("aria-pressed", String(opsi[c.dataset.jenis] === c.dataset.id)));
    const f = P.frame.find(x => x.id === opsi.frame), strip = opsi.mode === "strip";
    if (!fitur.boomerang && opsi.mode === "boomerang") opsi.mode = "foto";
    const tBoom = document.querySelector('#pilMode [data-id="boomerang"]'); if (tBoom) tBoom.hidden = !fitur.boomerang;
    $("grupJumlah").hidden = !strip;
    $("grupFormat").hidden = strip;
    $("grupBingkai").hidden = strip;
    $("grupTeks").hidden = !fitur.teks || !(strip || (f && f.teks));
    $("labelTeks").textContent = strip ? "Tulisan di bawah strip" : "Tulisan di polaroid";
    inTeks.placeholder = strip ? "Misalnya: Hari-hari yang tak terlupakan" : "Tulis sesuatu, misalnya: Hari pertama kuliah!";
    if (!$("rana").disabled) $("ranaLabel").textContent = labelRana();
  }
  tandai();
  inTeks.maxLength = P.MAKS_TEKS;
  let tTeks = null;
  inTeks.addEventListener("input", () => {
    $("hitungTeks").textContent = inTeks.value.length + "/" + P.MAKS_TEKS;
    opsi.teks = inTeks.value;
    clearTimeout(tTeks);
    tTeks = setTimeout(() => kirim("atur", opsi), 350);
  });
  inTeks.addEventListener("keydown", e => { if (e.key === "Enter") inTeks.blur(); });

  /* ---------------- Kode ---------------- */
  const inKode = $("inKode"), sel = [...document.querySelectorAll("#kotak span")];
  function gambarKode() {
    const v = inKode.value;
    sel.forEach((s, i) => { s.textContent = v[i] || ""; s.classList.toggle("aktif", i === Math.min(v.length, 3) && document.activeElement === inKode); });
  }
  inKode.addEventListener("input", () => {
    inKode.value = inKode.value.replace(/\D/g, "").slice(0, 4);
    gambarKode();
    if (inKode.value.length === 4) { kirim("kode", { kode: inKode.value }); $("pesanKode").textContent = "Memeriksa…"; }
  });
  inKode.addEventListener("focus", gambarKode); inKode.addEventListener("blur", gambarKode);

  /* ---------------- Tombol ---------------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const a = b.dataset.aksi;
    if (a === "baru") { ingin = true; haloAt = 0; ke("hubung"); evaluasi(); }
    else if (a === "muatUlang") location.reload();
    else if (a === "jepret") { kirim("jepret"); $("rana").disabled = true; }
    else if (a === "lagi") kirim("lagi");
    else if (a === "selesai") kirim("selesai");
  });

  /* ---------------- Pengatur waktu ---------------- */
  setInterval(() => {
    const el = $("sisa");
    if (!batas || !["kode", "kamera", "hasil"].includes(layar)) el.classList.remove("on");
    else {
      const s = Math.max(0, Math.ceil((batas - Date.now()) / 1000));
      el.textContent = `Sisa ${s} dtk`;
      el.classList.add("on");
      el.classList.toggle("mepet", s <= 8);
    }
    // TV mengirim detak tiap 5 detik. Tidak ada kabar 15 detik = layar terputus.
    const diam = Date.now() - (layarAt || mulaiAt);
    if (diam > 15000 && (ingin || sesiSaya)) {
      if (sesiSaya) tampilSelesai("terputus");
      else infoLayar(layarAt ? "Layar tidak merespons" : "Layar belum ditemukan",
        "Pastikan kamu memindai QR di dekat layar dan internet HP aktif.", true);
    }
  }, 500);

  /* ---------------- Mulai ---------------- */
  T.masuk().then(u => {
    uid = u;
    T.dengar("antrean", a => {
      antreanData = a || {};
      if (diAntrean && !antreanData[uid] && !(layarData && layarData.owner === uid)) diAntrean = false;  // dilewati TV
      evaluasi();
    });
    T.dengar("layar", l => { layarData = l; layarAt = Date.now(); evaluasi(); });
  }).catch(e => { console.error(e); infoLayar("Tidak dapat terhubung", "Periksa koneksi internet HP-mu, lalu coba lagi.", true); });
})();
