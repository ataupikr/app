# 26 Motor — Bengkel Santai

Aplikasi web operasional bengkel berbahasa Indonesia, berdasarkan PRD versi 1.0 (15 Oktober 2026). Implementasi MVP awal dengan server Node.js 24, database SQLite persisten, antarmuka responsif, dan tanpa layanan eksternal untuk operasional dasar. Data instalasi awal kosong; pengujian memakai database sementara yang terpisah.

## Menjalankan

```bash
cd /workspace/app
npm ci --cache /tmp/26motor-npm-cache
npm start
```

Node.js >=24 wajib (menggunakan `node:sqlite`). Port default 3000, dapat diubah dengan `PORT`. `DATA_DIR` menentukan lokasi database; default `data/`. Tidak ada proses build frontend.

Akun awal `admin@26motor.local` dibuat hanya pada database baru. Kata sandi acak tersedia di file lokal **data/initial-access.txt**, berizin 0600; tidak dipublikasikan di antarmuka atau log. Untuk provisioning otomatis, `INITIAL_PASSWORD` dapat disuntikkan secara aman sebelum startup pertama. Jangan simpan nilainya ke Git. Setelah login, aktifkan MFA melalui aplikasi autentikator dan ubah kata sandi lewat avatar kanan atas. Super Admin dan Akuntan diwajibkan mendaftarkan MFA sebelum operasi; login berikutnya memerlukan kode TOTP. Tidak ada akun bersama atau kata sandi default tetap.

## Alur yang tersedia

1. Super Admin membuat akun Teknisi, Admin Stock, Finance, dan Akuntan. Izin Gate Pass Finance diberikan secara eksplisit dan dapat dicabut. Akun dapat dinonaktifkan dan kata sandi direset; sesi akun langsung dicabut.
2. Finance berizin / Super Admin mencatat pelanggan, kendaraan, pengantar, kondisi, aksesori, kilometer, dan keluhan. Nomor kunjungan, WO dan IN otomatis. Gate Pass IN dapat dicetak.
3. Finance menetapkan teknisi dan mencatat bukti persetujuan pelanggan. Teknisi melihat tugas sendiri dan memperbarui progres sampai QC / Selesai.
4. Admin Stock mengelola master SKU, penerimaan, reservasi, pemakaian dan retur. Pemakaian menyimpan snapshot harga dan modal, serta jurnal barang dalam proses. Reservasi tidak mengurangi stok fisik atau membuat HPP; reservasi aktif harus diproses/dibatalkan sebelum invoice.
5. Modal penerimaan dihitung rata-rata bergerak termasuk biaya perolehan. Stok negatif ditolak. Opname dan perubahan harga harus diajukan lalu disetujui Super Admin berbeda dari pengaju. Histori perubahan tercatat di audit. Margin dan markup ditampilkan terpisah.
6. Setelah QC selesai, Finance memposting invoice dan menerima pembayaran tunai/transfer secara parsial. Alokasi berlebih ditolak. Invoice dan HPP diposting atomik ke jurnal seimbang.
7. OUT memerlukan QC selesai, invoice dan pelunasan, atau persetujuan piutang dari Super Admin berbeda. Konfirmasi ulang tidak menduplikasi OUT. Waktu keluar lengkap disimpan. Cetak A5 landscape menggunakan enam kolom PRD dan tambahan tanggal keluar/petugas; browser dapat menyimpan sebagai PDF.
8. Finance mencatat pengeluaran kas/bank serta pembayaran hutang supplier dari penerimaan. Akuntan membuat jurnal penyesuaian dan menutup periode. Pembukaan periode diajukan Akuntan dan disetujui Super Admin berbeda.
9. Laporan menampilkan nilai persediaan, penjualan, HPP, laba kotor, margin item dan neraca saldo. Ekspor CSV kompatibel Excel tersedia sesuai peran. Audit tersimpan tanpa fitur penghapusan.

## Pengujian

```bash
npm test
npm run test:browser
```

Tes integrasi menjalankan server nyata dengan database sementara. Tes browser memakai Playwright Core dan Chromium `/usr/bin/chromium` (ganti melalui `CHROMIUM_PATH`), mencakup login, MFA, akun, master stok, IN, WO, QC, invoice, pembayaran, OUT, cetak PDF, seluruh navigasi, dan overflow mobile. Screenshot/PDF tes berada di `/tmp/26motor-*`; data tes tidak masuk ke database operasional.

## Backup dan pemulihan

```bash
npm run backup
# Hentikan server, lalu pulihkan ke DATA_DIR tujuan:
npm run restore -- backups/snapshot-....sqlite.enc
```

Kedua perintah memerlukan `BACKUP_PASSWORD` minimal 16 karakter yang disuntikkan melalui environment. Backup menggunakan SQLite online backup lalu AES-256-GCM dengan kunci scrypt, salt dan IV acak. Simpan kata sandi di pengelola rahasia, terpisah dari backup. Restore memverifikasi autentikasi enkripsi dan integritas SQLite, menolak WAL aktif, dan mempertahankan database lama sebagai file `.before-restore-*`. Jadwalkan backup harian melalui scheduler deployment dan salin ke penyimpanan eksternal terenkripsi. Script belum memasang jadwal otomatis. Jangan menganggap snapshot cloud sebagai backup transaksi harian.

## Batas implementasi terhadap PRD / sebelum produksi

Ini **belum seluruh scope PRD dan belum dinyatakan siap go-live**. Fitur berikut belum diimplementasikan:

- Upload foto kondisi / bukti transaksi; checklist aksesori saat ini berupa teks.
- Master pelanggan/kendaraan dan supplier terpisah, pencarian riwayat lintas kendaraan yang terstruktur, nomor rangka/mesin, test drive sementara, pembatalan OUT berotorisasi dengan dokumen koreksi.
- Retur supplier, stok karantina, konfirmasi penerimaan part oleh teknisi, rekalkulasi transaksi mundur, dan persetujuan nilai migrasi awal lintas petugas.
- Diskon per item, ambang margin terkonfigurasi, pajak, DP sebelum invoice, jatuh tempo dan aging piutang/hutang, rekonsiliasi kas harian, reversal / credit note. Saat ini dokumen terposting dikunci; koreksi invoice belum tersedia.
- Chart of accounts terkonfigurasi, laporan keuangan lengkap, XLSX/PDF laporan umum, dan ekspor khusus setiap modul. Cetak PDF saat ini khusus Gate Pass.
- Pemulihan MFA mandiri / recovery code, daftar sesi aktif, workflow reset akses melalui email, monitoring, scheduler backup dan kebijakan retensi.

HTTPS perlu disediakan reverse proxy deployment; set `SECURE_COOKIE=1` pada deployment HTTPS. Database dan backup harus di volume persisten, bukan filesystem sementara. Pastikan waktu server sinkron untuk TOTP. Tetapkan kebijakan retensi dan akun persetujuan berbeda sebelum operasional. Target p95 <3 detik pada 20 pengguna/100.000 mutasi, SLA 99,5%, RPO/RTO, dan keamanan deployment belum diukur atau disertifikasi. Jangan gunakan untuk pencatatan keuangan resmi sebelum UAT pengguna dan penyelesaian gap yang relevan.

## Struktur

- `server.js`: HTTP/API, otorisasi server, skema/migrasi SQLite, transaksi, audit, jurnal.
- `auth.js`: TOTP SHA-1 sesuai RFC 6238; password memakai scrypt dengan salt acak.
- `public/`: antarmuka tanpa framework/build, aman dari interpolasi HTML pengguna melalui escaping.
- `scripts/backup.mjs`: backup terenkripsi dan restore.
- `test/`: integrasi API dan alur browser.

Cloud task sudah terisolasi: gunakan checkout ini, tidak perlu membuat Git worktree. Proses server perlu dimulai ulang setelah task dipulihkan; database di `data/` dipertahankan, proses hidup tidak diasumsikan bertahan.
