import {test} from 'node:test';
import assert from 'node:assert/strict';
import {counterData,isCompletedWork} from '../public/counters.js';
const fixture=()=>({user:{role:'Super Admin'},visits:[
 {id:1,plate:'B 1',unit:'Jeep',customer:'A',progress:'Dikerjakan',status:'Di Bengkel',invoice:1,total:1000,paid:400,entered:new Date().toISOString()},
 {id:2,plate:'B 2',unit:'Toyota',customer:'B',progress:'Selesai',status:'Siap Keluar',invoice:2,total:2000,paid:2000},
 {id:3,plate:'B 3',unit:'BMW',customer:'C',progress:'Selesai',status:'Keluar',exited:'2020-01-01',invoice:3,total:500,paid:0}],
 items:[{sku:'A',name:'Oli',category:'Pelumas',qty:2,minimum:3,cost:100},{sku:'B',name:'Filter',category:'Filter',qty:8,minimum:2,cost:50}],
 payments:[{invoice:1,amount:400},{invoice:2,amount:2000}],
 lines:[{visit:1,item:1,qty:3,returned:1,cost:100,description:'Oli'},{visit:2,item:2,qty:1,returned:0,cost:50,description:'Filter'},{visit:99,item:1,qty:10,returned:0,cost:100}],
 movements:Array.from({length:45},(_,id)=>({id,qty:1})),approvals:[{status:'Diajukan',kind:'Harga',source:1},{status:'Disetujui'}]});
test('Counter kendaraan memakai status dan progres yang sesuai, termasuk tanpa pemotongan daftar',()=>{
 const s=fixture();assert.deepEqual(counterData(s,'Kendaraan di Bengkel').rows.map(r=>r.visitId),[1,2]);assert.deepEqual(counterData(s,'Work Order Aktif').rows.map(r=>r.visitId),[1]);assert.deepEqual(counterData(s,'Siap Keluar').rows.map(r=>r.visitId),[2]);assert.equal(counterData(s,'Kendaraan Masuk Hari Ini').total,1);
 s.visits=Array.from({length:40},(_,i)=>({...s.visits[0],id:i+1}));const d=counterData(s,'Kendaraan di Bengkel');assert.equal(d.total,40);assert.equal(d.rows.length,40);
});
test('Stok kritis, jumlah unit, nilai stok, dan kategori sesuai dengan rincian',()=>{
 const s=fixture();assert.equal(counterData(s,'Stok Kritis').rows[0].values[0],'A');assert.equal(counterData(s,'Stok Kritis').total,1);assert.equal(counterData(s,'Unit Tersedia').total,10);const stock=counterData(s,'Nilai Persediaan');assert.equal(stock.total,600);assert.equal(stock.rows.reduce((sum,r)=>sum+r.values[6],0),stock.total);assert.equal(counterData(s,'Kategori').total,2);assert.equal(counterData(s,'Perlu Perhatian').total,2);
});
test('Rincian pembayaran, piutang, dan invoice aktif merekonsiliasi total',()=>{
 const s=fixture();const cash=counterData(s,'Penerimaan Kas');assert.equal(cash.total,2400);assert.equal(cash.rows.reduce((sum,r)=>sum+r.values[4],0),cash.total);const debts=counterData(s,'Piutang Pelanggan');assert.deepEqual(debts.rows.map(r=>r.visitId),[1,3]);assert.equal(debts.total,1100);assert.equal(counterData(s,'Invoice Aktif').total,debts.rows.length);assert.equal(counterData(s,'Penjualan').total,3500);
});
test('HPP dan laba kotor mengecualikan transaksi belum terinvoice dan memperhitungkan retur',()=>{
 const s=fixture();assert.equal(counterData(s,'HPP Sparepart').total,250);const profit=counterData(s,'Laba Kotor');assert.equal(profit.total,3250);assert.equal(profit.rows.reduce((sum,r)=>sum+r.values[4],0),profit.total);
});
test('Daftar mutasi lengkap dan counter nol mempunyai daftar kosong',()=>{
 assert.equal(counterData(fixture(),'Total Mutasi').rows.length,45);const s={user:{role:'Super Admin'}};for(const label of ['Work Order Aktif','Stok Kritis','Nilai Persediaan','Invoice Aktif','Pembayaran Diterima','HPP Sparepart','Laba Kotor']){const data=counterData(s,label);assert.equal(data.total,0,label);assert.equal(data.rows.length,0,label)}
});
test('Rincian tetap mengikuti hak akses peran',()=>{const s=fixture();s.user.role='Teknisi';assert.equal(counterData(s,'Penerimaan Kas'),null);assert.equal(counterData(s,'Nilai Persediaan'),null);assert.ok(counterData(s,'Work Order Aktif'));s.user.role='Admin Stock';assert.ok(counterData(s,'Nilai Persediaan'));assert.equal(counterData(s,'Laba Kotor'),null)});

test('Counter Estimasi Disetujui menampilkan kesepakatan dan harga deal yang sama dengan status',()=>{const state={user:{role:'Admin'},estimates:[{id:1,plate:'B 1',customer:'Budi',status:'Estimasi Disetujui',total:150000,deal_price:140000},{id:2,status:'Menunggu Persetujuan',total:100000,deal_price:null}]};const detail=counterData(state,'Estimasi Disetujui');assert.equal(detail.total,1);assert.deepEqual(detail.rows[0].values.slice(-3),[150000,140000,'Estimasi Disetujui']);assert.equal(counterData({...state,user:{role:'Teknisi'}},'Estimasi Disetujui'),null)});


test('Card master dan rinciannya hanya menghitung data aktif, termasuk status tipe kendaraan',()=>{
 const state={user:{role:'Super Admin'},vehicles:[{id:1,model_id:1,active:1,model_active:1},{id:2,model_id:1,active:0,model_active:1},{id:3,model_id:2,active:1,model_active:0},{id:4,model_id:2,active:1}],vehicle_models:[{id:1,label:'Aktif',active:1},{id:2,label:'Nonaktif',active:0}],service_catalog:[{id:1,active:1},{id:2,active:0}],items:[{sku:'ON',active:1,fitment_mode:'universal',qty:2,cost:100,minimum:3,category:'Aktif'},{sku:'OFF',active:0,fitment_mode:'universal',qty:10,cost:1000,minimum:20,category:'Nonaktif'}]};
 for(const label of ['Kendaraan Terdaftar','Tipe Kendaraan','Sparepart Terpetakan','Total Jasa Katalog','Total Kode Sparepart','Stok Kritis','Kategori']){const data=counterData(state,label);assert.equal(data.total,1,label);assert.equal(data.rows.length,1,label)}
 assert.equal(counterData(state,'Unit Tersedia').total,2);assert.equal(counterData(state,'Nilai Persediaan').total,200);
 state.vehicles[0].active=0;state.vehicle_models[0].active=0;state.service_catalog[0].active=0;
 for(const label of ['Kendaraan Terdaftar','Tipe Kendaraan','Total Jasa Katalog'])assert.equal(counterData(state,label).total,0,label);
});


test('Dashboard master menghitung supplier/rak aktif serta rincian kelengkapan',()=>{
 const state={user:{role:'Super Admin'},suppliers:[{code:'SUP-1',name:'Aktif',active:1,address:'Bandung',phone:'0812'},{code:'SUP-2',name:'Kurang',active:1,address:'',phone:''},{code:'SUP-3',name:'Off',active:0,address:'',phone:''}],racks:[{code:'R-1',active:1},{code:'R-2',active:0}],items:[{sku:'1',fitment_mode:'unverified'},{sku:'2',active:0,fitment_mode:'unverified'}]};
 assert.equal(counterData(state,'Supplier Aktif').total,2);assert.equal(counterData(state,'Rak Aktif').total,1);assert.equal(counterData(state,'Supplier Belum Lengkap').total,1);assert.equal(counterData(state,'Sparepart Belum Dipetakan').total,1);
 state.user.role='Teknisi';assert.equal(counterData(state,'Supplier Aktif'),null);assert.equal(counterData(state,'Rak Aktif'),null);
});
test('Dashboard akuntansi merekonsiliasi hutang supplier, pengeluaran, jurnal dan periode sesuai akses',()=>{
 const state={user:{role:'Super Admin'},movements:[{id:1,type:'Penerimaan',qty:2,cost:100000},{id:2,type:'Penerimaan',qty:1,cost:50000},{id:3,type:'Pemakaian',qty:-1,cost:100000}],supplier_payments:[{movement:1,amount:70000},{movement:2,amount:50000}],expenses:[{amount:25000},{amount:15000}],journals:[{source:'J1',entries:JSON.stringify([{debit:100},{credit:100}])}],periods:[{month:'2026-09',closed:1},{month:'2026-10',closed:0}]};
 const debts=counterData(state,'Hutang Supplier');assert.equal(debts.total,130000);assert.equal(debts.rows.length,1);assert.equal(debts.rows[0].values[4],debts.total);assert.equal(counterData(state,'Pengeluaran Operasional').total,40000);assert.deepEqual(counterData(state,'Jurnal Terposting').rows[0].values.slice(-2),[100,100]);assert.equal(counterData(state,'Periode Terkunci').total,1);
 state.user.role='Finance';assert.equal(counterData(state,'Jurnal Terposting'),null);assert.equal(counterData(state,'Hutang Supplier').total,130000);
 state.user.role='Admin Stock';for(const label of ['Hutang Supplier','Pengeluaran Operasional','Jurnal Terposting','Periode Terkunci'])assert.equal(counterData(state,label),null,label);
});

test('Pekerjaan selesai terpisah dari antrean dan kembali aktif jika pengerjaan dibuka kembali',()=>{
 const s=fixture();s.visits.push({id:4,progress:'QC',status:'Di Bengkel'});assert.deepEqual(counterData(s,'Pekerjaan Selesai').rows.map(r=>r.visitId),[2,3]);assert.deepEqual(counterData(s,'Antrean Pekerjaan').rows.map(r=>r.visitId),[1,4]);assert.equal(isCompletedWork(s.visits[3]),false);
 s.visits[1].progress='Dikerjakan';s.visits[1].qc=0;s.visits[1].status='Di Bengkel';assert.deepEqual(counterData(s,'Pekerjaan Selesai').rows.map(r=>r.visitId),[3]);assert.deepEqual(counterData(s,'Antrean Pekerjaan').rows.map(r=>r.visitId),[1,2,4]);
});
