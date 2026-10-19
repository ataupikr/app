# 26 Motor — Bengkel Santai

Aplikasi web operasional bengkel berbahasa Indonesia, berdasarkan PRD versi 1.0 (15 Oktober 2026). Implementasi MVP awal dengan server Node.js 24, database SQLite persisten, antarmuka responsif, dan tanpa layanan eksternal untuk operasional dasar. Data instalasi awal kosong; pengujian memakai database sementara yang terpisah.

## Menjalankan

```bash
cd /workspace/app
npm ci --cache /tmp/26motor-npm-cache
npm start
```

Node.js >=24 wajib (menggunakan `node:sqlite`). Port default 3000, dapat diubah dengan `PORT`. `DATA_DIR` menentukan lokasi database; default `data/`. Tidak ada proses build frontend.

Akun awal `admin@26motor.local` dibuat hanya pada database baru. Kata sandi acak tersedia di file lokal **data/initial-access.txt**, berizin 0600; tidak dipublikasikan di antarmuka atau log. Untuk provisioning otomatis, `INITIAL_PASSWORD` dapat disuntikkan secara aman sebelum startup pertama. Jangan simpan nilainya ke Git. Login menggunakan email dan kata sandi. MFA dinonaktifkan untuk seluruh peran. Kata sandi dapat diubah lewat avatar kanan atas. Tidak ada akun bersama atau kata sandi default tetap.

## Alur yang tersedia

1. Super Admin membuat akun Teknisi, Admin Stock, Finance, dan Akuntan. Izin Gate Pass Finance diberikan secara eksplisit dan dapat dicabut. Akun dapat dinonaktifkan dan kata sandi direset; sesi akun langsung dicabut.
2. Finance berizin / Super Admin mencatat pelanggan, kendaraan, pengantar, kondisi, aksesori, kilometer, dan keluhan. Nomor kunjungan, WO dan IN otomatis. Gate Pass IN dapat dicetak.
3. Finance menetapkan teknisi dan mencatat bukti persetujuan pelanggan. Teknisi melihat tugas sendiri dan memperbarui progres sampai QC / Selesai.
4. Admin Stock mengelola master Kode Sparepart, penerimaan, reservasi, pemakaian dan retur. Pemakaian menyimpan snapshot harga dan modal, serta jurnal barang dalam proses. Reservasi tidak mengurangi stok fisik atau membuat HPP; reservasi aktif harus diproses/dibatalkan sebelum invoice.
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

Tes integrasi menjalankan server nyata dengan database sementara. Tes browser memakai Playwright Core dan Chromium `/usr/bin/chromium` (ganti melalui `CHROMIUM_PATH`), mencakup login tanpa MFA, akun, master stok, IN, WO, QC, invoice, pembayaran, OUT, cetak PDF, seluruh navigasi, dan overflow mobile. Screenshot/PDF tes berada di `/tmp/26motor-*`; data tes tidak masuk ke database operasional.

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
- Pencarian riwayat lintas kendaraan lanjutan, nomor mesin, test drive sementara, pembatalan OUT berotorisasi dengan dokumen koreksi.
- Retur supplier, stok karantina, konfirmasi penerimaan part oleh teknisi, rekalkulasi transaksi mundur, dan persetujuan nilai migrasi awal lintas petugas.
- Diskon per item, ambang margin terkonfigurasi, pajak, DP sebelum invoice, jatuh tempo dan aging piutang/hutang, rekonsiliasi kas harian, reversal / credit note. Saat ini dokumen terposting dikunci; koreksi invoice belum tersedia.
- Chart of accounts terkonfigurasi, laporan keuangan lengkap, XLSX/PDF laporan umum, dan ekspor khusus setiap modul. Cetak PDF saat ini khusus Gate Pass.
- Daftar sesi aktif, workflow reset akses melalui email, monitoring, scheduler backup dan kebijakan retensi.

HTTPS perlu disediakan reverse proxy deployment; set `SECURE_COOKIE=1` pada deployment HTTPS. Database dan backup harus di volume persisten, bukan filesystem sementara. Pastikan waktu server sinkron untuk TOTP. Tetapkan kebijakan retensi dan akun persetujuan berbeda sebelum operasional. Target p95 <3 detik pada 20 pengguna/100.000 mutasi, SLA 99,5%, RPO/RTO, dan keamanan deployment belum diukur atau disertifikasi. Jangan gunakan untuk pencatatan keuangan resmi sebelum UAT pengguna dan penyelesaian gap yang relevan.

## Struktur

- `server.js`: HTTP/API, otorisasi server, skema/migrasi SQLite, transaksi, audit, jurnal.
- Password memakai scrypt dengan salt acak.
- `public/`: antarmuka tanpa framework/build, aman dari interpolasi HTML pengguna melalui escaping.
- `scripts/backup.mjs`: backup terenkripsi dan restore.
- `test/`: integrasi API dan alur browser.

Cloud task sudah terisolasi: gunakan checkout ini, tidak perlu membuat Git worktree. Proses server perlu dimulai ulang setelah task dipulihkan; database di `data/` dipertahankan, proses hidup tidak diasumsikan bertahan.

## Master Data Kendaraan

Menu **Master Kendaraan** menyimpan tipe (merek, model, varian, mesin, rentang tahun) dan kendaraan pelanggan (nomor polisi, pemilik, telepon, tahun, VIN). Super Admin dan Finance mengelola kendaraan; Admin Stock juga dapat mengelola tipe dan kecocokan sparepart. Teknisi membaca kendaraan sesuai tugasnya.

Kendaraan Masuk memilih kendaraan aktif dari master; identitas diisi otomatis. Kendaraan dan tipe baru dapat ditambahkan langsung dari form tanpa kehilangan draft. Kunjungan menyimpan relasi dan snapshot identitas, sehingga perubahan master tidak mengubah dokumen lama. Data kunjungan lama dimigrasikan sekali ke master; merek/varian hasil migrasi dapat dilengkapi kemudian.

Pada Persediaan Sparepart, gunakan **Relasi Kendaraan** untuk memilih Universal atau Khusus satu/beberapa tipe. Pemakaian dan reservasi menolak sparepart khusus yang tidak sesuai tipe work order. Data sparepart lama berstatus **belum dipetakan** tetap dapat digunakan dan perlu dilengkapi petugas; status tersebut tidak dihitung sebagai kecocokan terverifikasi. Tidak ada penghapusan master: nonaktifkan data agar riwayat dan relasi tetap tersimpan.

## Persetujuan Estimasi

Menu **Persetujuan Estimasi** tersedia hanya untuk **Super Admin** dan peran baru **Admin**. Super Admin membuat akun Admin pada Akun & Hak Akses. Peran Admin khusus mengisi estimasi dan mencatat keputusan pelanggan; tidak memperoleh hak posting stok, invoice, jurnal, atau pengelolaan akun.

Pilih kendaraan master dan opsional kunjungan terkait. Tambahkan jasa (harga manual) serta sparepart (harga jual dari inventory dan filter kecocokan kendaraan). Stok tersedia ditampilkan, termasuk peringatan kekurangan; estimasi tidak mengurangi stok, menahan stok, atau menerbitkan invoice. Harga tersimpan sebagai snapshot dan dapat dimuat ulang melalui **Perbarui Harga / Stok**.

Perhitungan: subtotal jasa + sparepart, dikurangi diskon nominal rupiah atau persentase, lalu pajak persentase atas nilai setelah diskon. Tarif pajak diisi petugas; default 0%. Nominal dibulatkan per baris ke rupiah. Total di server dihitung ulang untuk mencegah manipulasi harga dan total dari browser.

Keputusan pelanggan: **Menunggu Persetujuan**, **Estimasi Disetujui**, **Di Negosiasi**, atau **Tidak Jadi**. Catatan/bukti wajib untuk status disetujui, di negosiasi, atau tidak jadi dan dicatat oleh petugas, beserta waktu serta revisi estimasi. Revisi isi estimasi mereset keputusan ke Menunggu Persetujuan; riwayat revisi dan keputusan tetap tersimpan. Nilai simulasi tersimpan terpisah dari invoice operasional.

## Katalog Harga Jasa

Menu **Katalog Jasa** dikelola Super Admin dan Admin. Isi kode unik, nama, kategori, satuan, harga standar, dan catatan. Jasa dapat dinonaktifkan tanpa menghapus riwayat.

Pada baris jasa estimasi, pilih **Jasa dari katalog** agar nama serta harga standar terisi. **Harga estimasi / satuan** tetap dapat diubah untuk konsumen tersebut, dengan catatan penyesuaian opsional. Harga katalog tidak berubah. Acuan harga standar dan harga khusus tersimpan pada rincian estimasi. Pilih **Gunakan Harga Standar Terbaru** untuk memuat ulang tarif katalog secara eksplisit. Perubahan katalog tidak mengubah estimasi lama. Jasa manual/khusus tetap tersedia. Revisi harga estimasi mengikuti aturan persetujuan: kembali ke Menunggu.

Master Supplier dan Master Rak dikelola Super Admin/Admin Stock. Kode SUP-00001 dan RAK-00001 dibuat otomatis dan tetap saat nama diubah. Supplier memuat nama, alamat, nomor kontak, PIC, email, dan catatan. Rak memuat nama, zona/area, dan catatan. Pilihan pada form sparepart menyimpan supplier_id/rack_id; data nonaktif tidak ditawarkan untuk relasi baru. Data teks lama dimigrasikan ke master otomatis, sementara kontak dan alamat perlu dilengkapi melalui Edit. Perubahan master tercatat di Audit Trail dan memiliki pemeriksaan versi untuk mencegah edit tertimpa.

Panduan proses: setiap menu memiliki panel Panduan Alur. Form menampilkan Isi data → Periksa isian → Simpan data berdasarkan validitas isian dan respons penyimpanan. Detail kunjungan menunjukkan progres aktual dari IN, pengerjaan, QC, invoice, pembayaran atau piutang disetujui, hingga OUT. Tampilan Teknisi/Admin Stock tidak memuat tahap keuangan. Step bar hanya memberi panduan dan tidak menggantikan validasi server.

Kendaraan Masuk dapat diedit oleh Super Admin dan Finance berizin Gate Pass sebelum invoice atau OUT. Edit menjaga nomor kunjungan, waktu masuk, dan snapshot master untuk kendaraan yang sama. Penggantian kendaraan ditolak jika sudah ada rincian, reservasi, atau estimasi. Penugasan menggunakan visit_technicians dan PIC harus anggota tim; seluruh anggota mendapatkan akses tugas/progres/reservasi sesuai peran Teknisi. Penugasan tunggal lama dimigrasikan menjadi tim satu anggota dengan PIC yang sama. Perubahan kunjungan dan tim dicatat di Audit Trail.

Dokumen estimasi: tombol Unduh PDF Customer menghasilkan PDF A4 berlogo dengan rincian harga jual, diskon, pajak, total estimasi dan harga deal (bila ada). Modal, margin, stok internal, catatan penyesuaian harga jasa, bukti keputusan, dan audit tidak diekspor. Catatan untuk customer pada editor estimasi ikut dicetak. Harga Deal dicatat melalui keputusan Estimasi Disetujui sebagai total akhir kesepakatan, terpisah dari hitungan estimasi dan invoice. Revisi isi estimasi menghapus harga deal dan mengembalikan status Menunggu Persetujuan. Dokumen memakai pemeriksaan revisi dan versi keputusan agar unduhan dari tampilan lama ditolak.

Tanggal dokumen: PDF estimasi menampilkan tanggal penerbitan awal (created), serta tanggal revisi tersimpan bila ada. Keputusan pelanggan tidak mengubah tanggal tersebut. Invoice menampilkan tanggal penerbitan dari invoices.created; unduhan PDF Invoice tersedia pada bagian Tagihan & Serah Terima untuk Super Admin, Finance, dan Akuntan.

Persetujuan estimasi dan Work Order: estimasi terbaru yang terkait kunjungan menjadi acuan. Menunggu Persetujuan -> Menunggu Persetujuan Pelanggan; Di Negosiasi -> Di Negosiasi; Tidak Jadi -> Tidak Jadi; Estimasi Disetujui -> Siap Dikerjakan. Teknisi memulai Dikerjakan secara manual setelah persetujuan. Revisi estimasi mengembalikan pekerjaan yang belum QC ke menunggu persetujuan. Status QC, selesai, invoice, dan kendaraan keluar tidak diturunkan otomatis. Estimasi tanpa kunjungan terkait tidak mengubah Work Order; estimasi lama tidak menimpa keputusan estimasi terbaru. Sinkronisasi dicatat di riwayat estimasi dan audit.

Dashboard tersedia pada setiap kategori sidebar: Dashboard Operasional memantau kendaraan, progres WO dan kesiapan pekerjaan; Dashboard Master Data merangkum master aktif serta kelengkapan supplier dan pemetaan sparepart; Dashboard Akuntansi merangkum seluruh invoice, pembayaran pelanggan, piutang, hutang penerimaan sparepart dan pengeluaran operasional. Semua card menampilkan rincian yang sama dengan totalnya. Dashboard Akuntansi hanya tersedia untuk Super Admin, Finance dan Akuntan; jurnal/periode hanya untuk Super Admin dan Akuntan.

Versi mobile: halaman Aksi Mobile menampilkan aksi sesuai peran. Navigasi bawah tersedia pada layar HP; tabel berubah menjadi kartu berlabel, form menjadi layar penuh, tombol simpan tetap terjangkau. APK Android internal tersedia di output/android dan tautan /downloads/26motor-premium.apk; panduan koneksi dan build ada di android/README.md. Android memakai server yang sama, termasuk sesi akun dan otorisasi. PDF/CSV/Excel disimpan melalui penyimpanan Download Android, cetak Gate Pass memakai PrintManager. Shell web dapat dicache di secure context; API dan data pelanggan tidak masuk cache service worker, dan transaksi tidak diantrekan offline.

Impor FORM SPAREPART.xlsx (16 Oktober 2026): pilihan pengguna adalah master + saldo akhir, dengan riwayat Excel sebagai arsip tanpa posting ulang. Sumber, SHA256, formula dan baris mentah tersimpan pada inventory_imports dan data/imports; kode/nama dipertahankan, duplikasi hash dicegah. Saldo 530GT memakai master (56 Ltr); DCTF, kode 1, 2, 8 dihitung dari saldo awal dan transaksi yang tersedia, dengan catatan pada item. Harga modal rata-rata dan harga jual tidak diasumsikan dari catatan pembelian lama. Nilai NULL ditampilkan Belum diisi; total nilai persediaan ditandai Belum lengkap bila ada stok positif tanpa modal. Tombol Lengkapi Harga menginisialisasi modal/harga yang masih kosong dan mencatat penilaian saldo awal sekali. Pemakaian dan penambahan stok dengan modal saldo awal yang belum lengkap ditolak untuk menjaga perhitungan biaya. Arsip pembayaran dibatasi Super Admin, Finance dan Akuntan; Admin Stock hanya membaca lembar stok.

Output dokumen: preview PDF tersedia untuk estimasi, invoice, dan Gate Pass IN/OUT, dengan navigasi halaman, zoom, dan unduh. PDF.js disajikan dari public/vendor (salinan legacy build pdfjs-dist 5.4.624; perbarui worker dan viewer bersama). API dokumen tetap memeriksa sesi dan akses. Tombol Excel pada setiap baris dan Ekspor Tabel Excel menghasilkan XLSX dari kolom yang sedang ditampilkan sesuai filter dan hak akses; kolom aksi tidak disertakan. Rupiah tunggal menjadi nilai numerik berformat mata uang; kode/kontak dipertahankan sebagai teks. Batas ekspor 5.000 baris, 50 kolom, dan batas request JSON 1 MB. Android memerlukan APK 1.1.0 untuk unduhan XLSX native.

Pendataan Kendaraan Masuk menggantikan menu Kendaraan & Gate Pass. Daftar hanya memuat nomor pendaftaran, waktu masuk, kendaraan/pelanggan dan keluhan, dengan Lihat Data, Edit dan Excel. Form memilih kendaraan dari master dan mengisi keluhan; kilometer/pengantar opsional serta kondisi/aksesori dalam bagian tambahan. Tim teknisi dan PIC dikelola melalui Work Order; edit penerimaan mempertahankan penugasan yang sudah ada dan tetap memeriksa edit_version. Pembuatan kunjungan tidak mengubah alur backend; detail lengkap, Gate Pass, progres, estimasi, invoice dan serah terima tetap tersedia dari Work Order/Keuangan.

Estimasi menerima sparepart manual melalui tombol Sparepart Manual atau pilihan Sumber sparepart; isi nama, kode opsional, jumlah, dan harga. Baris part tanpa item_id ditampilkan sebagai manual dan tidak diperiksa sebagai stok inventory. API mewajibkan manual=true dan menolak kombinasi dengan item_id; harga inventory tetap diperiksa server. Jasa Manual memakai nama/harga khusus tanpa service_id. Kedua jenis baris masuk perhitungan, diskon/pajak, revisi, PDF, dan Excel; tidak membuat master, mutasi stok, reservasi, atau jurnal. Ketersediaan sparepart manual perlu dikonfirmasi untuk pengadaan.

Rincian estimasi dan Work Order: state menyertakan work_order_estimates dari estimasi terbaru per kunjungan, berisi rencana jasa/sparepart, kuantitas, status, serta harga/diskon/pajak/deal bagi peran keuangan dan Admin. Teknisi/Admin Stock hanya menerima rincian operasional rencana. Estimasi tanpa kunjungan dapat dihubungkan oleh Super Admin/Admin ke Work Order terbuka untuk kendaraan/pelanggan yang sama melalui link-estimate-visit, dengan pemeriksaan versi dan jejak riwayat. Tombol Catat Jasa/Pakai Sparepart mengambil jumlah dan harga snapshot dari estimasi disetujui; lines menyimpan estimate_id, estimate_revision, estimate_line_id. Pengiriman ulang dicegah oleh pemeriksaan sumber dan indeks unik. Sparepart manual dipetakan ke inventory sebelum pemakaian; tidak diasumsikan memiliki modal nol. Stok, reservasi, dan jurnal mengikuti proses pemakaian atomik yang sama. Realisasi dari revisi berbeda atau rincian serupa yang sudah diinput manual memerlukan rekonsiliasi sebelum tambahan dari rencana; data aktual tidak ditimpa otomatis. Invoice akhir memakai snapshot estimasi terbaru yang disetujui, termasuk diskon, pajak, dan penyesuaian harga deal. Realisasi sparepart harus selesai sebelum penerbitan setelah QC.

Pembayaran estimasi dan invoice: billing.js menautkan invoices.estimate_id/revision serta snapshot dokumen. Tagihan mengikuti harga deal akhir (atau total estimasi bila tanpa deal); DP dapat diterima pada estimasi disetujui sebelum QC/invoice. Pembayaran sebelum invoice masuk Uang muka pelanggan, lalu diperhitungkan terhadap Piutang usaha saat invoice akhir terbit. Jenis pembayaran: DP bertahap, Pelunasan sesudah DP, Lunas Langsung tanpa DP sebelumnya. request_id unik mencegah pengiriman ganda; pembayaran berlebih dan periode terkunci ditolak atomik. Estimasi yang sudah menerima pembayaran dikunci dari revisi/perubahan nilai agar saldo uang muka tetap konsisten. Cashback nominal per pembayaran dicatat pada cashbacks dan expenses kategori Cashback pelanggan, dengan jurnal Beban cashback terhadap Kas/Bank, tanpa mengurangi jumlah pelunasan pelanggan. Cashback dan catatan internal tidak dikirim ke pembuat dokumen invoice; PDF hanya memuat rincian estimasi, total/deal, pembayaran, sisa, dan status. Akses pencatatan: Super Admin/Finance. Menu Keuangan menyediakan DP & Pembayaran Estimasi Disetujui, serta status invoice Belum dibayar/DP/Lunas.

Menu Pekerjaan Selesai berada di bawah Persetujuan Estimasi pada sidebar Operasional, serta tersedia pada Dashboard & Menu di Aksi Mobile. Menampilkan kunjungan dengan progres Selesai atau sudah keluar, dengan pencarian, filter Siap Keluar/Keluar, rincian dan ekspor Excel. Work Order menampilkan pekerjaan yang belum selesai; counter Antrean Pekerjaan mengikuti pemisahan ini. Membuka kembali progres pekerjaan tanpa invoice mengembalikan data ke antrean. Hak akses rincian mengikuti data kunjungan dan peran yang diberikan server.

Ekspor Excel per tabel dan per baris memakai field terpisah dari data sumber: nomor polisi, kendaraan, pelanggan, Work Order, teknisi/PIC, status; estimasi/revisi, jasa, sparepart, diskon, pajak dan harga deal; kode/nama sparepart, merek, kategori, kode/nama rak, stok/satuan/tersedia/minimum, margin/markup; serta field master, invoice, pembayaran dan jurnal. Kolom opsional tetap tersedia dengan sel kosong. Jurnal mengulang sumber, tanggal dan keterangan pada setiap akun agar ekspor satu baris tetap lengkap. Filter dan batas daftar yang sedang tampil tetap berlaku; format tampilan aplikasi tidak berubah.

Dashboard Kunjungan tersedia di kategori Operasional dan pemilih dashboard. Peringkat memakai jumlah pendataan kendaraan masuk pada periode inklusif WIB, termasuk kunjungan berjalan dan selesai; master kendaraan/tipe nonaktif dikecualikan. Identitas kendaraan memakai master ID (atau nomor polisi ternormalisasi untuk data lama). Tersedia periode bebas, Bulan Ini, Tahun Ini, Semua Waktu, pencarian, ringkasan yang dapat dibuka, grafik 5 kendaraan terbanyak, rekap lengkap, riwayat kunjungan dan ekspor Excel per field. Teknisi hanya menghitung kunjungan yang tersedia sesuai penugasan akun.

CRM memiliki kelompok sidebar tersendiri berisi Dashboard Kunjungan dan Reminder Service Rutin. Reminder dikelola Super Admin, Admin, dan Finance: kendaraan aktif, jenis servis, tanggal terakhir/berikutnya, interval bulan, target kilometer opsional dan catatan. Ringkasan jatuh tempo (terlambat/hari ini/7 hari), filter status, pencarian dan ekspor Excel tersedia. Salin Pesan menyiapkan teks untuk pengiriman manual; pencatatan kontak menyimpan saluran, waktu dan catatan. Reminder selesai dapat menjadi dasar pembuatan jadwal berikutnya; pembuatan tetap dikonfirmasi melalui formulir. Perubahan memakai version untuk mencegah penimpaan, menolak reminder aktif ganda kendaraan/jenis servis, dan menyimpan riwayat tindak lanjut. Tabel crm_reminders/crm_reminder_events tersimpan dalam database SQLite yang sama. Skrip pembersihan mengklasifikasikan keduanya sebagai data transaksi dan menghapus event terlebih dahulu; skrip tersebut tidak dijalankan saat penambahan fitur ini.

Reminder Service Rutin menampilkan kolom Sisa Hari Service dan hitung mundur pada detail. Selisih dihitung menurut tanggal kalender WIB, dengan status hari ini atau terlambat; reminder selesai/dibatalkan tidak memiliki sisa hari. Ekspor Excel memisahkan angka selisih hari dan keterangannya. Halaman daftar menghitung ulang setelah pergantian hari (pemeriksaan setiap menit) saat tidak ada dialog terbuka.

CRM menampilkan Jadwal Kendaraan Masuk & Kepadatan Bengkel: pilihan tanggal, jadwal terdekat, kendaraan unik pada tanggal terpilih, rincian reminder pada tanggal sama, kendaraan yang saat ini belum keluar, dan rekap tanggal mulai hari ini dengan minimal dua kendaraan. Beberapa reminder servis untuk satu kendaraan dihitung sekali per tanggal. Jadwal bersumber dari tanggal reminder aktif; bukan booking terkonfirmasi atau jadwal jam kedatangan. Kendaraan master nonaktif dan reminder selesai/dibatalkan dikecualikan. Ringkasan kepadatan memakai seluruh reminder aktif dan tetap terpisah dari pencarian/filter daftar reminder. Tabel jadwal/rincian mendukung ekspor Excel per field.

CRM → Rencana Mobil Masuk menyimpan kendaraan master, reminder sumber opsional, tanggal/jam WIB, keperluan servis, keluhan, catatan dan status Direncanakan/Dikonfirmasi/Sudah Masuk/Dibatalkan/Tidak Hadir. Admin, Super Admin dan Finance mengelola rencana; proses Kendaraan Datang serta penautan ke kunjungan aktual mengikuti hak Super Admin/Finance dan izin Gate Pass. Rencana bisa dibuat dari detail reminder. Agenda bengkel menggabungkan rencana dan reminder yang belum direncanakan; reminder sumber tidak dihitung dua kali. Pembatalan melepaskan reminder ke agenda asal. Kendaraan datang menggunakan form penerimaan yang sama, mengisi kendaraan/keluhan dari rencana dan membuat kunjungan/Work Order satu kali meski request diulang. Kunjungan manual yang sesuai dapat ditautkan tanpa dibuat ulang. Detail rencana, reminder, penerimaan dan WO menyediakan navigasi silang; Gate Pass IN, estimasi, stok, invoice dan pembayaran tetap mengikuti alur kunjungan aktual. Menyimpan rencana tidak memposting stok, jurnal atau tagihan. Riwayat perubahan, version, pembatasan duplikasi dan ekspor Excel per field disediakan. Tabel arrival_plans/arrival_plan_events adalah data transaksi; skrip pembersihan memperhitungkan urutan FK tanpa dijalankan pada pengerjaan ini.
