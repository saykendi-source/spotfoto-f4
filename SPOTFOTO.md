# Spot Foto – modul foto untuk layar Jadwal TV (versi 4)

Layar TV menampilkan jadwal. Mahasiswa memindai QR tercetak di dekat TV, mengetik kode yang muncul di layar, lalu mengatur gaya dan memotret dari HP. Layar kembali ke jadwal setelah 20 detik tanpa aktivitas.

```
HP (spot.html) ──perintah──► Firebase Realtime DB ◄──status/hasil── TV (index.html + spotfoto.js)
  masuk anonim                 aturan keamanan                       masuk dengan akun TV
                                                                          │ unggah + token sesi
                                                                          ▼
                                     Apps Script Spot Foto ──► Google Drive (foto, 7 hari)
                                       (proyek mandiri)    ──► Google Sheet (Pengaturan + Log)
```

## Berkas

| Berkas | Fungsi |
|---|---|
| `spotfoto-config.js` | Satu-satunya tempat pengaturan (Firebase, Apps Script, teks bingkai, dll.) |
| `spotfoto-transport.js` | Lapisan data: Firebase (dengan Auth) atau mode lokal untuk uji coba; daftar filter, bingkai, ukuran |
| `spotfoto.js` | Modul TV: sesi, antrean, kamera, bingkai, unggah, catatan |
| `spot.html`, `spot.js` | Halaman HP yang dibuka dari QR |
| `cek-perangkat.html` | Pemeriksaan TV box + tempat menyimpan login akun TV |
| `cetak-qr.html` | Poster QR A5 untuk dicetak |
| `database.rules.json` | Aturan keamanan Firebase |
| `apps-script/SpotFoto.gs`, `apps-script/appsscript.json` | Apps Script mandiri (Drive, Sheet, token, batas) |

Di `index.html` hanya ada tiga tag `<script>` Spot Foto di akhir halaman, objek `window.JadwalTV` (ringkasan kelas berikutnya), dan penahan reload saat ada yang berfoto.

## Urutan pemasangan

### 1. Uji perangkat dulu
Unggah semua berkas ke GitHub Pages, lalu buka `cek-perangkat.html` di TV box (lewat Fully Kiosk). Yang paling penting: **Kamera** harus ✅ atau ⚠️, dan **Kecepatan olah foto** tidak ❌. Kalau kamera ❌, selesaikan dulu masalah perangkat sebelum langkah lain. Tombol **Salin laporan** bisa dipakai untuk mengirim hasil pemeriksaan.

### 2. Uji coba lokal (opsional, tanpa Firebase)
Biarkan `FIREBASE: null`, jalankan `python -m http.server 8000`, lalu buka `index.html?lokasi=F4` dan beberapa tab `spot.html?lokasi=F4` di browser yang sama. Semua fitur (kode, antrean, hasil, layar terputus) bisa dicoba.

### 3. Firebase
1. Buat proyek di console.firebase.google.com **dengan akun Google yang sama dengan Apps Script Spot Foto** (langkah 4). Ini diperlukan agar Apps Script boleh membaca token sesi.
2. **Build → Realtime Database → Create database** (lokasi Singapura).
3. **Build → Authentication → Sign-in method**: aktifkan **Anonymous** dan **Email/Password**.
4. **Authentication → Users → Add user**: buat akun khusus layar TV, misalnya `tv-f4@prodi-ti.id`, dengan kata sandi kuat.
5. Buka `database.rules.json`, ganti semua `tv@spotfoto.example` dengan email akun TV tadi, lalu tempel ke tab **Rules** dan **Publish**.
6. **Project settings → Your apps → Web**: salin config ke `FIREBASE` di `spotfoto-config.js`.
7. Di TV box, buka `cek-perangkat.html`, isi **Login akun layar TV**, lalu **Simpan login**. Pemeriksaan **Firebase** harus ✅.

Kata sandi akun TV tidak pernah ditulis di kode; ia hanya tersimpan di TV box tersebut.

### 4. Apps Script dan Google Sheet (penyimpanan terpisah dari Momen TI)
1. Masuk dengan akun Google untuk Spot Foto, buka script.google.com → **Proyek baru**, beri nama "Spot Foto".
2. **Setelan proyek** → centang **Tampilkan file manifes "appsscript.json"**, lalu ganti isinya dengan `apps-script/appsscript.json`.
3. Tempel `apps-script/SpotFoto.gs`. Isi `FIREBASE_DB_URL` (sama dengan `databaseURL`) dan `KUNCI_LOG` (teks acak).
4. Jalankan `siapkanSpotFoto` sekali dan setujui izin. Ini membuat Sheet **"Spot Foto – Pengaturan & Catatan"** dan pemicu perawatan harian pukul 02.00. Link Sheet muncul di log eksekusi.
5. **Terapkan → Deployment baru → Aplikasi web** (jalankan sebagai Saya, akses Siapa saja). Salin URL `/exec` ke `APPS_SCRIPT`, dan `KUNCI_LOG` yang sama ke `spotfoto-config.js`.
6. Buka lagi `cek-perangkat.html`; **Apps Script & Sheet** harus ✅.

### 5. Pasang
Cetak poster dari `cetak-qr.html`, tempel di dekat TV, tempel stiker penanda lantai sekitar 2–3 meter dari TV.

## Mengelola dari Google Sheet

Lembar **Pengaturan** dibaca TV setiap 5 menit, jadi perubahan berlaku tanpa mengubah kode:

| Kunci | Fungsi |
|---|---|
| `FOTO_AKTIF` | `FALSE` mematikan Spot Foto (HP melihat "Spot Foto sedang tidak aktif"); jadwal tetap tampil |
| `TEKS_AKTIF` | `FALSE` menyembunyikan kolom tulisan polaroid |
| `JUDUL`, `NAMA_TEMPAT` | Teks pada bingkai, misalnya `NAMA_TEMPAT = Wisuda Oktober 2026` untuk acara |
| `KATA_TERLARANG` | Daftar kata (dipisah koma) yang ditolak di tulisan polaroid |
| `KUNCI@LOKASI` | Pengaturan khusus satu lokasi, misalnya `NAMA_TEMPAT@F6` |

Lembar **Log** mencatat: `sesi_mulai`, `foto` (ukuran, bingkai, filter), `teks` (isi tulisan polaroid), `teks_ditolak`, `kode_salah`, `sesi_selesai` (alasan, jumlah foto, durasi), `unggah`, `unggah_ditolak`, `galat`, dan `perawatan`. Log dirapikan otomatis bila lebih dari 20.000 baris.

## Keamanan dan privasi

- **Kode 4 angka** hanya tampil di layar TV dan tidak pernah dikirim ke HP, jadi link QR yang tersebar tidak bisa dipakai dari jauh.
- **HP masuk anonim, TV masuk dengan akun email khusus.** Pemilik sesi dikenali dari uid Firebase, sehingga tidak bisa dipalsukan.
- **Hasil foto hanya bisa dibaca pemilik sesi** (`sesi/<id>`), dan seluruh data sesi dihapus 60 detik setelah sesi selesai. Status publik (`layar`) hanya berisi status, pemilik, antrean, dan detak.
- **Tidak ada QR unduhan di layar TV**, jadi orang lain tidak bisa mengambil foto orang lain dari layar.
- **Unggahan ke Drive** hanya diterima dengan token sesi yang ditulis TV di Firebase (hanya bisa dibaca TV dan Apps Script), dibatasi 40 unggahan per 10 menit per lokasi, dan ditolak bila Drive terisi lebih dari 95%.
- **Kamera** hanya menyala setelah kode benar dan mati begitu sesi selesai. Preview kamera tidak pernah dikirim ke HP.
- **Foto di Drive** dihapus otomatis setelah 7 hari.

## Antrean dan layar terputus

- HP yang datang saat layar dipakai mendapat **nomor antrean** dan otomatis mendapat giliran. HP yang dipanggil punya 15 detik untuk merespons; jika tidak, giliran pindah ke berikutnya. Menutup halaman otomatis keluar dari antrean.
- TV mengirim **detak** setiap 5 detik. Jika TV mati atau putus koneksi, HP menampilkan "Layar terputus" (langsung bila Firebase mendeteksi putus, paling lambat 15 detik).

## Ukuran hasil

| Ukuran | Hasil | Keterangan |
|---|---|---|
| Feed 4:5 | 1080 × 1350 | Bagian tengah kamera; cocok untuk 1–2 orang |
| Story 9:16 | 1080 × 1920 | Foto 4:5 sebagai kartu di poster 9:16 |
| Story rombongan | 1080 × 1920 | Foto 16:9 utuh di poster 9:16; cocok untuk 3 orang atau lebih |
| Lebar 16:9 | 1600 × 900 | Seluruh gambar kamera |

Di layar TV, area di luar foto diredupkan; label dan info kelas berikutnya dipindah ke sisi kiri/kanan agar area foto bersih.

## Mode Strip (foto beruntun)

Di HP pilih **🎞️ Strip**, lalu **3 foto** atau **4 foto**. TV menghitung mundur sebelum setiap foto ("Foto 2 dari 4"), sehingga ada waktu ganti gaya. Foto yang sudah diambil muncul sebagai thumbnail di pojok layar. Hasilnya satu gambar **1080 × 1920 (9:16)** bergaya kertas photobooth, dengan tulisan sendiri (huruf besar berjarak, maksimal 2 baris dan 40 karakter) serta tanggal di bagian bawah.

| Jumlah | Ukuran tiap foto | Keterangan |
|---|---|---|
| 3 foto | 920 × 518 (16:9) | Sama dengan rasio kamera, tidak ada yang terpotong |
| 4 foto | 860 × 376 (sekitar 2,3:1) | Lebih sinematik; bagian atas dan bawah kamera dipotong, area potongnya ditandai di TV |

Filter tetap berlaku. Tulisan strip melewati saringan `KATA_TERLARANG` yang sama, ikut tercatat di Sheet, dan disembunyikan bila `TEKS_AKTIF = FALSE`. Ukuran strip bisa diubah di `PILIHAN.strip` dalam `spotfoto-transport.js`.

## Ditunda

- **Boomerang**: kodenya ada, tetapi dimatikan (`BOOMERANG: false`). Hasil `cek-perangkat.html` bagian *Video* menunjukkan apakah TV box siap bila nanti diaktifkan.
- **Kirim ke Momen TI**: menunggu API dari aplikasi Momen TI, karena penyimpanan Spot Foto sekarang terpisah.

## Pengaturan lain di `spotfoto-config.js` / `SPOTFOTO_CONFIG`

`JEDA_DETIK` (20), `FORMAT_AWAL` (`feed`), `HITUNG_MUNDUR` (3), `MAKS_SALAH_KODE` (3), `JEDA_SETELAH_GAGAL_DETIK` (30), `UNDANGAN_DETIK` (15), `HAPUS_SESI_DETIK` (60), `CERMIN` / `SIMPAN_CERMIN` (true). Tombol **Esc** pada remote/keyboard TV mengakhiri sesi.
