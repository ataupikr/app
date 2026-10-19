# 26 Motor Premium - Android

APK internal untuk Android 10 atau lebih baru. Aplikasi memakai server bengkel yang sama, bukan database terpisah.

1. Jalankan `npm start` di komputer server.
2. Hubungkan HP dan server ke jaringan yang saling dapat diakses.
3. Unduh `output/android/26Motor-Premium-1.1.0.apk`, atau buka `http://ALAMAT-SERVER:3000/downloads/26motor-premium.apk` dari HP.
4. Pasang APK melalui pengelola file Android.
5. Pada aplikasi, isi alamat server, contoh `http://192.168.1.10:3000`, kemudian Hubungkan. Jangan gunakan 127.0.0.1 pada HP untuk menunjuk komputer.
6. Login dengan akun aplikasi bengkel yang sudah ada. Hak akses tetap diperiksa server.

Untuk akses internet, gunakan alamat HTTPS dengan sertifikat valid. Komputer server harus tetap menyala. Aplikasi tidak menyimpan transaksi offline. Jika koneksi gagal, periksa alamat, Wi-Fi, dan izin akses port server pada pengaturan jaringan komputer.

Dokumen PDF/CSV/Excel tersimpan di Download/26Motor. Cetak Gate Pass memakai dialog cetak Android. Tombol kembali menutup form/menu sebelum kembali ke halaman sebelumnya. Tombol Server mengubah alamat koneksi.

Build ulang: `./android/build.ps1`. Build memakai JDK 17, platform Android 35 dan Build Tools 35 yang disimpan lokal di android/tools (tidak masuk source control). Metadata dan checksum unduhan resmi disimpan di folder tools. Proyek Java tidak memakai library pihak ketiga.

Kunci penandatanganan internal disimpan di android/signing (diabaikan Git). Simpan cadangan folder tersebut secara aman agar APK pembaruan dapat memakai identitas yang sama. Jangan bagikan folder signing bersama APK.

Validasi: Java dikompilasi, resource APK diperiksa aapt2, signature APK diverifikasi apksigner, alur mobile web diperiksa dalam browser. Pengujian pada HP Android fisik belum dilakukan.
