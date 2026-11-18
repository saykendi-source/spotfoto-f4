/* =====================================================================
   SPOT FOTO – modul tambahan layar Jadwal TV (versi 4)
   ---------------------------------------------------------------------
   Alur: JADWAL -> (HP scan QR) KODE -> SIAP -> KAMERA -> HITUNG -> PROSES
         -> HASIL -> ... -> kembali ke JADWAL bila tidak ada aktivitas
         selama JEDA_DETIK.

   Keamanan (mode Firebase):
   - TV masuk dengan akun email khusus, HP masuk anonim.
   - Pemilik sesi dikenali dari uid Firebase, bukan dari data kiriman HP.
   - Hasil foto hanya bisa dibaca pemilik sesi; data sesi dihapus 60 detik
     setelah sesi selesai.
   - Unggahan ke Drive memakai token per sesi yang diperiksa Apps Script.

   Pengaturan ada di spotfoto-config.js. Untuk mematikan fitur foto,
   hapus tag <script> Spot Foto di akhir index.html, atau setel
   FOTO_AKTIF = FALSE di Google Sheet.
   ===================================================================== */
(function () {
  "use strict";

  if (!window.SpotTransport) { console.warn("Spot Foto: spotfoto-transport.js belum dimuat"); return; }
  const qs = new URLSearchParams(location.search);
  const C = Object.assign({
    LOKASI: "F4",
    FIREBASE: null,
    APPS_SCRIPT: "",
    KUNCI_LOG: "",
    JEDA_DETIK: 20,
    PERINGATAN_DETIK: 8,
    HITUNG_MUNDUR: 3,
    MAKS_SALAH_KODE: 3,
    JEDA_SETELAH_GAGAL_DETIK: 30,
    UNDANGAN_DETIK: 15,        // batas waktu HP berikutnya di antrean untuk merespons
    HAPUS_SESI_DETIK: 60,      // data sesi di Firebase dihapus setelah sesi selesai
    CERMIN: true,
    SIMPAN_CERMIN: true,
    MUTU_JPEG: .9,
    FORMAT_AWAL: "feed",
    JUDUL: "Teknik Informatika",
    NAMA_TEMPAT: "",
    BATAS_KAMERA_DETIK: 15,
    KATA_TERLARANG: [],
    TEKS_AKTIF: true,
    BOOMERANG: false,
    BOOM_LEBAR: 720, BOOM_BINGKAI: 18, BOOM_JEDA_MS: 70, BOOM_PUTARAN: 4, BOOM_BITRATE: 3500000
  }, window.SPOTFOTO_CONFIG || {});
  C.LOKASI = SpotTransport.bersihLokasi(qs.get("lokasi") || C.LOKASI);
  const NAMA_TEMPAT_AWAL = C.NAMA_TEMPAT || "Lorong Gedung " + C.LOKASI;
  const KATA_DASAR = C.KATA_TERLARANG.slice();
  C.NAMA_TEMPAT = NAMA_TEMPAT_AWAL;

  const stage = document.getElementById("stage");
  if (!stage) { console.warn("Spot Foto: #stage tidak ditemukan"); return; }
  const PILIHAN = SpotTransport.PILIHAN;
  const T = SpotTransport.buat({ lokasi: C.LOKASI, firebase: C.FIREBASE });

  let loginTv = null;
  try { loginTv = JSON.parse(localStorage.getItem("spotfoto-tv-login") || "null"); } catch (e) {}
  if (T.mode === "firebase" && !(loginTv && loginTv.email)) {
    console.warn("Spot Foto: login layar TV belum disimpan. Buka cek-perangkat.html di TV box untuk menyimpannya.");
    return;
  }

  /* ---------------------------------------------------------------
     CSS & DOM (koordinat panggung 1920x1080, ikut diskalakan)
     --------------------------------------------------------------- */
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap";
  document.head.appendChild(fontLink);
  const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
  const FONT_TANGAN = '"Caveat", "Segoe Print", "Comic Sans MS", cursive';
  const FONT_MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

  const css = `
.sf{position:absolute;inset:0;z-index:40;display:none;color:#fff;font-family:inherit}
.sf:not([data-state="idle"]){display:block}
.sf>section{position:absolute;inset:0;display:none}
.sf[data-state="kode"] .sf-kode,.sf[data-state="siap"] .sf-siap,.sf[data-state="galat"] .sf-galat{display:flex}
.sf[data-state="kamera"] .sf-cam,.sf[data-state="hitung"] .sf-cam,.sf[data-state="rekam"] .sf-cam,.sf[data-state="proses"] .sf-cam{display:block}
.sf[data-state="hasil"] .sf-hasil{display:grid}

.sf-kode,.sf-siap,.sf-galat{align-items:center;justify-content:center;background:rgba(3,12,30,.9)}
.sf-card{width:1060px;padding:64px 72px 56px;border-radius:44px;text-align:center;background:linear-gradient(180deg,#123a7a,#0a2350);
  border:1px solid rgba(255,255,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 40px 90px -20px rgba(0,0,0,.6)}
.sf-card h2{margin:0;font-size:52px;font-weight:800;letter-spacing:-.02em}
.sf-card p{margin:18px 0 0;font-size:28px;font-weight:600;color:rgba(235,242,255,.78)}
.sf-digit{display:flex;justify-content:center;gap:28px;margin:48px 0 8px}
.sf-digit b{width:178px;height:220px;border-radius:32px;display:flex;align-items:center;justify-content:center;
  font-size:156px;font-weight:800;letter-spacing:-.04em;background:#fff;color:#0a2a5c;box-shadow:inset 0 -10px 0 rgba(10,42,92,.12)}
.sf-pesan{min-height:44px;margin-top:22px;font-size:30px;font-weight:700;color:#ffd27a}
.sf-spin{width:96px;height:96px;margin:0 auto 34px;border-radius:50%;border:10px solid rgba(255,255,255,.18);border-top-color:#fff;animation:sfspin 1s linear infinite}
@keyframes sfspin{to{transform:rotate(360deg)}}

/* Kamera */
.sf-cam{background:#000;overflow:hidden}
.sf-video,.sf-beku{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sf-cermin .sf-video{transform:scaleX(-1)}
.sf-beku{display:none;object-fit:contain;background:#000}
.sf[data-state="proses"] .sf-beku{display:block}
.sf-bingkai{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.sf-bar{position:absolute;left:0;right:0;top:0;height:96px;display:flex;align-items:center;gap:22px;padding:0 44px;
  background:linear-gradient(180deg,rgba(0,0,0,.66),rgba(0,0,0,0));font-size:28px;font-weight:700;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.sf-bar .sf-tag{background:rgba(10,91,216,.92);padding:8px 22px;border-radius:999px;text-shadow:none;flex:none}
.sf-bar .sf-fmt{background:rgba(255,255,255,.18);padding:8px 20px;border-radius:999px;text-shadow:none;flex:none}
.sf-bar .sf-next{margin-left:auto;font-weight:600;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:900px}
/* Format potret: label TV pindah ke sisi kiri/kanan agar area foto bersih */
.sf-sempit .sf-bar{right:auto;width:var(--sisi);height:auto;flex-wrap:wrap;gap:14px;padding:30px 36px;background:none}
.sf-sempit .sf-next{position:absolute;left:auto;right:calc(-1 * (1920px - var(--sisi)));top:380px;width:var(--sisi);max-width:none;
  margin:0;padding:0 40px;white-space:normal;text-align:center;font-size:26px;line-height:1.45}
.sf-sisa{position:absolute;left:0;top:0;height:8px;background:#5aa2ff;transition:width .25s linear}
.sf-warn{position:absolute;left:50%;top:128px;transform:translateX(-50%);padding:14px 34px;border-radius:999px;
  background:rgba(0,0,0,.66);font-size:32px;font-weight:700;display:none;white-space:nowrap}
.sf-warn.on{display:block}
.sf-hitung{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
  font-size:460px;font-weight:800;letter-spacing:-.06em;text-shadow:0 10px 60px rgba(0,0,0,.55)}
.sf[data-state="hitung"] .sf-hitung{display:flex}
.sf-hitung small{position:absolute;left:0;right:0;top:150px;text-align:center;font-size:56px;font-weight:800;letter-spacing:-.01em}
.sf-thumbs{position:absolute;right:40px;bottom:40px;display:flex;flex-direction:column-reverse;gap:12px}
.sf-thumbs img{width:230px;border:6px solid #fbfaf6;border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.5);animation:sfmasuk .4s ease-out both}
@keyframes sfmasuk{from{transform:translateX(40px);opacity:0}}
.sf-hitung span{animation:sfpop 1s ease-out both}
@keyframes sfpop{0%{transform:scale(1.5);opacity:0}25%{transform:scale(1);opacity:1}85%{opacity:1}100%{opacity:.2;transform:scale(.92)}}
.sf-rekam{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);display:none;align-items:center;gap:18px;
  padding:18px 40px;border-radius:999px;background:#d92d20;font-size:40px;font-weight:800}
.sf-rekam i{width:22px;height:22px;border-radius:50%;background:#fff;animation:sfkedip .6s ease-in-out infinite alternate}
@keyframes sfkedip{to{opacity:.25}}
.sf[data-state="rekam"] .sf-rekam{display:flex}
.sf-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.sf-flash.on{animation:sfflash .7s ease-out}
@keyframes sfflash{0%{opacity:1}100%{opacity:0}}
.sf-status{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);padding:18px 40px;border-radius:999px;
  background:rgba(0,0,0,.72);font-size:34px;font-weight:700;display:none}
.sf[data-state="proses"] .sf-status{display:block}

/* Hasil */
.sf-hasil{grid-template-columns:1fr 520px;align-items:center;gap:64px;padding:80px 100px 80px 90px;
  background:radial-gradient(80% 90% at 20% 20%,#1a4f9e,transparent 60%),linear-gradient(160deg,#0b2b5e,#030b1d)}
.sf-media{display:flex;align-items:center;justify-content:center;height:920px;min-width:0}
.sf-foto{display:block;max-width:100%;max-height:880px;width:auto;height:auto;border:14px solid #fff;border-radius:12px;
  transform:rotate(-1.6deg);box-shadow:0 40px 80px -20px rgba(0,0,0,.7);background:#222}
.sf-foto[hidden]{display:none}
.sf-sisi h2{margin:0;font-size:58px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
.sf-sisi p{margin:20px 0 0;font-size:28px;font-weight:600;line-height:1.4;color:rgba(235,242,255,.8)}
.sf-antre{flex:none;background:#ffd27a;color:#2a1d00;padding:8px 20px;border-radius:999px;text-shadow:none;display:none}
.sf-antre.on{display:block}
.sf-hasil .sf-warn{top:auto;bottom:40px}
@media (prefers-reduced-motion:reduce){.sf-hitung span,.sf-flash.on,.sf-spin,.sf-rekam i{animation:none}}
`;
  const st = document.createElement("style");
  st.id = "spotfoto-css";
  st.textContent = css;
  document.head.appendChild(st);

  const root = document.createElement("div");
  root.className = "sf" + (C.CERMIN ? " sf-cermin" : "");
  root.dataset.state = "idle";
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
  <section class="sf-kode">
    <div class="sf-card">
      <h2>Halo! Ketik kode ini di HP-mu</h2>
      <div class="sf-digit" id="sfDigit"></div>
      <p>Kode hanya berlaku untuk sesi ini.</p>
      <div class="sf-pesan" id="sfPesan"></div>
    </div>
  </section>
  <section class="sf-siap">
    <div class="sf-card"><div class="sf-spin"></div><h2>Menyalakan kamera…</h2><p>Lihat ke layar dan siapkan gaya terbaikmu.</p></div>
  </section>
  <section class="sf-galat">
    <div class="sf-card"><h2 id="sfGalatJudul">Kamera tidak dapat dinyalakan</h2><p id="sfGalatTeks"></p></div>
  </section>
  <section class="sf-cam">
    <video class="sf-video" id="sfVideo" playsinline muted autoplay poster="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></video>
    <canvas class="sf-bingkai" id="sfBingkai" width="1920" height="1080"></canvas>
    <img class="sf-beku" id="sfBeku" alt="">
    <div class="sf-bar"><span class="sf-tag">📸 Spot Foto</span><span class="sf-fmt" id="sfFmt"></span><span class="sf-antre" id="sfAntre"></span><span class="sf-next" id="sfNext"></span></div>
    <div class="sf-hitung" id="sfHitung"></div>
    <div class="sf-thumbs" id="sfThumbs"></div>
    <div class="sf-rekam"><i></i>Bergerak sekarang!</div>
    <div class="sf-flash" id="sfFlash"></div>
    <div class="sf-status" id="sfStatus">Menyimpan foto…</div>
  </section>
  <section class="sf-hasil">
    <div class="sf-media">
      <img class="sf-foto" id="sfFoto" alt="Hasil foto">
      <video class="sf-foto" id="sfVid" muted loop playsinline hidden></video>
    </div>
    <div class="sf-sisi">
      <h2 id="sfHasilJudul">Fotomu sudah jadi!</h2>
      <p id="sfHasilTeks"></p>
    </div>
  </section>
  <div class="sf-sisa" id="sfSisa"></div>
  <div class="sf-warn" id="sfWarn"></div>`;
  stage.appendChild(root);

  const $ = id => document.getElementById(id);
  const video = $("sfVideo"), bingkai = $("sfBingkai");

  /* ---------------------------------------------------------------
     STATE
     --------------------------------------------------------------- */
  const OPSI_AWAL = () => ({ frame: "pita", filter: "normal", teks: "", format: C.FORMAT_AWAL, mode: "foto", jumlah: "4" });
  let stripKe = 0;
  let state = "idle", sesi = null, owner = null, kode = null, salah = 0, pesan = "", tokenUnggah = null;
  let opsi = OPSI_AWAL();
  let lastAct = 0, stream = null, jedaPaksa = 0, token = 0, urlVideo = null, nHasil = 0, nFoto = 0, mulaiSesiAt = 0;
  let fiturFoto = true, antrean = {}, undang = null, undangSampai = 0, terhubung = false;
  const TANPA_BATAS = ["siap", "hitung", "rekam", "proses", "galat", "idle"];

  const acak = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(36).padStart(2, "0")).join("").slice(0, n * 2);
  const buatKode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
  const tunggu = ms => new Promise(r => setTimeout(r, ms));
  const filterCss = id => (PILIHAN.filter.find(f => f.id === id) || PILIHAN.filter[0]).css;
  const fmtNow = () => PILIHAN.format.find(f => f.id === opsi.format) || PILIHAN.format[0];
  const stripNow = () => PILIHAN.strip[opsi.jumlah] || PILIHAN.strip["4"];
  const modeStrip = () => opsi.mode === "strip";
  // Ukuran satu foto: potongan strip, atau bagian foto dari format terpilih.
  const ukuranFoto = () => modeStrip() ? stripNow().foto : fmtNow().foto;
  const sentuh = () => { lastAct = Date.now(); };
  const sisaDetik = () => TANPA_BATAS.includes(state) ? null : Math.max(0, Math.ceil(C.JEDA_DETIK - (Date.now() - lastAct) / 1000));

  /* Saringan tulisan polaroid: cocokkan per kata setelah huruf samaran
     (0→o, 1→i, 4→a, …) dan huruf berulang dirapikan. null = ditolak. */
  const SAMARAN = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", "$": "s" };
  const normal = s => String(s).toLowerCase().replace(/[013457@$]/g, c => SAMARAN[c]).replace(/([a-z])\1+/g, "$1");
  function bersihkanTeks(s) {
    const t = String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, PILIHAN.MAKS_TEKS);
    const kata = normal(t).split(/[^a-z]+/).filter(Boolean), rapat = kata.join("");
    const kena = C.KATA_TERLARANG.some(k => {
      const kn = normal(k).replace(/[^a-z]/g, "");
      return kn && (kata.includes(kn) || (kn.length >= 5 && rapat.includes(kn)));
    });
    return kena ? null : t;
  }

  function setState(s) {
    state = s;
    root.dataset.state = s;
    if (s === "kode") {
      $("sfDigit").innerHTML = kode.split("").map(d => `<b>${d}</b>`).join("");
      $("sfPesan").textContent = pesan;
    }
    if (s === "kamera" || s === "hitung") terapkanOpsi();
  }

  /* ---------------------------------------------------------------
     MENULIS STATUS
     --------------------------------------------------------------- */
  let layarTerakhir = "";
  function statusLayar() {
    if (!fiturFoto && state === "idle") return "nonaktif";
    if (state !== "idle") return "sibuk";
    return Date.now() < jedaPaksa ? "jeda" : "idle";
  }
  function tulisLayar(paksa) {
    const l = {
      state: statusLayar(), owner: owner || null, sesi: sesi || null, undang: undang || null,
      menunggu: Object.keys(antrean).length,
      jeda: Date.now() < jedaPaksa ? Math.ceil((jedaPaksa - Date.now()) / 1000) : 0
    };
    const s = JSON.stringify(l);
    if (!paksa && s === layarTerakhir) return;
    layarTerakhir = s;
    l.detak = T.WAKTU;
    T.set("layar", l);
  }

  // Info sesi: hanya bisa dibaca pemilik sesi.
  function kabari(tambahan) {
    if (!sesi) return;
    T.set(`sesi/${sesi}/info`, Object.assign({
      state, sisa: sisaDetik(), opsi, pesan,
      strip: stripKe ? { ke: stripKe, dari: Number(opsi.jumlah) } : null,
      fitur: { teks: !!C.TEKS_AKTIF, boomerang: !!C.BOOMERANG }, t: T.WAKTU
    }, tambahan || {}));
  }

  /* ---------------------------------------------------------------
     CATATAN (dikirim ke Google Sheet lewat Apps Script)
     --------------------------------------------------------------- */
  const antreLog = [];
  function catat(jenis, detail) {
    antreLog.push({ waktu: new Date().toISOString(), lokasi: C.LOKASI, jenis, sesi: sesi || "", detail: detail ? JSON.stringify(detail).slice(0, 500) : "" });
    if (antreLog.length > 200) antreLog.splice(0, antreLog.length - 200);
    if (jenis === "galat" || antreLog.length >= 20) kirimLog();
  }
  async function kirimLog() {
    if (!C.APPS_SCRIPT || !antreLog.length) return;
    const batch = antreLog.splice(0, 50);
    try {
      await fetch(C.APPS_SCRIPT, { method: "POST", body: JSON.stringify({ aksi: "log", kunci: C.KUNCI_LOG, entri: batch }) });
    } catch (e) { antreLog.unshift(...batch); }
  }

  /* ---------------------------------------------------------------
     PENGATURAN DARI GOOGLE SHEET
     --------------------------------------------------------------- */
  async function muatPengaturan() {
    if (!C.APPS_SCRIPT) return;
    try {
      const r = await fetch(C.APPS_SCRIPT + "?aksi=pengaturan&lokasi=" + encodeURIComponent(C.LOKASI));
      const j = await r.json();
      if (j && j.ok && j.pengaturan) terapkanPengaturan(j.pengaturan);
    } catch (e) { console.warn("Spot Foto: pengaturan tidak dapat dimuat", e); }
  }
  function terapkanPengaturan(p) {
    if ("FOTO_AKTIF" in p) fiturFoto = p.FOTO_AKTIF !== false;
    if ("TEKS_AKTIF" in p) C.TEKS_AKTIF = p.TEKS_AKTIF !== false;
    if (p.JUDUL) C.JUDUL = String(p.JUDUL);
    C.NAMA_TEMPAT = p.NAMA_TEMPAT ? String(p.NAMA_TEMPAT) : NAMA_TEMPAT_AWAL;
    if (Array.isArray(p.KATA_TERLARANG)) C.KATA_TERLARANG = KATA_DASAR.concat(p.KATA_TERLARANG);
    if (!C.TEKS_AKTIF) opsi.teks = "";
    tulisLayar();
    if (sesi) { kabari(); if (state === "kamera") terapkanOpsi(); }
  }

  /* ---------------------------------------------------------------
     PERINTAH DARI HP (perintah/<uid>)
     --------------------------------------------------------------- */
  const dilihat = {};
  let perintahAwal = true;
  function terimaSemuaPerintah(semua) {
    Object.entries(semua || {}).forEach(([uid, m]) => {
      if (!m || !m.t) return;
      if (perintahAwal) { dilihat[uid] = m.t; return; }      // abaikan perintah lama
      if (dilihat[uid] && m.t <= dilihat[uid]) return;
      dilihat[uid] = m.t;
      terimaPerintah(uid, m);
    });
    perintahAwal = false;
  }

  function terimaPerintah(uid, m) {
    if (m.tipe === "halo") {
      if (!fiturFoto || state !== "idle" || Date.now() < jedaPaksa) return;
      if (undang && uid !== undang) return;                  // giliran HP lain di antrean
      mulaiSesi(uid);
      return;
    }
    if (state === "idle" || uid !== owner || m.sesi !== sesi) return;

    switch (m.tipe) {
      case "kode":
        if (state !== "kode") return;
        sentuh();
        if (String(m.kode) === kode) { pesan = ""; nyalakanKamera(); }
        else {
          salah++;
          if (salah >= C.MAKS_SALAH_KODE) {
            catat("kode_salah", { kali: salah });
            jedaPaksa = Date.now() + C.JEDA_SETELAH_GAGAL_DETIK * 1000;
            selesai("kode");
          } else { pesan = `Kode belum cocok. Sisa ${C.MAKS_SALAH_KODE - salah} kesempatan.`; setState("kode"); kabari(); }
        }
        break;
      case "atur":
        if (state !== "kamera" && state !== "hasil") return;
        sentuh();
        ["frame", "filter", "format", "mode"].forEach(k => { if (PILIHAN[k].some(x => x.id === m[k])) opsi[k] = m[k]; });
        if (PILIHAN.strip[m.jumlah]) opsi.jumlah = m.jumlah;
        if (!C.BOOMERANG && opsi.mode === "boomerang") opsi.mode = "foto";
        if (typeof m.teks === "string" && C.TEKS_AKTIF) {
          const t = bersihkanTeks(m.teks);
          if (t === null) { pesan = "Tulisan itu tidak bisa dipakai. Coba kata lain."; catat("teks_ditolak", { teks: String(m.teks).slice(0, 60) }); }
          else { opsi.teks = t; pesan = ""; }
        }
        terapkanOpsi(); kabari();
        break;
      case "jepret":
        if (state === "kamera" || state === "hasil") jepret();
        break;
      case "lagi":
        if (state === "hasil") { sentuh(); setState("kamera"); kabari(); }
        break;
      case "selesai":
        selesai("pengguna");
        break;
      case "ping":
        sentuh(); kabari();
        break;
    }
  }

  async function mulaiSesi(uid) {
    token++;
    const sid = acak(8);
    sesi = sid; owner = uid; kode = buatKode(); salah = 0; pesan = ""; nHasil = 0; nFoto = 0;
    tokenUnggah = acak(16); mulaiSesiAt = Date.now();
    opsi = OPSI_AWAL();
    undang = null;
    sentuh(); setState("kode");
    // Urutan penting: data sesi (dengan pemilik) ditulis dulu, baru layar mengumumkan sesi.
    await T.set(`sesi/${sid}`, { owner: uid, info: { state: "kode", sisa: C.JEDA_DETIK, opsi, pesan: "", fitur: { teks: !!C.TEKS_AKTIF, boomerang: !!C.BOOMERANG }, t: T.WAKTU } });
    await T.set(`unggah/${sid}`, { token: tokenUnggah, dibuat: T.WAKTU });
    if (sesi !== sid) return;
    tulisLayar();
    T.hapus(`antrean/${uid}`);
    catat("sesi_mulai");
  }

  async function nyalakanKamera() {
    const tk = token;
    setState("siap"); kabari();
    try {
      const minta = navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" }, audio: false
      });
      const batas = tunggu(C.BATAS_KAMERA_DETIK * 1000).then(() => { throw new Error("Kamera tidak merespons"); });
      const s = await Promise.race([minta, batas]);
      if (tk !== token) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      await video.play();
      for (let i = 0; i < 40 && !video.videoWidth; i++) await tunggu(50);
      if (tk !== token) return;
      sentuh(); setState("kamera"); kabari();
    } catch (e) {
      if (tk !== token) return;
      galat("Kamera tidak dapat dinyalakan", "Coba beberapa saat lagi. Jika masih gagal, hubungi admin prodi.", e);
    }
  }

  async function galat(judul, teks, err) {
    if (err) console.error("Spot Foto:", err);
    catat("galat", { judul, pesan: String(err && err.message || err || "") });
    matikanKamera();
    $("sfGalatJudul").textContent = judul;
    $("sfGalatTeks").textContent = teks;
    pesan = judul; setState("galat"); kabari();
    const tk = token;
    await tunggu(6000);
    if (tk === token) selesai("galat");
  }

  function matikanKamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function lepasVideo() {
    const v = $("sfVid");
    v.pause(); v.removeAttribute("src"); v.load();
    if (urlVideo) URL.revokeObjectURL(urlVideo);
    urlVideo = null;
  }

  function selesai(alasan) {
    token++;
    const lama = sesi;
    if (lama) {
      T.update(`sesi/${lama}/info`, { state: "selesai", alasan, sisa: null, t: T.WAKTU });
      catat("sesi_selesai", { alasan, foto: nFoto, detik: Math.round((Date.now() - mulaiSesiAt) / 1000) });
      // Hapus data sesi dan token unggah setelah HP sempat menerima semuanya.
      setTimeout(() => { T.hapus(`sesi/${lama}`); T.hapus(`unggah/${lama}`); }, C.HAPUS_SESI_DETIK * 1000);
    }
    matikanKamera(); lepasVideo();
    $("sfThumbs").innerHTML = ""; stripKe = 0;
    sesi = owner = kode = tokenUnggah = null; pesan = "";
    setState("idle");
    $("sfWarn").classList.remove("on");
    tulisLayar();
    urusAntrean();
    kirimLog();
  }

  /* ---------------------------------------------------------------
     ANTREAN
     --------------------------------------------------------------- */
  function urusAntrean() {
    if (state !== "idle" || !fiturFoto || Date.now() < jedaPaksa) { if (undang) { undang = null; tulisLayar(); } return; }
    if (undang && (Date.now() >= undangSampai || !antrean[undang])) {
      const lama = undang; undang = null;
      if (antrean[lama]) { delete antrean[lama]; T.hapus(`antrean/${lama}`); }   // tidak merespons: dilewati
    }
    if (!undang) {
      const daftar = Object.entries(antrean).filter(([, v]) => v && v.t).sort((a, b) => a[1].t - b[1].t);
      if (daftar.length) { undang = daftar[0][0]; undangSampai = Date.now() + C.UNDANGAN_DETIK * 1000; }
    }
    tulisLayar();
  }
  /* ---------------------------------------------------------------
     GEOMETRI: area foto di layar dan di sumber kamera
     --------------------------------------------------------------- */
  // Area foto di panggung 1920x1080 (sisanya diredupkan sebagai panduan).
  function areaLayar() {
    const [fw, fh] = ukuranFoto(), a = fw / fh;
    if (a >= 1920 / 1080) { const h = Math.min(1080, Math.round(1920 / a)); return { x: 0, y: Math.round((1080 - h) / 2), w: 1920, h }; }
    const w = Math.round(1080 * a);
    return { x: Math.round((1920 - w) / 2), y: 0, w, h: 1080 };
  }
  // Petakan area layar ke koordinat video asli (video tampil dengan object-fit: cover).
  function areaSumber() {
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const sc = Math.max(1920 / vw, 1080 / vh), ox = (1920 - vw * sc) / 2, oy = (1080 - vh * sc) / 2;
    const r = areaLayar();
    let sx = (r.x - ox) / sc;
    const sy = (r.y - oy) / sc, sw = r.w / sc, sh = r.h / sc;
    if (C.CERMIN) sx = vw - sx - sw;   // preview dicerminkan
    return { sx, sy, sw, sh };
  }

  /* ---------------------------------------------------------------
     BINGKAI – digambar untuk ukuran apa pun (W x H)
     --------------------------------------------------------------- */
  const tgl = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const pad = n => String(n).padStart(2, "0");

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function pil(ctx, teks, font, x, y, h, kanan) {
    ctx.font = font;
    const w = ctx.measureText(teks).width + h * .9;
    const x0 = kanan ? x - w : x;
    ctx.fillStyle = "rgba(6,22,52,.72)"; rrect(ctx, x0, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(teks, x0 + h * .45, y + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  function gambarBingkai(ctx, id, W, H, waktu) {
    const d = waktu || new Date();
    const s = Math.min(W, H) / 1080, tegak = W / H < 1.2;
    const jam = pad(d.getHours()) + "." + pad(d.getMinutes());
    ctx.save();
    ctx.textBaseline = "alphabetic";

    if (id === "pita") {
      const m = 48 * s, h = 128 * s;
      ctx.font = `800 ${48 * s}px ${FONT}`;
      const w1 = ctx.measureText(C.NAMA_TEMPAT).width;
      ctx.font = `700 ${25 * s}px ${FONT}`;
      const w2 = ctx.measureText(C.JUDUL).width;
      const lebar = Math.max(w1, w2) + 118 * s;
      ctx.fillStyle = "rgba(6,22,52,.72)"; rrect(ctx, m, H - m - h, lebar, h, h / 2); ctx.fill();
      ctx.fillStyle = "#5aa2ff"; ctx.beginPath(); ctx.arc(m + 54 * s, H - m - h / 2, 13 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `700 ${25 * s}px ${FONT}`;
      ctx.fillText(C.JUDUL, m + 86 * s, H - m - h + 50 * s);
      ctx.fillStyle = "#fff"; ctx.font = `800 ${48 * s}px ${FONT}`;
      ctx.fillText(C.NAMA_TEMPAT, m + 86 * s, H - m - 30 * s);
      const t = tgl.format(d) + "  " + jam, hp = 66 * s, f = `700 ${28 * s}px ${FONT}`;
      if (tegak) pil(ctx, t, f, W - m, m, hp, true);           // potret: tanggal di kanan atas
      else pil(ctx, t, f, W - m, H - m - hp, hp, true);        // lebar: tanggal di kanan bawah
    }

    else if (id === "cctv") {
      const m = 60 * s, p = 100 * s, fs = (tegak ? 32 : 38) * s;
      ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = 6 * s; ctx.lineCap = "round";
      [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(x, y + sy * p); ctx.lineTo(x, y); ctx.lineTo(x + sx * p, y); ctx.stroke();
      });
      ctx.font = `700 ${fs}px ${FONT_MONO}`;
      ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 8 * s;
      const atas = m + 36 * s + fs * .8, kiri = m + 36 * s;
      ctx.fillStyle = "#ff3b30"; ctx.beginPath(); ctx.arc(kiri + 14 * s, atas - fs * .35, 14 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText("REC", kiri + 38 * s, atas);
      ctx.fillStyle = "#ffe14d";
      const cam = "LORONG-" + C.LOKASI + (tegak ? " CAM01" : "  CAM 01");
      ctx.fillText(cam, W - kiri - ctx.measureText(cam).width, atas);
      const ts = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
      const bawah = H - m - 36 * s;
      ctx.fillText(ts, W - kiri - ctx.measureText(ts).width, bawah);
      ctx.fillStyle = "#fff"; ctx.font = `700 ${(tegak ? 28 : 34) * s}px ${FONT}`;
      if (tegak) ctx.fillText(C.JUDUL, kiri, bawah - fs * 1.4); else ctx.fillText(C.JUDUL, kiri, bawah);
    }

    else if (id === "polaroid") {
      const m = 46 * s, b = (tegak ? 230 : 200) * s;
      ctx.fillStyle = "#fbfaf6";
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(m, m, W - 2 * m, H - m - b); ctx.fill("evenodd");
      ctx.fillStyle = "rgba(0,0,0,.07)"; ctx.fillRect(m, H - b, W - 2 * m, 3 * s);
      const tulisan = opsi.teks || C.NAMA_TEMPAT;
      const maksLebar = tegak ? W - 2 * m - 20 * s : (W - 2 * m) * .64;
      let uk = (tegak ? 92 : 104) * s;
      ctx.font = `700 ${uk}px ${FONT_TANGAN}`;
      while (ctx.measureText(tulisan).width > maksLebar && uk > 50 * s) { uk -= 3 * s; ctx.font = `700 ${uk}px ${FONT_TANGAN}`; }
      ctx.fillStyle = "#1f3a6e";
      const waktuTeks = tgl.format(d) + ", " + jam;
      ctx.fillStyle = "#1f3a6e";
      if (tegak) {
        ctx.fillText(tulisan, m + 10 * s, H - b * .45, maksLebar);
        ctx.fillStyle = "#7a8291"; ctx.font = `600 ${27 * s}px ${FONT}`;
        ctx.fillText(waktuTeks + "  ·  " + C.NAMA_TEMPAT, m + 12 * s, H - b * .14, W - 2 * m - 20 * s);
      } else {
        ctx.fillText(tulisan, m + 20 * s, H - b * .38, maksLebar);
        ctx.fillStyle = "#7a8291"; ctx.font = `600 ${30 * s}px ${FONT}`;
        ctx.fillText(waktuTeks, W - m - 16 * s - ctx.measureText(waktuTeks).width, H - b * .56);
        const bawah = opsi.teks ? C.NAMA_TEMPAT + ", " + C.JUDUL : C.JUDUL;
        ctx.fillText(bawah, W - m - 16 * s - ctx.measureText(bawah).width, H - b * .28);
      }
    }

    else if (id === "film") {
      const bar = 110 * s;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      ctx.fillStyle = "#e9e3d3";
      for (let x = 28 * s; x < W; x += 92 * s) { rrect(ctx, x, 26 * s, 50 * s, 34 * s, 7 * s); ctx.fill(); rrect(ctx, x, H - 60 * s, 50 * s, 34 * s, 7 * s); ctx.fill(); }
      ctx.fillStyle = "#f2a33a"; ctx.font = `700 ${28 * s}px ${FONT}`;
      ctx.fillText("▸ " + C.LOKASI + "  " + pad(d.getDate()) + "A", 36 * s, bar - 14 * s);
      const kanan = (tegak ? "LORONG " + C.LOKASI : C.NAMA_TEMPAT.toUpperCase()) + "  400";
      ctx.fillText(kanan, W - 36 * s - ctx.measureText(kanan).width, bar - 14 * s);
      ctx.fillText(tgl.format(d), 36 * s, H - bar + 38 * s);
      const nomor = String(d.getMinutes() % 36 + 1).padStart(2, "0") + "▸";
      ctx.fillText(nomor, W - 36 * s - ctx.measureText(nomor).width, H - bar + 38 * s);
    }

    ctx.restore();
  }

  // Preview: redupkan area di luar foto, lalu gambar bingkai di dalam area foto.
  function gambarPreviewBingkai() {
    const ctx = bingkai.getContext("2d"), r = areaLayar(), [fw, fh] = ukuranFoto();
    ctx.clearRect(0, 0, 1920, 1080);
    if (r.h < 1080) {   // potongan lebih lebar dari kamera: redupkan atas dan bawah
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(0, 0, 1920, r.y); ctx.fillRect(0, r.y + r.h, 1920, 1080 - r.y - r.h);
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
      ctx.strokeRect(1.5, r.y + 1.5, 1917, r.h - 3); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `700 28px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText("Area foto: pastikan kepala masuk kotak", 960, r.y + r.h + Math.min(60, (1080 - r.y - r.h) / 2 + 10));
      ctx.textAlign = "start";
    }
    if (r.w < 1920) {
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(0, 0, r.x, 1080); ctx.fillRect(r.x + r.w, 0, 1920 - r.x - r.w, 1080);
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
      ctx.strokeRect(r.x + 1.5, 1.5, r.w - 3, 1077); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `700 30px ${FONT}`; ctx.textAlign = "center";
      const ket = ["Area foto", "Pastikan semua masuk kotak"];
      ctx.fillText(ket[0], r.x / 2, 520); ctx.font = `600 24px ${FONT}`;
      ctx.fillText(ket[1], r.x / 2, 560, r.x - 40);
      ctx.textAlign = "start";
    }
    if (modeStrip()) return;   // strip memakai bingkai kertasnya sendiri
    ctx.save(); ctx.translate(r.x, r.y); ctx.scale(r.w / fw, r.h / fh);
    gambarBingkai(ctx, opsi.frame, fw, fh);
    ctx.restore();
  }

  function terapkanOpsi() {
    video.style.filter = filterCss(opsi.filter);
    const r = areaLayar();
    root.classList.toggle("sf-sempit", r.w < 1920);
    root.style.setProperty("--sisi", r.x + "px");
    const f = fmtNow(), md = PILIHAN.mode.find(x => x.id === opsi.mode);
    $("sfFmt").textContent = modeStrip() ? "Strip " + stripNow().nama : f.nama + (opsi.mode === "boomerang" ? " · " + md.nama : "");
    gambarPreviewBingkai();
    if (opsi.frame === "polaroid" && document.fonts) document.fonts.load(`700 80px Caveat`).then(gambarPreviewBingkai).catch(() => {});
  }

  /* ---------------------------------------------------------------
     KOMPOSISI GAMBAR
     --------------------------------------------------------------- */
  const kanvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.round(w); c.height = Math.round(h); return c; };

  // Foto + filter + bingkai pada ukuran fw x fh.
  function buatFoto(fw, fh, waktu, tanpaBingkai) {
    const cv = kanvas(fw, fh), ctx = cv.getContext("2d"), a = areaSumber();
    ctx.save();
    if (C.SIMPAN_CERMIN && C.CERMIN) { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
    ctx.filter = filterCss(opsi.filter);
    ctx.drawImage(video, a.sx, a.sy, a.sw, a.sh, 0, 0, cv.width, cv.height);
    ctx.restore();
    if (!tanpaBingkai) gambarBingkai(ctx, opsi.frame, cv.width, cv.height, waktu);
    return cv;
  }

  /* ---------------------------------------------------------------
     STRIP: beberapa foto beruntun disusun di kertas 1080x1920
     --------------------------------------------------------------- */
  function bungkusBaris(ctx, teks, lebar) {
    const kata = teks.split(" "), baris = [];
    let b = "";
    kata.forEach(k => {
      const coba = b ? b + " " + k : k;
      if (ctx.measureText(coba).width <= lebar || !b) b = coba; else { baris.push(b); b = k; }
    });
    if (b) baris.push(b);
    // Dua baris: pilih titik potong yang membuat kedua baris paling seimbang.
    if (baris.length === 2 && kata.length > 1) {
      let terbaik = null;
      for (let i = 1; i < kata.length; i++) {
        const a = kata.slice(0, i).join(" "), z = kata.slice(i).join(" ");
        const w = Math.max(ctx.measureText(a).width, ctx.measureText(z).width);
        if (w <= lebar && (!terbaik || w < terbaik.w)) terbaik = { w, b: [a, z] };
      }
      if (terbaik) return terbaik.b;
    }
    return baris;
  }

  function susunStrip(foto, waktu) {
    const g = stripNow(), W = 1080, H = 1920, n = foto.length;
    const cv = kanvas(W, H), ctx = cv.getContext("2d");
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);
    foto.forEach((f, i) => {
      const y = g.atas + i * (g.foto[1] + g.jarak);
      ctx.drawImage(f, g.sisi, y, g.foto[0], g.foto[1]);
      ctx.strokeStyle = "rgba(0,0,0,.06)"; ctx.lineWidth = 2; ctx.strokeRect(g.sisi + 1, y + 1, g.foto[0] - 2, g.foto[1] - 2);
    });
    // Tulisan di bawah: huruf besar berjarak, rata tengah, maksimal 2 baris
    const y0 = g.atas + n * g.foto[1] + (n - 1) * g.jarak, ruang = H - y0;
    const tulisan = (opsi.teks || C.NAMA_TEMPAT).toUpperCase(), lebar = W - 2 * g.sisi - 40;
    const spasi = "letterSpacing" in ctx;
    let uk = 40, baris;
    do {
      ctx.font = `600 ${uk}px ${FONT}`;
      if (spasi) ctx.letterSpacing = Math.round(uk * .14) + "px";
      baris = bungkusBaris(ctx, tulisan, lebar);
      uk -= 2;
    } while (baris.length > 2 && uk > 28);
    baris = baris.slice(0, 2);
    const tb = uk + 2, lh = tb * 1.38, kecil = 24, tinggi = baris.length * lh + 18 + kecil;
    let y = y0 + (ruang - tinggi) / 2 + tb;
    ctx.textAlign = "center"; ctx.fillStyle = "#2b3442";
    baris.forEach(b => { ctx.fillText(b, W / 2, y); y += lh; });
    ctx.font = `600 ${kecil}px ${FONT}`; ctx.fillStyle = "#8a92a0";
    if (spasi) ctx.letterSpacing = "2px";
    ctx.fillText(tgl.format(waktu) + "  ·  " + C.JUDUL, W / 2, y - lh + 18 + kecil + 6);
    ctx.textAlign = "start"; if (spasi) ctx.letterSpacing = "0px";
    return cv;
  }

  async function ambilStrip(tk, waktu) {
    const g = stripNow(), n = Number(opsi.jumlah) || 4, foto = [];
    $("sfThumbs").innerHTML = "";
    for (let i = 0; i < n; i++) {
      stripKe = i + 1;
      setState("hitung"); kabari();
      for (let c = C.HITUNG_MUNDUR; c >= 1; c--) {
        $("sfHitung").innerHTML = `<small>Foto ${i + 1} dari ${n}</small><span>${c}</span>`;
        await tunggu(1000);
        if (tk !== token) { stripKe = 0; return null; }
      }
      $("sfHitung").innerHTML = "";
      const f = buatFoto(g.foto[0], g.foto[1], waktu, true);
      foto.push(f);
      const flash = $("sfFlash");
      flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
      const th = document.createElement("img"); th.src = kecilkan(f, 320, .7); $("sfThumbs").appendChild(th);
      await tunggu(800);
      if (tk !== token) { stripKe = 0; return null; }
    }
    stripKe = 0;
    return susunStrip(foto, waktu);
  }

  // Poster Story 9:16: latar = foto yang diburamkan, foto 4:5 di tengah, keterangan di zona aman Instagram.
  function buatDasarStory(foto, W, H, waktu) {
    const k = W / 1080, cv = kanvas(W, H), ctx = cv.getContext("2d");
    // Latar buram yang ringan: perkecil dulu ke 108x192, buramkan, lalu perbesar.
    const kecil = kanvas(108, 192), kc = kecil.getContext("2d");
    const sc = Math.max(108 / foto.width, 192 / foto.height);
    kc.filter = "blur(4px) brightness(.5) saturate(1.3)";
    kc.drawImage(foto, (108 - foto.width * sc) / 2 - 8, (192 - foto.height * sc) / 2 - 8, foto.width * sc + 16, foto.height * sc + 16);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(kecil, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(3,11,29,.55)"); g.addColorStop(.3, "rgba(3,11,29,0)"); g.addColorStop(.7, "rgba(3,11,29,0)"); g.addColorStop(1, "rgba(3,11,29,.6)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.font = `700 ${32 * k}px ${FONT}`;
    ctx.fillText(C.JUDUL, 80 * k, 300 * k);
    ctx.fillStyle = "#fff"; ctx.font = `800 ${60 * k}px ${FONT}`;
    ctx.fillText(C.NAMA_TEMPAT, 80 * k, 364 * k);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `700 ${34 * k}px ${FONT}`;
    ctx.fillText(tgl.format(waktu), 80 * k, 1650 * k);
    ctx.fillStyle = "#fff"; ctx.font = `800 ${34 * k}px ${FONT}`;
    const merek = "Spot Foto";
    ctx.fillText(merek, W - 80 * k - ctx.measureText(merek).width, 1650 * k);
    // bayangan kartu
    const [x, y, w, h] = posKartu(k);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 60 * k; ctx.shadowOffsetY = 24 * k;
    ctx.fillStyle = "#000"; rrect(ctx, x, y, w, h, 20 * k); ctx.fill(); ctx.restore();
    return cv;
  }
  const posKartu = k => fmtNow().kartu.map(v => v * k);
  function tempelKartu(ctx, foto, k) {
    const [x, y, w, h] = posKartu(k);
    ctx.save(); rrect(ctx, x, y, w, h, 20 * k); ctx.clip();
    ctx.drawImage(foto, x, y, w, h); ctx.restore();
  }

  // Hasil akhir satu gambar sesuai format (skala 1 = ukuran penuh).
  function komposisi(skala, waktu) {
    const f = fmtNow();
    const foto = buatFoto(f.foto[0] * skala, f.foto[1] * skala, waktu);
    if (!f.kartu) return { cv: foto, foto };
    const W = f.w * skala, H = f.h * skala, k = W / 1080;
    const dasar = buatDasarStory(foto, W, H, waktu);
    const cv = kanvas(W, H), ctx = cv.getContext("2d");
    ctx.drawImage(dasar, 0, 0); tempelKartu(ctx, foto, k);
    return { cv, foto, dasar };
  }

  function kecilkan(cv, lebar, mutu) {
    const k = kanvas(lebar, cv.height * lebar / cv.width);
    k.getContext("2d").drawImage(cv, 0, 0, k.width, k.height);
    return k.toDataURL("image/jpeg", mutu);
  }
  const keDataUrl = blob => new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = gagal; r.readAsDataURL(blob); });

  /* ---------------------------------------------------------------
     BOOMERANG
     --------------------------------------------------------------- */
  function pilihMime() {
    if (!window.MediaRecorder) return null;
    // H.264 (avc1) paling aman untuk Instagram dan iPhone, jadi dicoba lebih dulu.
    const calon = ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1.4D401F", "video/mp4;codecs=avc1", "video/mp4",
                   "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return calon.find(m => MediaRecorder.isTypeSupported(m)) || null;
  }

  async function rekamBoomerang(tk) {
    const f = fmtNow(), skala = C.BOOM_LEBAR / f.w;
    const waktu = new Date();
    const gambar = [];
    setState("rekam"); kabari();
    for (let i = 0; i < C.BOOM_BINGKAI; i++) {
      const t0 = performance.now();
      gambar.push(buatFoto(f.foto[0] * skala, f.foto[1] * skala, waktu));
      await tunggu(Math.max(0, C.BOOM_JEDA_MS - (performance.now() - t0)));
      if (tk !== token) return null;
    }
    $("sfStatus").textContent = "Menyusun boomerang…";
    $("sfBeku").src = gambar[gambar.length >> 1].toDataURL("image/jpeg", .8);
    setState("proses"); kabari();
    await tunggu(30);

    const story = !!f.kartu;
    const W = story ? f.w * skala : gambar[0].width, H = story ? f.h * skala : gambar[0].height, k = W / 1080;
    const dasar = story ? buatDasarStory(gambar[gambar.length >> 1], W, H, waktu) : null;
    const out = kanvas(W, H), ctx = out.getContext("2d");
    const lukis = g => { if (story) { ctx.drawImage(dasar, 0, 0); tempelKartu(ctx, g, k); } else ctx.drawImage(g, 0, 0, W, H); };

    lukis(gambar[gambar.length >> 1]);
    const poster = kecilkan(out, Math.min(720, out.width), .78);

    const mime = pilihMime();
    if (!mime) throw new Error("Browser tidak mendukung perekaman video");
    const urutan = [];
    for (let p = 0; p < C.BOOM_PUTARAN; p++) {
      for (let i = 0; i < gambar.length; i++) urutan.push(i);
      for (let i = gambar.length - 2; i > 0; i--) urutan.push(i);
    }
    lukis(gambar[0]);
    const aliran = out.captureStream(30);
    const rec = new MediaRecorder(aliran, { mimeType: mime, videoBitsPerSecond: C.BOOM_BITRATE });
    const potong = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) potong.push(e.data); };
    const berhenti = new Promise(r => { rec.onstop = r; });
    rec.start();
    const mulai = performance.now(), dt = 1000 / 30;
    for (let n = 0; n < urutan.length; n++) {
      lukis(gambar[urutan[n]]);
      const target = mulai + (n + 1) * dt;
      await tunggu(Math.max(0, target - performance.now()));
      if (tk !== token) { rec.stop(); return null; }
    }
    const nyata = rec.mimeType || mime;   // kodek yang benar-benar dipakai browser
    rec.stop(); await berhenti;
    aliran.getTracks().forEach(t => t.stop());
    const blob = new Blob(potong, { type: mime.split(";")[0] });
    return { blob, poster, mime: mime.split(";")[0], h264: /avc1|h264/i.test(nyata) };
  }

  /* ---------------------------------------------------------------
     JEPRET
     --------------------------------------------------------------- */
  async function unggah(dataUrl, nama, mime) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    try {
      // Tanpa header khusus (text/plain) agar tidak memicu preflight CORS ke Apps Script.
      const r = await fetch(C.APPS_SCRIPT, {
        method: "POST", signal: ctrl.signal,
        body: JSON.stringify({ aksi: "unggah", lokasi: C.LOKASI, sesi, token: tokenUnggah, nama, mime, data: dataUrl.split(",")[1] })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.pesan || "Unggah gagal");
      return j;
    } finally { clearTimeout(to); }
  }

  function namaBerkas(waktu, ext) {
    return `${C.LOKASI}_${waktu.getFullYear()}-${pad(waktu.getMonth() + 1)}-${pad(waktu.getDate())}_${pad(waktu.getHours())}-${pad(waktu.getMinutes())}-${pad(waktu.getSeconds())}_${modeStrip() ? "strip" + opsi.jumlah : opsi.format}_${sesi}.${ext}`;
  }

  async function jepret() {
    const tk = token, sid = sesi;
    lepasVideo();
    $("sfThumbs").innerHTML = "";
    const strip = modeStrip();
    if (!strip) {
      setState("hitung"); kabari();
      if (opsi.frame === "polaroid" && document.fonts) { try { await document.fonts.load(`700 80px Caveat`); } catch (e) {} }
      for (let n = C.HITUNG_MUNDUR; n >= 1; n--) {
        $("sfHitung").innerHTML = `<span>${n}</span>`;
        await tunggu(1000);
        if (tk !== token) return;
      }
    }
    const waktu = new Date();
    const fmt = fmtNow();
    const labelFormat = strip ? "strip" + opsi.jumlah : fmt.id;
    let data, mime, nama, pratinjau, tampil, blob = null, h264 = false, sedang = null;

    try {
      if (opsi.mode === "boomerang" && C.BOOMERANG) {
        const b = await rekamBoomerang(tk);
        if (!b) return;
        blob = b.blob; mime = b.mime; pratinjau = b.poster; h264 = b.h264;
        nama = namaBerkas(waktu, mime.includes("mp4") ? "mp4" : "webm");
        data = await keDataUrl(blob);
        sedang = data;
      } else {
        const cv = strip ? await ambilStrip(tk, waktu) : komposisi(1, waktu).cv;
        if (!cv) return;
        const flash = $("sfFlash");
        if (!strip) { flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on"); }
        data = cv.toDataURL("image/jpeg", C.MUTU_JPEG);
        $("sfStatus").textContent = "Menyimpan foto…";
        $("sfBeku").src = data;
        setState("proses"); kabari();
        mime = "image/jpeg"; nama = namaBerkas(waktu, "jpg");
        pratinjau = kecilkan(cv, 720, .74);
        tampil = data;
        // Versi ukuran sedang bila foto dikirim lewat Firebase (tanpa Drive atau Drive gagal).
        sedang = T.mode === "lokal" ? data : kecilkan(cv, Math.min(cv.width, 1080), .84);
      }
    } catch (e) {
      if (tk === token) galat("Foto tidak dapat dibuat", "Coba sekali lagi. Jika masih gagal, hubungi admin prodi.", e);
      return;
    }
    if (tk !== token) return;
    nFoto++;
    catat("foto", { format: labelFormat, bingkai: strip ? "strip" : opsi.frame, filter: opsi.filter, jenis: blob ? "boomerang" : "foto" });
    if ((strip || opsi.frame === "polaroid") && opsi.teks) catat("teks", { teks: opsi.teks });

    // 1) Pratinjau langsung dikirim ke HP (sekali), link unduh menyusul.
    const id = "h" + String(++nHasil).padStart(3, "0");
    const pakaiDrive = !!C.APPS_SCRIPT;
    await T.set(`sesi/${sid}/hasil/${id}`, {
      jenis: blob ? "video" : "foto", format: labelFormat, pratinjau, nama, mime, h264,
      status: pakaiDrive ? "mengunggah" : "siap", unduh: pakaiDrive ? null : sedang, t: T.WAKTU
    });

    const img = $("sfFoto"), vid = $("sfVid");
    if (blob) { urlVideo = URL.createObjectURL(blob); img.hidden = true; vid.hidden = false; vid.src = urlVideo; vid.play().catch(() => {}); }
    else { vid.hidden = true; img.hidden = false; img.src = tampil; }
    $("sfHasilJudul").textContent = blob ? "Boomerang-mu sudah jadi!" : "Fotomu sudah jadi!";
    $("sfHasilTeks").textContent = "Sudah terkirim ke HP-mu. Mau lagi? Tekan " + (blob ? "Rekam lagi" : "Foto lagi") + " di HP.";
    sentuh(); setState("hasil"); kabari();

    // 2) Unggah ke Drive, lalu lengkapi link unduh.
    if (pakaiDrive) {
      let ubah;
      try { const j = await unggah(data, nama, mime); ubah = { status: "siap", unduh: j.unduh, lihat: j.lihat }; }
      catch (e) {
        console.error("Spot Foto: unggah gagal", e);
        catat("galat", { judul: "unggah", pesan: String(e && e.message || e) });
        ubah = { status: "siap", unduh: sedang, catatan: "drive-gagal" };
      }
      if (sesi === sid || Date.now() - lastAct < C.HAPUS_SESI_DETIK * 1000) T.update(`sesi/${sid}/hasil/${id}`, ubah);
    }
  }

  /* ---------------------------------------------------------------
     PENGATUR WAKTU
     --------------------------------------------------------------- */
  let idxNext = 0, nextAt = 0, detakAt = 0, jedaTadi = false;
  setInterval(() => {
    const s = sisaDetik();
    const bar = $("sfSisa"), warn = $("sfWarn");
    if (s === null) { bar.style.width = "0"; warn.classList.remove("on"); }
    else {
      bar.style.width = (100 * Math.max(0, C.JEDA_DETIK - (Date.now() - lastAct) / 1000) / C.JEDA_DETIK) + "%";
      const tampil = s <= C.PERINGATAN_DETIK;
      warn.classList.toggle("on", tampil);
      if (tampil) warn.textContent = `Kembali ke jadwal dalam ${s} detik`;
      if (s <= 0) selesai("jeda");
    }
    if (state === "kamera" || state === "hitung") {
      if (Date.now() >= nextAt) {
        nextAt = Date.now() + 5000;
        const daftar = (window.JadwalTV && JadwalTV.ringkasan) ? JadwalTV.ringkasan() : [];
        $("sfNext").textContent = daftar.length ? "Berikutnya " + daftar[idxNext++ % daftar.length] : "";
      }
      if (opsi.frame === "cctv" || opsi.frame === "pita") gambarPreviewBingkai();
    }
    const n = Object.keys(antrean).length, ba = $("sfAntre");
    ba.classList.toggle("on", n > 0 && state !== "idle");
    ba.textContent = n + " menunggu";

    if (!terhubung) return;
    const jeda = Date.now() < jedaPaksa;
    if (jedaTadi && !jeda) { tulisLayar(); urusAntrean(); }
    jedaTadi = jeda;
    if (state === "idle" && undang) urusAntrean();
    if (Date.now() >= detakAt) { detakAt = Date.now() + 5000; T.update("layar", { detak: T.WAKTU }); }
  }, 250);

  document.addEventListener("keydown", e => { if (e.key === "Escape" && state !== "idle") selesai("admin"); });

  /* ---------------------------------------------------------------
     MULAI
     --------------------------------------------------------------- */
  T.masuk(T.mode === "firebase" ? loginTv : null).then(() => {
    // Bersihkan sisa sesi lama (misalnya setelah TV mati mendadak).
    T.hapus("sesi"); T.hapus("unggah");
    T.saatTersambung(on => {
      terhubung = on;
      if (!on) return;
      T.saatPutus("layar", { state: "mati", t: T.WAKTU });
      tulisLayar(true);
    });
    T.dengar("perintah", terimaSemuaPerintah);
    T.dengar("antrean", a => { antrean = a || {}; urusAntrean(); tulisLayar(); });
    muatPengaturan();
    setInterval(muatPengaturan, 5 * 60 * 1000);
    setInterval(kirimLog, 2 * 60 * 1000);
  }).catch(e => console.error("Spot Foto: gagal masuk ke Firebase", e));

  window.SpotFoto = { sibuk: () => state !== "idle", status: () => state, akhiri: () => selesai("admin") };
})();
