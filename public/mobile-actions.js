const actions=[
 {label:'Kendaraan Masuk',description:'Pilih kendaraan dan catat keluhan saat masuk bengkel',icon:'car',action:'new-visit',roles:['Super Admin','Finance'],gate:true},
 {label:'Progres & QC',description:'Buka pekerjaan, teknisi, progres, dan hasil QC',icon:'wrench',page:'orders',roles:['Super Admin','Finance','Teknisi']},
 {label:'Persetujuan Estimasi',description:'Buat estimasi dan catat keputusan pelanggan',icon:'chart',page:'estimates',roles:['Super Admin','Admin']},
 {label:'Buat Estimasi',description:'Isi jasa, sparepart, diskon, dan pajak',icon:'plus',action:'new-estimate',roles:['Super Admin','Admin']},
 {label:'Terima Sparepart',description:'Catat penerimaan dan harga modal',icon:'box',action:'receipt',roles:['Super Admin','Admin Stock']},
 {label:'Pembayaran & Invoice',description:'Buka tagihan, pembayaran, dan unduh invoice',icon:'wallet',page:'finance',roles:['Super Admin','Finance']},
 {label:'Pengeluaran Kas',description:'Catat pengeluaran operasional bengkel',icon:'wallet',action:'expense',roles:['Super Admin','Finance']},
 {label:'Tambah Sparepart',description:'Daftarkan kode, rak, supplier, dan harga',icon:'box',action:'new-item',roles:['Super Admin','Admin Stock']},
 {label:'Tambah Kendaraan',description:'Daftarkan kendaraan pelanggan ke master',icon:'car',action:'new-vehicle',roles:['Super Admin','Finance']},
 {label:'Tambah Supplier',description:'Isi alamat dan kontak supplier',icon:'users',action:'new-suppliers',roles:['Super Admin','Admin Stock']},
 {label:'Tambah Rak',description:'Daftarkan lokasi penyimpanan sparepart',icon:'box',action:'new-racks',roles:['Super Admin','Admin Stock']},
 {label:'Tambah Jasa',description:'Tetapkan harga standar jasa untuk estimasi',icon:'wrench',action:'new-catalog-service',roles:['Super Admin','Admin']},
 {label:'Jurnal Manual',description:'Catat jurnal dan referensi transaksi',icon:'file',action:'manual-journal',roles:['Akuntan']},
 {label:'Tutup Periode',description:'Periksa dan tutup periode akuntansi',icon:'shield',action:'period',roles:['Akuntan']},
 {label:'Tambah Akun',description:'Buat akun dan tentukan hak akses',icon:'users',action:'new-user',roles:['Super Admin']}
];
export function mobileActionsFor(user){return actions.filter(a=>a.roles.includes(user.role)&&(!a.gate||user.role!=='Finance'||Boolean(user.gatepass))).map(({roles,gate,...action})=>action)}
