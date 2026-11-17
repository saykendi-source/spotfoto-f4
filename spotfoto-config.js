/* =====================================================================
   SPOT FOTO – pengaturan bersama
   Dipakai oleh index.html (TV), spot.html (HP), dan cek-perangkat.html.
   Berkas ini terbaca publik, jadi JANGAN menaruh kata sandi di sini.
   Login akun layar TV disimpan di TV box lewat cek-perangkat.html.
   ===================================================================== */
window.SPOTFOTO_CONFIG = {
  // Kosongkan (null) untuk uji coba lokal: buka index.html dan spot.html
  // di dua tab browser yang sama.
  FIREBASE: null,
  /* Contoh untuk pemakaian nyata:
  FIREBASE: {
    apiKey: "…",
    authDomain: "nama-proyek.firebaseapp.com",
    databaseURL: "https://nama-proyek-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "nama-proyek"
  },
  */

  APPS_SCRIPT: "",          // URL Web App Spot Foto (berakhiran /exec)
  KUNCI_LOG: "",            // sama dengan KUNCI_LOG di SpotFoto.gs (pencegah iseng untuk catatan)

  // Nilai awal. JUDUL, NAMA_TEMPAT, KATA_TERLARANG, FOTO_AKTIF, TEKS_AKTIF
  // bisa diubah admin dari Google Sheet tanpa mengubah kode.
  JUDUL: "Teknik Informatika",
  NAMA_TEMPAT: "",          // kosong = "Lorong Gedung <LOKASI>"
  KATA_TERLARANG: [],
  JEDA_DETIK: 20,
  FORMAT_AWAL: "feed",

  BOOMERANG: false          // ditunda; ubah ke true untuk mengaktifkan kembali
};
