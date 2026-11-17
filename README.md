# Jadwal TV + Spot Foto – Lorong F4

Halaman layar TV di lorong Gedung F4: jadwal perkuliahan sebagai tampilan utama, dan Spot Foto yang muncul saat mahasiswa memindai QR.

- **Data jadwal** diambil dari aplikasi jadwal yang sudah ada (Apps Script + Google Sheet jadwal), lewat `SUMBER_DATA` di `index.html`. Isi jadwal tetap diubah di Sheet jadwal seperti biasa; repo ini tidak menyimpan data jadwal.
- **Spot Foto** memakai Firebase dan Apps Script Spot Foto yang terpisah. Pengaturannya di `spotfoto-config.js`; catatan teknis di `SPOTFOTO.md`.

## Isi repo

| Berkas | Fungsi |
|---|---|
| `index.html`, `sw.js` | Halaman TV (jadwal + jembatan Spot Foto) |
| `spotfoto-config.js` | Pengaturan Spot Foto: Firebase, Apps Script, teks bingkai |
| `spotfoto-transport.js`, `spotfoto.js` | Modul Spot Foto untuk TV |
| `spot.html`, `spot.js` | Halaman HP yang dibuka dari QR |
| `cek-perangkat.html` | Pemeriksaan TV box + penyimpanan login akun TV |
| `cetak-qr.html` | Poster QR A5 |

## Alamat

- Layar TV: `https://<akun>.github.io/<repo>/?lokasi=F4`
- HP (dari QR): `https://<akun>.github.io/<repo>/spot.html?lokasi=F4`
- Cek perangkat: `https://<akun>.github.io/<repo>/cek-perangkat.html`

Untuk kembali ke tampilan jadwal saja, hapus tiga tag `<script>` Spot Foto di akhir `index.html`, atau setel `FOTO_AKTIF = FALSE` di Sheet Spot Foto.
