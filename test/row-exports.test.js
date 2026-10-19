import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {recordTableData} from '../public/row-exports.js';
import {counterData} from '../public/counters.js';
import {buildExcelOutput} from '../excel-output.js';

test('Ekspor tabel dan satu baris menjaga kolom field, nilai kosong, kode dan rupiah',async()=>{
 const records=[
  {'Kode Sparepart':'00123','Nama Sparepart':'Bearing · roda / depan','Stok':2,'Harga Jual':'Rp 3.500.000','Nomor Kontak':'081234567890'},
  {'Kode Sparepart':'00002','Nama Sparepart':'Busi','Stok':0,'Harga Jual':null,'Nomor Kontak':'','Catatan':'Baris satu\nBaris dua'}
 ];
 const all=recordTableData(records),single=recordTableData(records,1);
 assert.deepEqual(single.columns,all.columns);
 assert.deepEqual(single.rows,[all.rows[1]]);
 assert.equal(all.rows[0][1],'Bearing · roda / depan');
 assert.equal(all.rows[0][5],'');
 const book=new ExcelJS.Workbook();await book.xlsx.load(await buildExcelOutput({title:'Sparepart',...all}));
 const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('A2').value,'00123');
 assert.equal(sheet.getCell('B2').value,'Bearing · roda / depan');
 assert.equal(sheet.getCell('C2').value,2);assert.equal(sheet.getCell('C3').value,0);
 assert.equal(sheet.getCell('D2').value,3500000);assert.equal(sheet.getCell('E2').value,'081234567890');
 assert.equal(sheet.getCell('F3').value,'Baris satu\nBaris dua');
 assert.deepEqual(sheet.model.merges,[]);
});

test('Rincian counter kendaraan memisahkan nomor polisi, kendaraan, pelanggan dan Work Order',()=>{
 const state={user:{role:'Super Admin'},visits:[{id:4,plate:'B 14 RMY',unit:'Jeep JK',customer:'Taupik',progress:'Selesai',status:'Keluar',exited:'2026-10-16'}]};
 const record=counterData(state,'Pekerjaan Selesai').rows[0].exportFields;
 assert.equal(record['Nomor Polisi'],'B 14 RMY');assert.equal(record.Kendaraan,'Jeep JK');assert.equal(record.Pelanggan,'Taupik');
 assert.equal(record['Nomor Work Order'],'WO-00004');
 assert.equal(record['Status Pekerjaan'],'Selesai');assert.equal(record['Status Kendaraan'],'Keluar');
});
