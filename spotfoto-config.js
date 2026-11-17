/* =====================================================================
   SPOT FOTO – pengaturan bersama
   Dipakai oleh index.html (TV), spot.html (HP), dan cek-perangkat.html.
   Berkas ini terbaca publik, jadi JANGAN menaruh kata sandi di sini.
   Login akun layar TV disimpan di TV box lewat cek-perangkat.html.
   ===================================================================== */
window.SPOTFOTO_CONFIG = {
  // Kosongkan (null) untuk uji coba lokal: buka index.html dan spot.html
  // di dua tab browser yang sama.
  FIREBASE: {
    apiKey: "AIzaSyCocMcS140J7Zu15En1Fzm5lyEHsYJFZb4",
    authDomain: "spotfoto-ti.firebaseapp.com",
    databaseURL: "https://spotfoto-ti-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "spotfoto-ti"
  },

  APPS_SCRIPT: "https://script.google.com/macros/s/AKfycbxsbAtwXB9wfYe0mi1hjWJ7A5ieyE64wFHtwP0oIL8zKXjVM-esUh6oHoR3ZW6AdziXkA/exec",          // URL Web App Spot Foto (berakhiran /exec)
  KUNCI_LOG: "1234567887654321",            // sama dengan KUNCI_LOG di SpotFoto.gs (pencegah iseng untuk catatan)

  // Nilai awal. JUDUL, NAMA_TEMPAT, KATA_TERLARANG, FOTO_AKTIF, TEKS_AKTIF
  // bisa diubah admin dari Google Sheet tanpa mengubah kode.
  JUDUL: "Teknologi Informasi",
  NAMA_TEMPAT: "",          // kosong = "Lorong Gedung <LOKASI>"
  KATA_TERLARANG: [],
  JEDA_DETIK: 20,
  FORMAT_AWAL: "feed",

  BOOMERANG: false          // ditunda; ubah ke true untuk mengaktifkan kembali
};
